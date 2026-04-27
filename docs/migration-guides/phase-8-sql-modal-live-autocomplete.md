# Phase 8 — Live autocomplete refresh in `SQLFilterModal` and `DerivedColumnModal`

**Status:** behavior change, no public-API rename or runtime symbol move,
no `tests/api-surface.*.test.ts` snapshot drift.

## What changed

Both bundled modals — `SQLFilterModal` (raw-SQL `WHERE` editor) and
`DerivedColumnModal` (SQL-expression derived-column editor) — used to
snapshot the table's completion context exactly once, when their lazy
editor mounted (`ensureEditor` called `actions.getCompletionContext()`
and passed the result to the editor's constructor). If the user then
added a derived column from elsewhere in the UI while the modal was
still open, autocomplete would not see the new column until the modal
was closed and reopened.

After Phase 8, both modals subscribe the open editor to
`state.schema` and `state.derivedColumns`. When either signal changes,
the modal asks the editor to reconfigure its autocomplete source via
`editor.updateCompletionContext(actions.getCompletionContext())`. The
bundled `CodeMirrorExpressionEditor` implements this via
`Compartment.reconfigure`, which preserves cursor position, focus,
scroll, undo history, and the document content across the swap. The
visible UX is "autocomplete just updated" — no flicker, no re-mount.

The shared helper lives at `src/sql-editor/wireLiveCompletionContext.ts`
and is internal (not exported from `/advanced`). Custom modal authors
who reach for `/advanced` and build their own wrapper should mirror the
pattern (subscribe in `ensureEditor`, unsubscribe in close + destroy).

## Why

The deferral was logged in Phase 5's report: "Currently refreshes only
on `open()` / `openForEdit()` — locked by tests in this phase. Live
refresh on `derivedChange` requires plumbing a thunk into the editor's
`Compartment.reconfigure`; Phase 8 owns the SQL editor primitives." The
gap surfaced naturally when adding the live-completion path for the
in-table derived editor in earlier phases — the modal codepaths had not
yet been retrofitted.

User-impact rationale: the derived-column composer modal is the
canonical place where a user iterates on an expression, validates it,
adds it as a column, then immediately wants to compose another column
that references the just-added one. Pre-fix, that workflow required
closing and reopening the modal to see the new column in autocomplete.

## Debouncing

The helper uses `queueMicrotask` so a bulk reconcile (undo / redo /
session restore) that mutates `state.derivedColumns` once and
`state.schema` once collapses to a single editor reconfigure per
microtask tick. Without the debounce, undoing a session restore that
touched a dozen columns would dispatch ~24 reconfigures back-to-back.

## Affected behavior for consumers

**Before:** open the SQL filter modal → in another browser tab or via
the demo's keyboard shortcut, add `derived_total = price * quantity` →
return to the modal and start typing — autocomplete did not show
`derived_total` until close + reopen.

**After:** the same sequence shows `derived_total` in the autocomplete
dropdown the moment it's added.

Public API contract is unchanged. The modal classes' constructor
signatures, methods, and event semantics are byte-identical. Custom
`editorFactory` consumers (the documented escape hatch for swapping in
a non-CodeMirror editor) get the same live-refresh wiring as the
bundled editor — provided their custom editor implements
`updateCompletionContext` per the `ExpressionEditor` interface.

## What's locked

- `tests/filters/SQLFilterModal.liveRefresh.test.ts` (6 cases): refresh
  on derived-column add, refresh on schema change, microtask debounce,
  no-dispatch after close, idempotent destroy, re-subscribe on reopen.
- `tests/derived/DerivedColumnModal.liveRefresh.test.ts` (3 cases): the
  three identical contracts that diverge from the SQLFilterModal-only
  cases (focus / scroll preservation locked there are CodeMirror
  internals; the helper's wiring is what we lock).

## What you should do

- **Nothing** if you use the bundled CodeMirror editor — the live
  refresh is automatic and all existing tests continue to pass.
- **If you supply a custom `editorFactory`**, ensure your editor
  implements `updateCompletionContext(ctx: CompletionContext): void`
  in a way that does NOT remount the editor element (which would lose
  focus / cursor / undo history). The bundled
  `CodeMirrorExpressionEditor.updateCompletionContext` (
  `src/sql-editor/CodeMirrorExpressionEditor.ts:134-138`) shows the
  intended pattern: dispatch a `Compartment.reconfigure` effect.
- **Telemetry**: the debounced reconfigure runs in the microtask
  queue, not on a `requestAnimationFrame`. If you instrument editor
  reconfigure timing, expect tighter clustering with the source signal
  set than before.
