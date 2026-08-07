# Phase 9 — Persistence, undo, and autosave at scale

Size: **M** · Depends on: **Phase 8** (state shape is final before serialization work) · Blocks:
**Phase 12** (final matrix)

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) first — Phases 1–8
land before you and may have moved every line anchor cited below. This phase makes persistence
and undo survive a 1K-column table with deep history: routine autosaves become small and bounded,
undo/redo stacks leave the routine save path, snapshots share structure, restore becomes O(C),
the teardown save becomes cheap, and quota exhaustion turns from a silent latch into a loud,
documented, recoverable degradation. **Old persisted sessions must restore forever** — enforced
by fixtures you commit before touching any writer.

Relevant README sections: §5.F (state/persistence hazards), §6 (WIDE tier: 1,000 × 100K), §8
(protocol), Glossary (budgets, gates).

## 2. Problem statement

All anchors are branch-point references — re-locate before acting (README §5 preamble).

- **Every debounced autosave serializes the full undo + redo stacks — and teardown reruns it
  synchronously.** `snapshotFromState` (`src/persistence/serialization.ts:153-254`) serializes 8
  state collections, then maps both stacks through `serializeWithPool` (`:185-218`, attached at
  `:220-221`). At 1K columns a stack entry is 3 × 1K-string arrays + a 1K-entry widths record +
  hiddenColumnInfo (~50–150 KB); up to 50 + 50 entries ship per save: **~10–40 MB per 1 s
  debounce tick** (`src/persistence/AutoSave.ts:32,229-250`) — rebuilt again in
  `flushPendingSave` → `saveSync` on `beforeunload`/`visibilitychange`
  (`AutoSave.ts:149-161,201-206,256-272`; `SessionStore.saveSync`
  `src/persistence/SessionStore.ts:361-367`).
