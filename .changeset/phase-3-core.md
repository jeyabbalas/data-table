---
'@jeyabbalas/data-table': patch
---

Phase 3 — Core reactivity, state, errors, modals, i18n. Hardens the substrate every later phase trusts.

**Async destroy guards on `StateActions`**

- `DataTable.destroy()` now calls a new `actions.markDestroyed()` first thing, before any other teardown step. After that flag flips, every public `StateActions` method short-circuits:
  - Sync mutators (filters, sort, column visibility, pin, width, header tooltip, selection, hover, focused-cell, and the `setOnFilterRemove` / `setOnDerivedChange` callback registrations) throw `DestroyedError`. Pure getters (`getUndoManager`, `getRawSQLFilters`, `getFiltersSQL`, `getColumnHeaderTooltip`, `getCompletionContext`) keep working so consumers can still read last-known state during teardown.
  - Async methods returning `Promise<void>` (`loadData`, `removeDerivedColumn`) and `Promise<typed-array>` (`getColumnValues`) and `Promise<{ valid, … }>` (`validateExpression`, `validateSQLFilter`) check the flag both at entry and after each `await` — if destruction landed mid-flight, they reject with `DestroyedError` and **drop** the post-await state mutation.
  - Async methods returning `{ success, error? }` (`addDerivedColumn`, `updateDerivedColumn`, `replaceDerivedColumn`) return `{ success: false, error: 'DataTable is destroyed' }` (or, for `replaceDerivedColumn`'s typed-error variant, `DerivedColumnError({ code: 'DESTROYED' })`) at the same checkpoints.
- `DataTable.loadDataImpl` and `DataTable.clearSession` add post-await destroy guards so a destroy mid-load no longer emits `loadComplete` / `loadError` / `error` on a torn-down emitter, and no longer mutates state after `resetTableState` if the table was already torn down.
- New tests: `tests/core/Actions.destroy.test.ts` (29 cases — sync mutator coverage, pre-call destroyed coverage on every async method, and three destroyed-during-await race tests) plus `tests/DataTable.destroy.race.test.ts` (8 integration cases — `table.actions.*` post-destroy, `loadData` mid-flight, `ready` replay race).

**Error-code drift fix and lock test**

- `docs/troubleshooting.md` error-code reference table updated to match what `src/` actually throws. Renamed `RESERVED_COLUMN_NAME` → `LOAD_RESERVED_COLUMN_NAME` (Phase 1 prefix-routing); replaced `DUPLICATE_ID` / `INVALID_SHAPE` / `VERSION_UNSUPPORTED` with their actual `ANNOTATION_*`-prefixed forms; added rows for `WORKER_PROTOCOL_VIOLATION` (Phase 1), `INVALID_IDENTIFIER` (Phase 1), `INVALID_ROWID`, `EXPORT_FAILED` (default), `PERSISTENCE_QUOTA_EXCEEDED` (Phase 1), `UNKNOWN` (`DataTableError` default), and a consolidated row for the rest of the `ANNOTATION_*` family pointing at `errors.ts`'s JSDoc list. Removed the `DUPLICATE_NAME` row (the duplicate-name path returns a string error, never sets that code).
- New `tests/api-surface.error-codes.test.ts` programmatically scans every `code: 'X'` literal across `src/`, every subclass-default code, and an explicit indirect-codes allowlist (currently `PERSISTENCE_QUOTA_EXCEEDED` from `classifyPersistenceFailure`). Asserts every code appears in `docs/troubleshooting.md`'s error-code table and vice versa, modulo a small documented-but-currently-unwrapped allowlist (`CLIPBOARD_UNAVAILABLE` — Phase 7 will wrap it). Future PRs that add a new code without documenting it (or doc a code without throwing it) will fail this test.

**Reactive substrate test gaps closed**

- `tests/core/reactive-substrate.phase3.test.ts` (13 new cases) locks behaviour the audit found unverified: `Computed` does not auto-track reads (only declared `deps` trigger recomputation), `batch()` flushes pending notifications even when the callback throws and resets the depth counter for subsequent batches, `EventEmitter.emit()` iterates a snapshot of the listener set so `off()` from one handler does not skip later handlers in the same emit, post-`removeAllListeners()` emit is a no-op, `once()` unsubscribed before its first emit does not fire, and multiple handlers throwing in the same emit each route to `onListenerError` (or each microtask-rethrow when no handler is supplied) without aborting the emit loop.

**ModalHost test gaps closed**

- `tests/core/ModalHost.phase3.test.ts` (7 new cases) adds the nested-modal Esc behaviour (Esc on the inner host closes only inner; outer's z-index reservation and focus restoration to the inner-opener button are preserved), the `destroy()`-without-`close()` path (asserts `wheel` and `touchmove` document listeners are torn down and the open-stack reservation is released), and mixed inline-panel + portalled-modal stacking (modal base 1000 always tops panel base 50 regardless of open order).

**Strict-TS rollout**

- `tsconfig.json` now sets `exactOptionalPropertyTypes: true` (deferred from Phase 2 §10). Every public option type whose field is genuinely "optional and may be `undefined`" was widened from `prop?: T` to `prop?: T | undefined` so explicit-undefined consumer pass-throughs continue to compile. The runtime behaviour is unchanged; the api-surface snapshot reflects only the type-level diff. See [`docs/migration-guides/phase-3-exact-optional-properties.md`](../docs/migration-guides/phase-3-exact-optional-properties.md) for the full list of affected option types and the guidance for downstream apps that mirror the flag.
- `noUncheckedIndexedAccess` was temporarily flipped on to identify and fix every offending site in `src/core/` (32 sites across `Actions.ts`, `UndoManager.ts`, `ModalHost.ts`, `columnHeaderTooltip.ts`). Sites were narrowed via post-bounds-check non-null assertions or `?? null` fallbacks. The flag stays disabled globally until Phase 9 flips it project-wide; subsystem phases 4–8 each clean their slice in turn.

**No public-API runtime surface change.** `tests/api-surface.exports.test.ts`, `tests/api-surface.snapshot.test.ts`, `tests/api-surface.jsdoc.test.ts`, `tests/api-surface.private-paths.test.ts`, and `tests/api-surface.cjs-routing.test.ts` all stay green. Tests: 2946 → 3007 (+61). `npm run docs:api:check`: 0 → 0 warnings.
