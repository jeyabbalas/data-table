# Phase 8 — Selection model at scale

Size: **M** · Depends on: **Phase 0** · Ordered before: **Phase 9** (state shape must be final
before persistence work) and **Phase 11** (export throughput builds on these semantics)

---

## 1. Context

Read [`README.md`](./README.md) (whole file), then [`STATUS.md`](./STATUS.md) (Phases 1–7 landed
before you; their handoffs may have moved anchors cited here), then this document. Relevant
README sections: §5.F (the selection hazard), §2.1 (new defaults + migration notes over opt-in
flags), §8 (protocol), Glossary (budgets, tiers).

Goal: **selecting all of 5,000,000 rows allocates approximately nothing.**
`state.selectedRows` becomes a discriminated union —
`{ type: 'explicit', rows } | { type: 'all-except', exclusions }` — and every consumer
(rendering, events, keyboard, exports, clipboard, `getColumnValues`) is correct under both
variants. This is an **honest breaking type change** in 0.x, user-approved per README §2.1: the
compiler is the migration tool. Do not ship a compatibility facade that pretends to be a
`Set<number>` — an empty Set while everything is selected is worse than a compile error.

## 2. Problem statement

- `selectAll()` materializes a `Set` of one number per row (`src/core/Actions.ts:1974-1982`):
  ~250–400 MB at 5M rows, seconds of allocation, then the `selectionChange` emit **copies the
  whole Set again** (`src/DataTable.ts:1095-1097`). At DEEP this is an OOM-adjacent stall.
- `selectAll()` iterates `totalRows`, but selection indices are positions in the **filtered**
  view (`docs/concepts/state-model.md:280`). With a filter active it over-selects: indices
  `≥ filteredRows` match nothing in the export CTE, while the export dialog count readout
  (`src/export/ExportDialog.ts:492`) reports the inflated `totalRows` figure.
- `ExportQuery.buildSelectedRowsQuery` emits `__row_idx__ IN (…)` over a `ROW_NUMBER()` CTE,
  chunked at 10K indices per query (`src/export/ExportQuery.ts:152-186,283-302`) — structurally
  impossible for 5M explicit indices; there is no all-except path.
- Verified spec corrections (write these into your mental model before coding):
  - **There are no selection checkboxes anywhere in the UI** — no per-row checkbox, no header
    select-all control. Selection renders as a row class + `aria-selected`
    (`src/table/TableBody.ts:1198-1205,1926-1945`) under `aria-multiselectable="true"`
    (`src/table/TableContainer.ts:833`). `selectAll()` is reachable only via
    `table.actions`.
  - Keyboard selection is **Enter = toggle** on the focused cell
    (`src/table/KeyboardNavigator.ts:322-331`), not Space/Shift-Space (Space on a header
    activates sort). Mouse: click replace / ctrl-click toggle / shift-click range
    (`src/table/TableBody.ts:1894-1907`).
  - `docs/guides/events.md:276` claims `selectionChange` fires on filter changes. **False**:
    nothing writes `selectedRows` when filters change (verified: the only writers are the three
    selection actions, `resetTableState`, and test code). Fix the doc in §10.
  - Selection is not persisted (`src/persistence/serialization.ts` and
    `src/persistence/types.ts` contain no `selectedRows` — confirms the Phase 9 decoupling) and
    not undoable (`StateSnapshot`, `src/core/UndoManager.ts:27-36`, omits it; locked by
    `tests/core/UndoManager.test.ts:499-515`).

## 3. Targeted review checklist (read before coding; re-locate all anchors)

Anchors below are from the branch point; Phases 1–7 (especially 3–6, which rewrite
TableBody/TableContainer rendering) will have moved them. **Re-run the audit yourself:**
`grep -rn "selectedRows" src/ tests/ demo/` and reconcile against this list — any site the grep
finds that is not listed here goes into STATUS.md with your adaptation. The durable invariant:
after this phase, no code outside `src/core/selection.ts` and the selection actions touches the
union's internals except through the helpers.

Library read/write sites (13 files; the complete set at branch point — demo has none):

- `src/core/State.ts:63,129,167` — signal type, init, reset. → `Signal<SelectionState>`,
  init/reset via `emptySelection()`.
