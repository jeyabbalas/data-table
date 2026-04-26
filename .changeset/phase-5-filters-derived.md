---
'@jeyabbalas/data-table': patch
---

Phase 5 — Filters & derived columns. Hardens the management layer
behind the seven filter types and the two derived-column kinds, closes
remaining test gaps, and lands the Phase 0 §11-routed strict-TS slice
for `src/filters/` + `src/derived/`.

**Two consumer-visible behavior changes**

- `FilterPresetManager.save` and `.rename` now throw
  `ConfigurationError({ code: 'PRESET_DUPLICATE_NAME', details: { name } })`
  when the trimmed name collides with another preset. Previously
  duplicates silently coexisted, which made the picker show two
  identically-named entries. `importFromJSON` keeps importing — duplicate
  presets within the imported file or against the existing collection
  are skipped and reported on the `errors[]` channel rather than
  throwing. Migration: [`docs/migration-guides/phase-5-preset-name-uniqueness.md`](../docs/migration-guides/phase-5-preset-name-uniqueness.md).
- `actions.addDerivedColumn` and `actions.updateDerivedColumn` (rename
  path) now reject the reserved name `__rowid__` with the message
  `Column name "__rowid__" is reserved for the synthetic row id`. The
  duplicate-name guard already caught this in the typical post-load
  state; the explicit reservation closes a hole in the pre-load case
  and produces a clearer error message. `replaceDerivedColumn` is
  unaffected (rename is already rejected separately). The
  `Promise<{ success: boolean; error?: string }>` return shape is
  unchanged — no new error class, no api-surface delta. Migration:
  [`docs/migration-guides/phase-5-derived-rowid-reservation.md`](../docs/migration-guides/phase-5-derived-rowid-reservation.md).

**New error code routed to `ConfigurationError`**

- `PRESET_DUPLICATE_NAME` joins the `CONFIG_*` / `OPTIONS_*` / `CONTAINER_*` /
  `BRIDGE_*` / `INVARIANT` family so worker-boundary error reconstruction
  rebuilds it as `ConfigurationError`. Documented in
  `docs/troubleshooting.md`; the Phase 3 `tests/api-surface.error-codes.test.ts`
  lock auto-validates the addition.

**Documentation drift fix (carryover from Phase 3)**

- `docs/troubleshooting.md` section 16 still referenced the old
  `RESERVED_COLUMN_NAME` heading. Renamed to `LOAD_RESERVED_COLUMN_NAME`
  to match the table at line 51 (Phase 3 renamed the table entry but
  missed the section heading). Body updated to mention the
  derived-column-add-time reservation.

**Tests added** — 64 new cases across 9 files; 1 new file:

- `tests/filters/FilterSQL.test.ts` (+14) — pattern NULL handling for
  every mode, special chars in `point`/`set`/`not-set` value-side
  payloads, range with Date+`maxInclusive` and Date+`Infinity`, range
  with bigint bounds, raw-sql synthetic-key collision precedence.
- `tests/filters/RawSQLFilter.test.ts` (+3) — empty-string label
  fallback, label round-trip including `undefined`.
- `tests/filters/FilterRoundTrip.test.ts` (NEW, 21) — every filter type
  serialised → deserialised through both the structured-clone-equivalent
  path (preserves Date / Infinity / bigint) and the JSON path (FilterPresetManager
  export/import; documents the Infinity → null limitation).
- `tests/filters/FilterPresets.test.ts` (+8) — name-uniqueness
  contract on `save` / `rename` / `importFromJSON`, full round-trip
  every filter type via `save` → `exportToJSON` → `importFromJSON` →
  `load`.
- `tests/filters/SQLFilterModal.test.ts` (+6) — open-time autocomplete
  refresh including derived columns (live `derivedChange` refresh while
  the modal is open is deferred to Phase 8), empty / whitespace-only
  SQL gating on Validate and Apply.
- `tests/filters/CrossfilterQuery.test.ts` (+1) — documents the
  divergence between `splitCrossfilterFilters` and
  `filtersToWhereClause` when the `column` argument matches a
  raw-sql synthetic key (only `filtersToWhereClause` has the explicit
  raw-sql carve-out).
- `tests/derived/DerivedColumns.test.ts` (+4) —
  `addDerivedColumn({ name: '__rowid__' })` reservation in both
  schema-loaded and pre-load states; `updateDerivedColumn` rename
  refuses `__rowid__`; `setColumnOrder` reordering derived columns is
  undoable.
- `tests/derived/replace-derived-column.test.ts` (+1) — transitive
  multi-level cascade (a → b → c): replacing `a` with a numeric
  expression breaks both direct dependent `b` and transitive dependent
  `c`; `DEPENDENTS_INCOMPATIBLE.details.dependentsAffected` enumerates
  both.
- `tests/derived/DerivedColumnModal.test.ts` (+3) — kind toggle
  preserves expression text and vector textarea content across mode
  round-trips; clears the validation chip when toggling.

**Strict-TS slice cleanup (Phase 0 §11 routing)**

- `noPropertyAccessFromIndexSignature: true` was temporarily enabled
  and the **34 sites in `src/filters/FilterPresets.ts`** flipped to
  bracket access (concentrated in `importFromJSON`'s validation
  switch). Other slices (`src/annotations/`, `src/persistence/`,
  `src/table/`, `src/visualizations/histogram/IntervalHistogramData.ts`)
  remain to be cleaned by Phases 6 / 7 / 8; flag stays OFF globally
  until Phase 9.
- `noUncheckedIndexedAccess: true` was temporarily enabled and the
  filters + derived slice cleaned: **102 sites** total —
  `FilterPanelField.ts` (~70 sites: `inputs[N]?.value` and
  `inputs[N].value` patterns in DOM-node iteration loops),
  `FilterPresets.ts` (2 sites), `DerivedColumnManager.ts` (~6 sites:
  `findIndex`-then-direct-access patterns and topological sort
  loops), `DerivedColumnModal.ts` (~25 sites: `lines[i]` reads after
  bounds checks). Pattern: post-bounds-check non-null assertion
  `arr[i]!`. Other slices cleaned by their respective subsystem
  phases; flag stays OFF globally until Phase 9.

**Tests:** 3163 → 3227 (+64 in default run; opt-in skipped count
unchanged). **Coverage:** thresholds met; metrics ticked up vs Phase 4
baseline. **No public-API runtime surface change** — every api-surface
gate (`exports`, `snapshot`, `jsdoc`, `error-codes`, `private-paths`,
`cjs-routing`) stays green untouched. **No new dependencies** added.