- **Quota exhaustion is silent.** The first `QuotaExceededError` trips a one-shot circuit
  breaker (`AutoSave.ts:69-74,274-290`): one `error` event (`DataTable.ts:1040-1042`), then
  every later save is a no-op with no signal that state is no longer being saved; it re-arms
  only via `enable()` (`clearSession`'s disable→delete→enable, `DataTable.ts:1409-1443`).
- **Restore has an O(C²) insertion loop.** `restoreStateFromSnapshot`
  (`serialization.ts:265-429`) splices each schema column missing from the snapshot order into
  an evolving array (`:307-316`), then deserializes up to 50 + 50 stack entries (`:380-401`).
- **Undo capture deep-copies everything, twice per gesture.** `captureSnapshot` copies 3
  arrays + 2 Maps + filters per entry (`src/core/UndoManager.ts:205-225`,
  `DEFAULT_MAX_DEPTH = 50` at `:38`); `endColumnLayoutChange` captures a **second** full
  snapshot just to run the O(C) `snapshotsEqual` diff (`src/core/Actions.ts:386-394`,
  `UndoManager.ts:184-195`).
- **Vector derived-column values are re-inlined per save.** Top-level `derivedColumns`
  deep-copies every vector via `Array.from` (`serialization.ts:170-173`; same pattern at `:41`)
  — a 100K-row vector re-materializes as a plain JS array every second, even though the IDB
  write is a structured clone that could carry a TypedArray.

`SNAPSHOT_VERSION` is **5** (`src/persistence/types.ts:21`; annotations arrived in v5, vector
pool v4, presets v3 — the `types.ts:165-189` version comments are the shape history). The reader
leniently accepts integer versions in `[1, SNAPSHOT_VERSION]` and rejects future ones with a
`PERSISTENCE_VERSION_REJECTED` warning (`SessionStore.ts:162-196,375-399` →
`DataTable.ts:514-528`), locked by `tests/persistence/snapshotVersionPolicy.test.ts`.

## 3. Targeted review checklist (read before coding; re-locate all anchors)

- STATUS.md handoffs for Phases 1–8, especially `src/core/State.ts` signal-shape changes.
  Phase 8's selection model must NOT appear in snapshots — verify `StateSnapshot` and
  `SessionSnapshot` still exclude selection.
- `src/persistence/serialization.ts` — whole file. The pool mechanism (`:182-218` +
  `types.ts:82-127`) is the precedent you extend to column collections; dedup is **reference
  identity**, not content hash.
- `src/persistence/SessionStore.ts` — `put(snapshot)` at `:341,:366` is a **structured clone of
  the object, not a JSON string** (TypedArrays persist natively); DB constants `:14-16`
  (`dt-sessions` / `sessions` / `DB_VERSION = 1`); the `contains`-guarded `onupgradeneeded`
  (`:298-303`) your bump extends; `coerceLoadedSnapshotWithStatus` (`:167-196`).
- `src/persistence/AutoSave.ts` — whole file: the 13 subscriptions (9 state signals `:102-116`,
  presets `:119-121`, annotations `:127-129`, `canUndo`/`canRedo` `:134-137`), the
  restored-stacks immediate save (`:140-144`), the breaker reset in `enable()` (`:100`).
  **Signal equality guards mean `canUndoSignal` does NOT notify on push #2..#50** — stack saves
  today piggyback on state-signal notifications; your stacks lane inherits that (see §4.2).
- `src/core/UndoManager.ts` — `captureSnapshot` `:205-225` (vector `values` refs already shared;
  the `:218-219` comment documents that arrays are replaced, never mutated); per-field equality
  helpers `:47-137`; `loadStacks` caps undo at `maxDepth` but leaves redo uncapped (`:375-382`).
- `src/core/Actions.ts` — the gesture bracket `:368-394`; `loadData`'s restore call `:548-559`.
- `src/DataTable.ts` — AutoSave wiring `:1034-1045`; the `warning` precedents you copy
  (`PERSISTENCE_VERSION_REJECTED` `:519-528`, `PERSISTENCE_UNAVAILABLE` `:534-540`);
  `clearSession` `:1409-1443`.
- `src/core/TableEvents.ts:106-110` — `warning.code` is a plain `string`, not an enum: new codes
  are a docs change, not an API-surface change. `src/core/errors.ts:324-333` — the
  `PERSISTENCE_*` prefix already maps to `PersistenceError`.
- API tiers: `snapshotFromState` / `restoreStateFromSnapshot` / `serializeStateSnapshot` /
  `deserializeStateSnapshot` are Tier-3 **internal** (`tests/api-surface.exports.test.ts:41-48`)
  — change them freely. `SessionStore`, `SessionSnapshot` types, `AutoSave`, `SNAPSHOT_VERSION`,
  `UndoManager` are public — behavior/type changes there need docs + changeset.
- Tests you extend: `tests/persistence/serialization.test.ts` (snapshot builders to reuse for
  fixtures), `snapshotVersionPolicy.test.ts` (must learn v6), `AutoSave.quota.test.ts` (breaker
  contract you change), `tests/performance/memory-leaks.test.ts:342-419` (autosave coalescing:
  1K mutations → `save` called < 10 times); `fake-indexeddb` ^6.2.5 via
  `import 'fake-indexeddb/auto'`. `tests/budgets.ts` — Phase 0 shipped the `STATE` placeholder
  namespace (Phase 8 may have added to it); yours join it.
- Demo (for §7): example chips `.chip[data-url]` (Titanic CSV), `#undo-btn` / `#redo-btn` /
  `#clear-session-btn` in `index.html:63-104`; auto-restore boot in `demo/main.ts` (~`:609`);
  the `?gen=` perf harness always mounts `persistence: false` (phase-00 §4.4).

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 Migration fixtures — before any writer change

New directory `tests/persistence/fixtures/` holding committed JSON snapshots at **v5 (the
current version)**, captured mechanically by running today's `snapshotFromState` against rich
constructed states (reuse the builders in `tests/persistence/serialization.test.ts`):

- `v5-wide.json` — ~300 columns; hidden columns with neighbors, tooltips, pins, widths, sorts,
  Date-bearing range filters, a raw-sql filter, undo depth ~12 + redo ~4 (crosses the new
  persisted cap of 10).
- `v5-full-features.json` — ~30 columns; expression + vector derived columns (pooled `_poolRef`
  entries), annotations + severity filter, presets, undo depth 50.
- Hand-written minimal `v1-minimal.json`, `v3-presets.json`, `v4-inline-vectors.json` (inline
  vector values, pre-pool) matching the shape history in `types.ts` version comments.

Keep total fixture bytes under ~500 KB. **Fixtures are frozen**: the capture helper may add new
files but must never rewrite existing ones.

`tests/persistence/migration.matrix.test.ts`: for every fixture — put into fake-indexeddb →
`SessionStore.load` → `restoreStateFromSnapshot` into a fresh `TableState` (schema = fixture
columns plus one extra and one removed, to exercise validation) → assert a committed golden
summary (every restored signal value, undo/redo depths, preset/annotation/tooltip counts). Plus
the round-trip property: restore(old) → serialize with the **new** writer → restore again →
identical summary. This matrix must be green before AND after every later milestone.

### 4.2 Two-lane autosave: state record + capped stacks record

**Storage split.** Bump `DB_VERSION` 1 → 2; `onupgradeneeded` additionally creates object store
`stacks` (keyPath `tableName`) — the existing `contains` guard pattern makes the upgrade
idempotent. Records:

- `sessions` store (unchanged key): the SessionSnapshot **without** `undoStack` / `redoStack` /
  `vectorValuePool`, at `SNAPSHOT_VERSION = 6`.
- `stacks` store: `{ tableName, version, timestamp, undoStack, redoStack, vectorValuePool }`,
  both stacks capped at `PERSISTED_STACK_DEPTH = 10` newest entries (in-memory depth stays 50).

**SessionStore compat contract (no public signature changes).** `save(snapshot)` /
`saveSync(snapshot)`: if the snapshot carries stack fields, split-write both records (one
readwrite transaction over both stores in `saveSync`); if not, write only the state record —
**leaving the stacks record intact**. `load(tableName)` reads both and re-merges stack fields
into the returned `SessionSnapshot`, so `restoreStateFromSnapshot` keeps its input shape; a v≤5
state record with embedded stacks wins over a (nonexistent) stacks record — old sessions restore
unchanged; a malformed stacks record drops leniently (state still restores). `delete()` clears
both. `list()` reads only `sessions` — unaffected.

**AutoSave lanes.** All existing subscriptions schedule **both** lanes:

- State lane: unchanged 1 s debounce → `snapshotFromState(state, /* no undoManager */ …)` →
  `store.save` (state record only).
- Stacks lane: trailing debounce `STACKS_DEBOUNCE_MS = 10_000` → snapshot **with** the
  undoManager, capped at `PERSISTED_STACK_DEPTH` (add an internal options bag to
  `snapshotFromState` — it is Tier-3) → split-write refreshes both records.
- Final save (`flushPendingSave` from beforeunload/visibilitychange/`disable()`): always full —
  state + capped stacks — via `saveSync`.

The restored-stacks immediate save (`AutoSave.ts:140-144`) moves to the stacks lane. Known
residual (unchanged from today, document it): an undo to a structurally identical state fires no
signal, so stack drift persists at the next notification or the final save. **Trade-off (state
it in a code comment + docs):** a hard crash can lose up to ~10 s of undo history and anything
beyond the newest 10 entries — but never state, which stays on the 1 s lane.

**Version bump.** `SNAPSHOT_VERSION` 5 → 6; reader stays lenient for `[1, 6]` per the existing
policy; update `snapshotVersionPolicy.test.ts` (v6 accepted, v7 rejected). Old readers (a v5
library) reject v6 rows via the existing `PERSISTENCE_VERSION_REJECTED` path — acceptable,
downgrades already behave this way.

### 4.3 Structural sharing across undo entries

- `UndoManager.push` dedupes against the current top: for each of the 8 snapshot fields, if the
  existing per-field equality helper (`UndoManager.ts:47-137`) says equal, replace the incoming
  copy with the top entry's reference. Safe because snapshots are treated as immutable
  (`applySnapshot` copies before setting signals; capture never mutates).
- Add an `a === b` reference fast path at the top of each equality helper — `snapshotsEqual`
  then short-circuits shared fields, making `endColumnLayoutChange`'s no-change check
  (`Actions.ts:386-394`) cheap for everything the gesture didn't touch.
- Extend `serializeWithPool`'s reference-identity pool from vector values to the column
  collections (`visibleColumns`, `columnOrder`, `columnWidths`, `pinnedColumns`,
  `hiddenColumnInfo`): first occurrence serializes into a new pool namespace beside
  `vectorValuePool` (e.g. `collectionPool`); later entries store a `_poolRef`, mirroring the
  `isPooledVectorRef` guard (`types.ts:130`) on restore. With push-time sharing, a 10-deep
  stacks record collapses to ~1 copy of each big collection + per-entry refs.

### 4.4 Restore: single-pass column-order merge

Replace the splice loop (`serialization.ts:307-316`) with an O(C) merge: one pass (two-pointer
over the filtered snapshot order and the schema-indexed missing columns) producing the same
output as inserting each missing schema column at `min(schemaIndex, lengthAtInsertion)` into the
evolving array. **Semantics must be bit-identical** — the migration matrix and a property test
pin it: keep the old splice implementation inline in the test as the oracle and compare against
seeded randomized 1K-column scenarios (shuffled orders, hidden/missing/extra columns).
Correctness only in the default run — no timing assertion (README Glossary, budgets rule).

### 4.5 Vector values: typed arrays + persistence cap

`SessionStore.put` is a structured clone, so TypedArrays persist natively — smaller and faster
than JSON-shaped arrays:

- Numeric `vectorType`s (`integer` / `float` / `decimal`, `src/derived/types.ts:14-38`)
  serialize pool entries as `Float64Array` instead of `Array.from` plain arrays; restore hands
  the TypedArray straight to `VectorColumnDef.values` (TypedArrays satisfy `ArrayLike<number>`;
  `derivedColumnsEqual`'s reference fast path at `UndoManager.ts:161` still applies).
- Non-numeric vectors stay plain arrays but respect `VECTOR_PERSIST_VALUES_MAX` (start at
  1,000,000; tune from measurement): above it, persist a `{ _omitted: true }`-style marker
  (versioned under v6) instead of values and emit `PERSISTENCE_VECTOR_BUDGET_EXCEEDED` once per
  column name; restore treats the marker as an absent column with the same warning code.
- Verify fake-indexeddb ^6.2.5 round-trips `Float64Array` **in milestone 1's probe test**;
  real-browser confirmation happens in §7. If fake-indexeddb cannot clone TypedArrays, fall back
  to plain arrays + the cap for all types and record it in STATUS.md.

### 4.6 Quota: loud, degraded, re-armable

On the first `QuotaExceededError` (`classifyPersistenceFailure`, `AutoSave.ts:298-310`):

1. Emit — once — a `warning` event with code `PERSISTENCE_QUOTA_EXCEEDED` via a new `onWarning`
   AutoSave option, wired by the facade exactly like the `PERSISTENCE_UNAVAILABLE` precedent
   (`DataTable.ts:534-540`). The existing `onError` → `error` event stays.
2. Degrade instead of latching: disable the stacks lane and retry once with the state-only
   record. If the smaller write succeeds, keep saving state-only (undo history no longer
   persisted — the warning message says so); if it also quota-fails, latch fully (today's
   behavior).
3. Re-arm: a fresh `enable()` (clearSession's disable→delete→enable) restores both lanes and
   clears the warned-once latch; a successful state-only save alone re-arms only the state lane.

Update `tests/persistence/AutoSave.quota.test.ts` for this contract (warning once, degraded
retry, re-arm matrix) rather than deleting its assertions.

### 4.7 Teardown save cost

With stacks off the routine path the sync final save already shrinks to a state record + a
10-deep pooled stacks record. Additionally cache the stacks lane's last serialized stacks record
and reuse it in `flushPendingSave` when no subscription fired since it was built (dirty flag) —
recommended, but **measure before/after** in the RUN-gated serialize benchmark and drop it if
the win is noise (record either way in STATUS.md).

### 4.8 Budgets and risk notes

`tests/budgets.ts` `STATE` namespace additions (defaults are counts/bytes; wall-clock only under
`RUN_*` gates, per the file-header rule):

| Constant                                  | Value   | Asserted in                            |
| ----------------------------------------- | ------- | -------------------------------------- |
| `STATE.SNAPSHOT_BYTES_MAX`                | 200_000 | default run (node, synthetic 1K state) |
| `STATE.AUTOSAVE_WRITES_PER_100_MUTATIONS` | 2       | default run (memory-leaks test)        |
| `STATE.PERSISTED_STACK_DEPTH`             | 10      | default run (saveSync content test)    |
| `STATE.UNDO_GESTURE_MS`                   | 50      | `RUN_BROWSER_PERF` at WIDE             |
| `STATE.AUTOSAVE_SERIALIZE_MS_MAX`         | 20      | `RUN_DUCKDB_PERF` (node, 1K cols)      |
| `STATE.RESTORE_MS_MAX`                    | 100     | `RUN_DUCKDB_PERF` (node, 1K cols)      |

`SNAPSHOT_BYTES_MAX` governs the routine state record **without vector derived columns**
(vectors are O(rows) by nature and governed by §4.5); measure via a test helper
`tests/helpers/persistenceBytes.ts` (JSON bytes for plain fields + `byteLength` for
TypedArrays).

Risks / fallbacks:

- **Migration correctness is the phase's riskiest assumption** — hence fixtures first
  (milestone 1) and the matrix green through every later commit. If a fixture exposes a reader
  gap, fix the reader, never the fixture.
- If the `DB_VERSION` bump misbehaves, fallback: keep the single record, embed the capped
  10-deep stacks on the slow cadence only (accepting the write amplification); record the
  deviation.
- If structural sharing surprises a consumer-visible `getStacks()` expectation (shared refs
  across entries), document it in the `UndoManager` JSDoc — sharing is safe under the existing
  replace-not-mutate signal convention.

## 5. Implementation milestones (commit at each)

1. **Migration fixtures + matrix (no writer changes).** `tests/persistence/fixtures/` (v5
   captures + v1/v3/v4 minimals), golden summaries, `migration.matrix.test.ts`, fake-indexeddb
   TypedArray probe. — _commit: "Add migration fixtures for persisted session snapshots"_
2. Structural sharing in `UndoManager.push` + reference fast paths + unit tests (one width
   mutation → consecutive entries share every other field). — _commit: "Share unchanged
   collections across undo history entries"_
3. O(C) restore merge + property test against the inlined splice oracle at 1K columns. —
   _commit: "Restore column order with a single-pass merge"_
4. Two-lane autosave: `DB_VERSION` 2 + `stacks` store, split save/load/delete,
   `SNAPSHOT_VERSION` 6, capped stacks lane + final save, version-policy test update. — _commit:
   "Split autosave into state and undo-stack lanes"_
5. Vector typed-array pool entries + non-numeric cap + budget warnings on save and restore. —
   _commit: "Persist numeric vector values as typed arrays"_
6. Quota degradation: `onWarning` wiring, state-only retry, re-arm matrix, quota-test rewrite. —
   _commit: "Surface quota exhaustion and degrade to state-only saves"_
7. Budgets + byte/coalescing asserts in the default run, RUN-gated serialize/restore/undo
   timings, saveSync cache measurement, WIDE baseline re-capture with `snapshotBytes`. —
   _commit: "Cap teardown save cost and record persistence baselines"_
8. Docs + changeset (§10). — _commit: "Document the autosave payload and quota policy"_

## 6. Programmatic verification

Run and pass, in order:

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage                  # matrix, sharing, merge-oracle, quota, byte budgets
npm run build && npm run size
npm run docs:api:check
npm run test:browser
npm run test:perf                      # RUN_DUCKDB_PERF: serialize ≤ 20 ms, restore ≤ 100 ms at 1K cols
RUN_BROWSER_PERF=1 npx playwright test tests/browser/persistence-undo.perf.spec.ts   # undo gesture ≤ 50 ms at WIDE
npm run perf:baseline && npm run perf:baseline:report   # WIDE re-capture incl. snapshotBytes
```

Phase-specific asserts (inside the suites):

- Migration matrix green for every fixture, including the round-trip property (restore(old) →
  new writer → restore → identical summary).
- Routine state record at a synthetic 1K-column state with a 50-deep in-memory undo stack ≤
  `STATE.SNAPSHOT_BYTES_MAX` (200 KB; branch-point equivalent ~10–40 MB — record the measured
  before/after in STATUS.md).
- Extended memory-leaks autosave section (`tests/performance/memory-leaks.test.ts:342-419`):
  writes ≤ `AUTOSAVE_WRITES_PER_100_MUTATIONS × mutations / 100`; stacks-lane writes ≤ 1 for a
  burst shorter than `STACKS_DEBOUNCE_MS`.
- Structural sharing: width mutation → new top shares 7 of 8 fields by reference with previous
  top; `snapshotsEqual` on shared-ref snapshots does no per-element work (spy or counter).
- Restore property test: shuffled/hidden/missing/extra columns at 1K equal the splice oracle.
- Quota: mocked quota error → `PERSISTENCE_QUOTA_EXCEEDED` warning exactly once; state-only
  retry attempted; stacks lane silent; `enable()` re-arms; second trip latches.
- saveSync content test: final save writes BOTH records; persisted stacks capped at 10 each; a
  v5 fixture with 50-deep embedded stacks still restores 50 in-memory entries.
- Baseline: new WIDE JSON appended under `plans/scaling/baselines/` with a `snapshotBytes` field
  (page-side: 50 scripted mutations, then in-page `snapshotFromState` byte estimate); never
  overwrite old JSONs (README §8.6).

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) with a
twist: the `?gen=` harness runs `persistence: false` by design, so session-restore is verified
on the **human demo path** first, then undo depth and IDB silence on the harness.

**Part A — restore on the human path (SMOKE scale).** Open the plain demo URL (no `?gen=`).
Click the "Titanic (CSV)" example chip (`.chip[data-url]` — never `#file-input`). After load:
apply one histogram brush filter, hide one column, resize another, pin one, and run ~12 undoable
actions so the persisted cap (10) is exercised. Wait > 2 s (both lanes flush), then reload the
page. **Assert**: state restores (filter chip, hidden column, width, pin all back); `#undo-btn`
is enabled and undo steps back through the restored (capped) history; zero console errors. Then
click `#clear-session-btn` and reload — **assert** a fresh state, and that saves resume after
loading the sample again (breaker re-arm path).

**Part B — template at `?gen=wide&viz=off`** (READY budget from the Phase 0 baseline table).
Steps 1–4 as templated. Step 5 briefly. Step 8 is the focus: resize / pin / hide / reorder, then
undo and redo through ≥ 15 steps — **assert** each undo/redo feels instant (budget:
`STATE.UNDO_GESTURE_MS` order), no stuck placeholders, row oracle green after returning to
initial state. Record `JSON.stringify(await indexedDB.databases())` plus the `dt-sessions` row
timestamps before and after all Part B interactions via `javascript_tool` — **assert unchanged**
(the harness must write nothing; the Application tab is unavailable through the extension, so
this page-side probe is the check). Steps 10–12 as templated: theme flip, console sweep (zero
new errors for the whole session), cleanup.

Attach both parts' final snapshots + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; library size budgets hold.
- [ ] Fixtures committed under `tests/persistence/fixtures/` and byte-identical from milestone 1
      through the final commit (`git log --follow` shows no rewrites).
- [ ] Migration matrix green, including v5 embedded-stacks and v4 inline-vector fixtures.
- [ ] Routine autosave record ≤ 200 KB at 1K columns with a 50-deep undo stack (measured number
      in STATUS.md next to the branch-point ~10–40 MB).
- [ ] Final save (`saveSync`) verified to include capped stacks; crash-loss trade-off documented
      in code and docs.
- [ ] Quota trip produces exactly one `warning`, degrades to state-only, re-arms per §4.6.
- [ ] `SNAPSHOT_VERSION = 6` + `DB_VERSION = 2` upgrade proven against a pre-existing v5 IDB row
      (matrix + Part A).
- [ ] WIDE baseline re-captured and committed with `snapshotBytes`; report regenerated.
- [ ] Chrome session (Parts A + B) executed; evidence in STATUS.md.
- [ ] STATUS.md row + handoff filled per §11.

## 9. Out of scope

Selection persistence (Phase 8 decided selection is not persisted — do not add it to any
snapshot); vector ingestion into DuckDB (Phase 11, Arrow-based); IndexedDB row-cache spill
(rejected, README §9); any quota UI beyond the warning event; changing the in-memory undo depth
(stays 50); a general migration framework (the lenient version policy is the mechanism —
`snapshotVersionPolicy.test.ts` stays the law); cross-tab session sync.

## 10. Docs / changeset obligations

- **Changeset (MINOR)** — `Changed`: routine autosaves no longer include undo/redo stacks
  (stacks persist capped at 10 on a ~10 s cadence and at teardown; a crash may lose recent undo
  history, never state); `SNAPSHOT_VERSION` 5 → 6 and IDB `DB_VERSION` 1 → 2 (older sessions
  restore transparently; older library versions reject v6 rows); numeric vector values persist
  as TypedArrays; new warning codes `PERSISTENCE_QUOTA_EXCEEDED` /
  `PERSISTENCE_VECTOR_BUDGET_EXCEEDED`. `Fixed`: quota exhaustion no longer disables saves
  silently.
- `docs/guides/session-persistence.md` — rewrite "What gets persisted" (`:23`) as
  what-is-saved-when (two lanes, caps, final save); add a quota-exhaustion section beside
  "Handling IndexedDB unavailability" (`:166`); touch "save() vs saveSync()" (`:192`) and
  "Clearing a session" (`:216`) for the re-arm story.
- `docs/performance.md` — update "Session snapshots" (`:159`) and "Deep undo stacks with big
  vector columns" (`:416`) with measured before/after numbers.
- JSDoc: `AutoSave` (lanes + new option), `SessionStore` (two-record layout, compat contract),
  `UndoManager.push` (structural sharing), `TableEvents.warning` code examples — then
  `npm run docs:api`. API surface: new codes are plain strings (no surface change), but
  `SessionSnapshot` / `AutoSaveOptions` type additions WILL move the snapshot — `npx vitest -u`
  and verify the diff is exactly the intended fields.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: measured routine-record and stacks-record
bytes at 1K columns (before → after), serialize/restore/undo-gesture timings from the gated
runs, the fixture inventory (names + what each locks), budget constants shipped with values, the
fake-indexeddb TypedArray probe result, whether the saveSync cache survived measurement (§4.7),
and — for Phases 10–12 — that `serialization.ts` / `SessionStore.ts` anchors have moved
substantially, that persisted sessions now span two IDB stores (anything inspecting
`dt-sessions` must read both), and the new `SNAPSHOT_VERSION` value.