- `src/core/Actions.ts:1915-1982` — `selectRow` (replace/toggle/range), `clearSelection`,
  `selectAll`, plus the private `lastSelectedIndex` range anchor. → §4.2.
- `src/core/Actions.ts:1822-1843` — `getColumnValues({ scope: 'selected' })`: size guard,
  `Array.from`, per-index `INVALID_ROWID` validation, `buildSelectedRowsQuery` call. → §4.6.
- `src/DataTable.ts:1095-1097` — `selectionChange` emit with full-Set defensive copy. → §4.3.
- `src/core/TableEvents.ts:123` — payload type `ReadonlySet<number>`. → §4.3.
- `src/table/TableBody.ts:499-504` (subscribe → `updateSelectionStyles`), `:1118,:1203`
  (`renderVisibleRows` reads + `.has(i)`), `:1936-1945` (`updateSelectionStyles` `.has(i)`),
  `:1926-1931` (`setRowSelected` aria writer — takes a boolean, unaffected). → §4.4.
- `src/table/KeyboardNavigator.ts:383-384` — Ctrl+C empty-selection guard (`.size === 0`);
  `:949-961` — `copySelectedRows` materializes `Array.from(selectedRows)`. → §4.6.
- `src/export/ExportQuery.ts:17` — `ExportContext.selectedRows: Set<number>`; `:254-256` —
  `fetchSelectedRows` size guard + `Array.from`; `:152-186` — explicit IN builder;
  `:26` — `INDEX_CHUNK_SIZE`. → §4.5.
- `src/export/ParquetExport.ts:48-77` — `buildParquetQuery` selected scope (empty → `LIMIT 0`
  schema trick, contiguous fast path, CTE); `:139` — `exportParquetFromState` context build.
- `src/export/CSVExport.ts:226` and `src/export/JSONExport.ts:237` — `…FromState` context
  builds (mechanical: pass the union through).
- `src/export/ExportDialog.ts:489-506` — `updateScopeCounts` (`.size` readout, disabled state,
  auto-fallback); `:531` — subscription (already also subscribes `filteredRows` at `:526`, so
  the all-except count stays live). The **only** "n selected" readout in the library — FilterBar
  and the demo have none (verified).
- `src/export/Clipboard.ts:80-87` — `copyRowsToClipboard` builds an explicit context from a
  `number[]` (public /advanced API — keeps its signature; see §4.6).

Type-surface consequences: `TableState` and `ExportContext` are public via
`@jeyabbalas/data-table/advanced` (`src/advanced.ts:21,127`); the facade exposes
`readonly state` / `readonly actions` (`src/DataTable.ts:332-334`); the generated typedoc pages
under `docs/api/` include `TableState.md` and `ExportContext.md`. The api-surface snapshot
(`tests/api-surface.snapshot.test.ts`) locks export keys of both entries.

Test files to port **first** (make them pass under the union, preserving semantics, before
adding all-except cases — this is the regression net for risk #2):
`tests/core/Actions.test.ts:457-524,587` (Row Selection Actions),
`tests/core/State.test.ts:27,90-93,188-199,258-277,436-449`,
`tests/core/eventPayloadImmutability.test.ts:124-154`,
`tests/core/Actions.getColumnValues.test.ts:186-218`,
`tests/core/UndoManager.test.ts:499-515`, `tests/table/TableBody.test.ts:288,625-710`,
`tests/table/KeyboardNavigator.test.ts:376-393,477,499,587,754,903`,
`tests/table/Accessibility.test.ts` (aria-selected suite around `:385`),
`tests/export/CSVExport.test.ts:341,507-580,721,777`,
`tests/export/JSONExport.test.ts:184,322,430`,
`tests/export/ParquetExport.test.ts:24,118-170,210,255,339`,
`tests/export/ParquetExport.roundTrip.test.ts:52,133,167,198`,
`tests/export/ExportDialog.test.ts:313-337`, `tests/DataTable.errorEvents.test.ts:81`.

Also read: `tests/budgets.ts` `STATE` namespace (Phase 0 shipped it as a placeholder),
`tests/browser/helpers/wideTable.ts` (`mountTierTable`) and `demo/perf.ts` `?gen=` grammar
(Phase 0), `docs/concepts/state-model.md:65-69,166-171,210,280`, and
`docs/migration-guides/README.md` (naming: `from-0.7-to-0.8.md`; the existing `phase-N-*.md`
guides are the **old pre-release review phases** — do not add to that series, and do not confuse
them with this plan's phase numbers; `DataTable.ts:1274-1275` comments cite that old numbering).

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 The union and its helpers — `src/core/selection.ts` (new)

```ts
export type SelectionState =
  | { readonly type: 'explicit'; readonly rows: ReadonlySet<number> }
  | { readonly type: 'all-except'; readonly exclusions: ReadonlySet<number> };

export function emptySelection(): SelectionState; // { type:'explicit', rows: ∅ }
export function allSelection(): SelectionState; // { type:'all-except', exclusions: ∅ }
export function isRowSelected(sel: SelectionState, index: number): boolean;
export function getSelectedCount(sel: SelectionState, filteredRows: number): number;
export function selectionSummary(sel: SelectionState): 'none' | 'some' | 'all';
```

- `isRowSelected`: explicit → `rows.has(i)`; all-except → `!exclusions.has(i)`.
- `getSelectedCount`: explicit → `rows.size` (raw, preserving today's readout even when stale
  indices exceed `filteredRows`); all-except → `max(0, filteredRows - exclusions.size)`.
  Callers pass `state.filteredRows.get()` — kept fresh by `CrossfilterCoordinator`
  (`src/visualizations/CrossfilterCoordinator.ts:148-165`, constructed even with
  `visualizations: false`), so the count is exactly as live as the dialog's "filtered (N)"
  readout today. "Has any selection" = `getSelectedCount(...) > 0`.
- `selectionSummary` is structural (for tri-state UI built by hosts): explicit ∅ → `'none'`;
  all-except ∅ → `'all'`; otherwise `'some'`.
- **Deliberately no `toArray`/`forEach` materialization helper.** Enumerating an all-except
  selection is O(filteredRows) and belongs in SQL (§4.5), never in a JS loop. Say so in the
  JSDoc; a consumer who needs values goes through `getColumnValues` or the export scope.
- Pure functions, no signal reads — unit-testable in node env. Exported from the **root** entry
  (`src/index.ts`) with JSDoc `@example`s; /advanced consumers import them from the root like
  other shared types. Internal `Signal` primitives stay unexported (README §8.3).

### 4.2 Actions — `src/core/Actions.ts`

`selectRow(index, mode)` per variant (mouse and Enter-toggle flows both land here):

| Mode        | explicit (unchanged semantics)                       | all-except                                                                                                                          |
| ----------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `'replace'` | single-selected-self click deselects; else `{index}` | → `{ type:'explicit', rows:{index} }` (no self-deselect special case)                                                               |
| `'toggle'`  | copy set, add/delete `index`                         | copy exclusions, **add `index` if currently selected, else delete** — a toggled-off row moves into `exclusions` and back            |
| `'range'`   | no anchor → replace; else fresh set of [min,max]     | no anchor → `'replace'` behavior; else copy exclusions and **delete every index in [min,max]** (range-select re-includes the range) |

`lastSelectedIndex` anchor updates exactly as today (set on replace/toggle, kept on range).
Every write constructs a fresh union object with a fresh inner Set (signals compare by
reference, `docs/concepts/state-model.md:159-175`). Costs are O(interactions), never O(rows).

- `selectAll()` → `allSelection()`, **O(1)**. This also fixes the `totalRows` over-selection
  quirk (§2): all-except-∅ means "every row currently matching the filters", count =
  `filteredRows`. Behavior change; goes in the migration note.
- `clearSelection()` → `emptySelection()`, `lastSelectedIndex = null` (as today).

**Filter-change policy (verified current behavior — preserve it exactly).** No filter or sort
mutation touches `selectedRows`; only `loadData` → `resetTableState` clears it. Indices are
positions in the filtered view, so after a filter change the same stored state silently
designates different physical rows (`docs/concepts/state-model.md:280`), and **no
`selectionChange` fires**. Under the union this carries over unchanged: explicit indices and
all-except exclusions are equally positional; all-except naturally reads as "all currently
matching except the excluded positions". Write a test pinning both: (a) `addFilter` leaves the
selection signal reference untouched and emits no `selectionChange`; (b) document-in-code that
remapping/clearing is explicitly not attempted (Phase 9+ may revisit; not here).

### 4.3 Events — `src/DataTable.ts:1095-1097`, `src/core/TableEvents.ts:123`

Payload keeps its key, changes its type: `selectionChange: { selectedRows: SelectionState }`.
Emit a defensive copy of the **inner set only** — `{ type, rows: new Set(rows) }` /
`{ type, exclusions: new Set(exclusions) }` — bounded by interaction count, never by row count.
This preserves the immutability contract locked by
`tests/core/eventPayloadImmutability.test.ts` (port both cases to the union; add an all-except
mutation case).

### 4.4 Rendering + a11y — `src/table/TableBody.ts` (post-P3–P6 shape)

Both render-path reads go through the helper: `renderVisibleRows` (`selectedRows.has(i)` at
`:1203`) and `updateSelectionStyles` (`:1936-1945`) become `isRowSelected(sel, i)`. Per-row
`aria-selected` semantics and the write-skip in `setRowSelected` (`:1926-1931`) are unchanged;
`aria-multiselectable` stays. Cost stays O(visible rows) per pass under both variants.

**No checkbox UI exists, and this phase does not add one.** The plan's one-line goal (README §7)
is the state model; a selection gutter/header checkbox is feature work (README §9 precedent:
"feature work, not scale work") and would collide with the column-windowed header/body Phases
3–6 just built. What this phase ships instead: `selectionSummary()` gives hosts the exact
tri-state (`'none' | 'some' | 'all'`) a header checkbox needs, and the demo/manual verification
drives `table.actions.selectAll()` directly. Record this scope decision in STATUS.md so a later
UI phase can cite it.

### 4.5 Export — `src/export/ExportQuery.ts` and friends

`ExportContext.selectedRows: SelectionState` (breaking for /advanced). Explicit paths —
`buildSelectedRowsQuery` IN-chunking, the contiguous-range fast path, `LIMIT 0` empty-schema
trick — are **unchanged** in SQL shape. New:

- `buildAllExceptQuery(tableName, columns, filters, sortColumns, exclusions)`: same
  `ROW_NUMBER() OVER (ORDER BY …, __rowid__ ASC) - 1 AS __row_idx__` CTE, then
  `WHERE __row_idx__ NOT IN (chunk₁) AND __row_idx__ NOT IN (chunk₂) …`, chunks of
  `INDEX_CHUNK_SIZE`. **Correctness trap: NOT IN chunks must be AND-conjoined inside ONE
  query.** The explicit path unions results across separate per-chunk queries; doing that with
  NOT IN returns the whole table (each chunk-query excludes only its own chunk). Exclusions are
  O(user toggles), so even 100K exclusions is ten predicates in one statement. Empty exclusions
  → **no `__row_idx__` predicate at all** (plain filtered+ordered query). `__row_idx__` is
  ROW_NUMBER output and the literals are validated integers, so NOT-IN NULL semantics cannot
  bite. Keep the `ORDER BY __row_idx__` determinism.
- `fetchSelectedRows` (`:247-303`): explicit branches unchanged; all-except → LIMIT/OFFSET
  batches of `BATCH_SIZE` over the all-except query (pagination is stable thanks to the
  `__rowid__` tiebreaker). Empty-count guard uses `getSelectedCount(sel, …) === 0` — the
  callers pass `filteredRows` through `ExportContext` — simplest: add
  `filteredRows: number` to `ExportContext`, populated by the four `…FromState` builders and
  `Clipboard.ts` (it is state the exporters already should have had; note it in the changeset).
- `buildParquetQuery` (`ParquetExport.ts:48-77`): all-except with count 0 → existing `LIMIT 0`
  trick; exclusions ∅ → `buildSelectQuery(filters, sort)` (full filtered export); else single
  statement with the AND-chunked NOT IN (no batching — `COPY` streams it worker-side).
- `ExportDialog.updateScopeCounts` (`:489-506`): count via `getSelectedCount(sel,
filteredRows.get())`; disabled/auto-fallback logic keyed on that count. Strings unchanged.

### 4.6 `getColumnValues`, keyboard, clipboard

- `Actions.getColumnValues({ scope: 'selected' })` (`:1822-1843`): count-0 → `emptyTypedResult`
  (unchanged); validate the **inner set's members** (both variants) for the `INVALID_ROWID`
  contract; explicit → `buildSelectedRowsQuery` as today; all-except → `buildAllExceptQuery`,
  same pagination wrapper. Result size for all-except is bounded the same way `scope:
'filtered'` already is — by the caller's `limit`/`offset`.
- `KeyboardNavigator` Ctrl+C guard (`:383-384`) → `getSelectedCount(sel, filteredRows.get())
=== 0`. `copySelectedRows` (`:949-961`): explicit → `Array.from(rows)` into
  `copyRowsToClipboard` exactly as today; all-except → new
  `copySelectionToClipboard(state, bridge)` in `Clipboard.ts` that builds the union context
  directly (no index materialization) and runs the same TSV `scope: 'selected'` pipeline.
- Cap: `CLIPBOARD_MAX_ROWS = 50_000` in `Clipboard.ts`, enforced for **both** variants via
  `getSelectedCount` before fetching; over the cap → `ExportError` code
  `SELECTION_TOO_LARGE_FOR_CLIPBOARD`. Today a huge copy builds the whole string and the browser
  rejects the ~10 MB write anyway (`Clipboard.ts:21-28`) — the cap makes that failure
  deterministic and cheap; the keyboard path's existing silent catch (`:958-960`) absorbs it.
  Phase 11 owns real caps/messaging. Changeset documents the constant.

### 4.7 Budgets — `tests/budgets.ts` `STATE` namespace

- `STATE.SELECT_ALL_TRACKED_ENTRIES_MAX = 0` — after `selectAll()` at any tier, the union is
  `all-except` with `exclusions.size === 0`; asserted in unit tests and in the DEEP browser
  spec (this is the machine-independent form of "select-all allocates ~nothing").
- `STATE.CLIPBOARD_MAX_ROWS = 50_000` — shared with `Clipboard.ts` (import from budgets or
  re-export; single source).
- `STATE.SELECT_ALL_INTERACTION_MS_MAX = 100` and a coarse `performance.memory` delta check —
  **`RUN_BROWSER_PERF`-gated only** (README §8.3 wall-clock rule; heap numbers are quantized,
  compare orders of magnitude).

### 4.8 Risk notes / fallbacks

- **Risk 1 — hidden consumers of the Set type.** The §3 grep-audit is the validation; the loud
  type change makes the compiler catch the rest. If `npm run typecheck` surfaces a site not in
  §3 (drift from Phases 1–7), adapt it with the same helpers and log it in STATUS.md.
- **Risk 2 — subtle semantics drift in toggle/range flows.** Mitigation is the ordering baked
  into §5: port the existing suites green first, then add all-except cases. If a ported test
  reveals an undocumented behavior this doc contradicts, the ported test wins — preserve, then
  record.
- If `filteredRows` freshness proves too weak for a count assert in a race-prone test, assert
  the structural facts (type + exclusions size) and poll the count — do not add sleeps.
- If the AND-chunked NOT IN hits a DuckDB statement-size limit in the gated DEEP run (only
  plausible at absurd exclusion counts), fall back to a worker-side temp table of exclusions
  joined anti-semi (`WHERE __row_idx__ NOT IN (SELECT …)`) and record the pivot in STATUS.md.

## 5. Implementation milestones (commit at each)

1. `src/core/selection.ts` + exhaustive unit tests (both variants × membership/count/summary,
   boundary values, no-materialization JSDoc). Also capture the current explicit-path SQL
   builder outputs as golden strings — they must survive the refactor byte-identical. —
   _commit: "Add SelectionState union with pure selection helpers"_
2. State + Actions + events adoption (§4.2, §4.3) **with the §3 core/table suites ported in the
   same change** — work order inside the milestone is port-first (rewrite expectations to the
   union, watch them fail, then flip the implementation until green) so semantics drift
   surfaces as a red diff, but the commit itself lands green. — _commit: "Adopt the selection
   union in state, actions, and events"_
3. TableBody rendering through `isRowSelected`; a11y suite green. — _commit: "Render row
   selection through the union helpers"_
4. Export layer (§4.5): `ExportContext`, `buildAllExceptQuery` + SQL-shape unit tests (AND-chunk
   text check, empty-exclusions no-predicate, explicit goldens unchanged), fetch batching,
   Parquet, dialog counts, export test suites ported. — _commit: "Add all-except export path
   with chunked NOT IN predicates"_
5. `getColumnValues` + keyboard + clipboard cap (§4.6). — _commit: "Route selected-scope reads
   and clipboard through the union"_
6. Budgets + `tests/browser/selection.spec.ts` (default WIDE_CI portion; `RUN_BROWSER_PERF`
   DEEP portion) + docs + migration guide + changeset + api snapshots. — _commit: "Document the
   selection union and add scale coverage"_

## 6. Programmatic verification

```bash
npm run lint && npm run format:check && npm run typecheck
npm run test:coverage
npm run build && npm run size
npm run docs:api:check
npm run test:browser                          # includes the new selection.spec.ts default part
RUN_BROWSER_PERF=1 npx playwright test tests/browser/selection.spec.ts
```

Phase-specific asserts inside the suites:

- Both variants across replace/toggle/range/clear/select-all/summary/count, including:
  toggle-off under all-except lands in `exclusions` and toggles back; range under all-except
  removes `[min,max]` from `exclusions`; `selectAll()` result is structurally
  `{ 'all-except', ∅ }` (`STATE.SELECT_ALL_TRACKED_ENTRIES_MAX`).
- Filter-change policy test (§4.2): reference-stable selection, no `selectionChange` emit.
- ExportQuery: all-except SQL shape (single statement, AND-conjoined NOT IN chunks at >10K
  exclusions, no predicate at ∅ exclusions, `ORDER BY` determinism intact); explicit SQL
  byte-identical to pre-phase golden strings; Parquet all-except variants; Node-DuckDB
  round-trip (`tests/helpers/duckdbNode.ts`) exporting scope-selected under both variants
  agrees with an oracle filter.
- Event payload: union shape, inner-set defensive copy under both variants.
- Keyboard: Enter toggles under both variants; Ctrl+C guard honors all-except counts; clipboard
  cap raises `SELECTION_TOO_LARGE_FOR_CLIPBOARD` above `STATE.CLIPBOARD_MAX_ROWS`.
- Browser (default, WIDE_CI): `selectAll` via `table.actions`, ctrl-click one row off, count
  readout math, aria-selected spot-checks, export-dialog selected count, page-side
  `exportToBuffer` of a 1,000-row slice reflecting the exclusion. Browser (gated, DEEP):
  select-all wall time `< STATE.SELECT_ALL_INTERACTION_MS_MAX`, coarse heap delta, count =
  4,999,99x after exclusions, no long-task stall.

## 7. Manual verification (Claude in Chrome)

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) at
`?gen=deep&viz=off` (READY_BUDGET from the Phase 0/7 DEEP baselines). Phase-specific inserts,
driven via `javascript_tool` because no checkbox UI exists (§4.4):

- After step 3: `const t = window.__dtPerf.table; t.actions.selectAll()` — returns instantly
  (no multi-second stall, no heap jump in the readout);
  `t.state.selectedRows.get()` is `{ type: 'all-except', exclusions: Set(0) }`; count via the
  root helpers = 5,000,000; open the export dialog — "Selected rows (5,000,000)" — close with
  Escape.
- Ctrl/Cmd-click two visible rows (computer tool): both lose the selected row styling,
  `exclusions.size === 2`, count readout 4,999,998; ctrl-click one back → 4,999,999.
- Step 9 variant: page-side `t.bridge.exportToBuffer` of the selected-scope SQL for a
  1,000-row slice (build via the exported query builder or re-run the dialog's parquet path
  in-page) — `byteLength > 0` and the excluded row absent from a probe query using the same
  WHERE shape.
- Undo/redo cycle (step 8) — selection untouched by undo (stays all-except), per §2.
- `t.actions.clearSelection()` → explicit ∅; row styling clears; export dialog Selected radio
  disabled. Steps 4, 11, 12 as templated: scroll storm, **zero new console errors**, cleanup.

Attach the final snapshot JSON + screenshots (post-select-all, post-exclusion) to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green; bundle size within budgets.
- [ ] §3 audit reconciled: every grep hit adapted or logged; no `.has(`/`.size` on the union
      outside `src/core/selection.ts` and its tests (`grep -rn "selectedRows" src/` shows only
      helper-mediated reads and the action writers).
- [ ] Ported suites pass with preserved semantics; all-except cases added on top.
- [ ] `selectAll()` at DEEP: O(1) structural assert green; gated wall/heap checks green.
- [ ] Explicit-path export SQL golden-checked unchanged; all-except round-trip proven in
      Node-DuckDB and page-side at DEEP.
- [ ] Filter-change policy pinned by test and documented (state-model + events guide fixed).
- [ ] Changeset (minor), migration guide, api-reference, state-model, typedoc snapshots, and
      api-surface snapshot all updated; snapshot diff contains only intended entries.
- [ ] Chrome template executed; evidence in STATUS.md; STATUS.md row + handoff filled.

## 9. Out of scope

Export throughput/streaming and real clipboard UX caps (Phase 11 — it builds on `SelectionState`
and `buildAllExceptQuery`); selection persistence (not serialized today; Phase 9 keeps it that
way); selection participation in undo (excluded today, stays excluded); checkbox/gutter
selection UI and any new keyboard bindings (feature work — §4.4 decision); multi-range selection
features; remapping selection across filter changes (§4.2 preserves positional semantics).

## 10. Docs / changeset obligations

- **Changeset: minor** (0.7.0 → 0.8.0), heading `Changed (breaking)` + `Migration` section
  with before/after snippets: reading (`sel.has(i)` → `isRowSelected(sel, i)`), counting
  (`sel.size` → `getSelectedCount(sel, table.state.filteredRows.get())`), writing
  (`state.selectedRows.set(new Set([1]))` → `{ type: 'explicit', rows: new Set([1]) }` — or
  better, `actions.selectRow`), event handlers (payload key `selectedRows` now the union), the
  `selectAll` filtered-count fix, `ExportContext.selectedRows`/`filteredRows`, and
  `CLIPBOARD_MAX_ROWS`. Never a facade; the compile error is the feature.
- `docs/migration-guides/from-0.7-to-0.8.md` from `_TEMPLATE.md` + row in its README table.
- `docs/api-reference.md`: state-signals row `:548`, actions rows `:719-721` (note `selectAll`
  O(1) semantics), event payload row `:799`, new helper exports.
- `docs/concepts/state-model.md`: Selection table `:65-69`, the mutation example `:166-171`
  (currently a raw `Set` snippet), undo-exclusion note `:210`, and rewrite the `:280` gotcha
  for the union (positional semantics unchanged; all-except reads as "all currently matching").
- `docs/guides/events.md`: payload table `:46`; **fix the false claim at `:276`** —
  `selectionChange` does not fire on filter changes; a selection badge must subscribe to
  `filterChange` too because the all-except **count** moves with `filteredRows`.
- `docs/concepts/architecture.md:88,104` selection mentions; `docs/troubleshooting.md:58`
  `INVALID_ROWID` wording; `AGENTS.md:52` ("checkbox/keyboard" is wrong today — make it truthful
  while touching).
- Regenerate typedoc (`npm run docs:api`) and the api-surface snapshot (`npx vitest -u`);
  verify both diffs are only the intended selection surface.

## 11. STATUS.md handoff

Fill per the STATUS.md required list. Must include: the reconciled §3 audit (sites that had
moved since branch point and where they live now); the no-checkbox-UI scope decision (§4.4) so
a future UI phase cites it; measured DEEP numbers (select-all wall ms, heap delta, export-slice
timing) vs the Phase 0/7 baselines; the exact `STATE.*` budget values shipped; the
`ExportContext.filteredRows` addition and `CLIPBOARD_MAX_ROWS` value for Phase 11; confirmation
that serialization still contains no selection state, with the Phase 9 pointer; and any NOT-IN
fallback pivot (§4.8) Phase 11 must inherit.
