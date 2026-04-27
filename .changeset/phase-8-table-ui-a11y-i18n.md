---
'@jeyabbalas/data-table': patch
---

Table UI rendering, accessibility, and i18n hardening (review-plan Phase 8).

- **Event payloads are independent shallow copies.** Every
  `TableEvents` payload field that carries a mutable collection
  (`Filter[]`, `SortColumn[]`, `Set<number>`, `string[]`,
  `DerivedColumnDef[]`) is allocated fresh at emit time. Pre-fix
  consumers that mutated the payload from a handler silently corrupted
  the live signal value; post-fix the mutation is contained in the
  consumer's copy. Item identity inside the collection is unchanged —
  treat the items as read-only. Runtime contract only; the typed
  `readonly` markers on `TableEvents` are deferred to Phase 9 so this
  release lands without forcing a TS2540 on consumer destructure-and-
  mutate code. See
  `docs/migration-guides/phase-8-event-payload-immutability.md`.
- **`SQLFilterModal` and `DerivedColumnModal` autocomplete refresh
  live.** Both modals subscribe their open editor to `state.schema` and
  `state.derivedColumns` so adding a derived column elsewhere in the UI
  while the modal is open updates the autocomplete dropdown without
  remounting. Cursor / focus / scroll preserved via the editor's
  existing `Compartment.reconfigure` path
  (`CodeMirrorExpressionEditor.updateCompletionContext`). Microtask
  debounce so a bulk reconcile (undo / redo / session restore)
  collapses to one editor dispatch. New shared helper
  `src/sql-editor/wireLiveCompletionContext.ts` (internal). See
  `docs/migration-guides/phase-8-sql-modal-live-autocomplete.md`.
- **i18n: 5 new translatable strings.** Added
  `derived.expressionPlaceholder`, `derived.availableColumnsLabel`,
  `export.includeSystemColumnsLabel`, `a11y.resizeHandleLabel`, and
  `a11y.loadingRowLabel(rowNumber)`. Sites: `DefaultExpressionEditor`
  (placeholder + column-hint label), `ExportDialog` (system-columns
  checkbox), `ColumnResizer` (drag-handle ARIA), `TableBody`
  (loading-row placeholder text). `DefaultExpressionEditor`,
  `ColumnResizer`, and `TableBody` gained an optional
  `messages?: Strings` constructor option (Tier-2, additive). The
  bundled `TableContainer` and `ColumnHeader` plumb this automatically;
  consumers using a custom `editorFactory` should forward `messages`
  themselves. French overrides extended in `examples/07-i18n-french/`.
- **`AnnotationPopover` and `ColumnHeaderTooltipPopover`: stale
  aria-describedby fix.** A sequence of `show(A) → show(B)` previously
  left A's `aria-describedby` pointing at the popover after the popover
  had moved on to B. Both popovers now clear the previous anchor's
  attribute before re-pointing.
- **`ExportDialog` label-control association.** The CSV / JSON select
  elements gained `for` / `id` pairing (axe `select-name` rule) and the
  headers / pretty-print checkboxes are now wrapped inside their labels
  for implicit `label` association. Surfaced by the new axe scenarios.
- **Comprehensive axe-core suite.** `tests/a11y/axe.test.ts` expanded
  from 1 scenario (empty grid) to 12: filters open, sort active, every
  modal (Export / SQL filter / Derived column), every popover
  (annotation + header tooltip), light + dark mode, multi-table,
  `dir="rtl"` smoke. Modal scenarios re-enable `aria-required-children`
  (relaxed only for the table-root toolbar-sibling pattern). The select-
  name and checkbox-label fixes in `ExportDialog` were caught by this
  expansion.
- **Tests added: ~50+ new cases across 8 new files + 5 extensions.**
  Event-payload immutability (9), SQLFilterModal live-refresh (6),
  DerivedColumnModal live-refresh (3), DataTable.i18n keys (3),
  DefaultExpressionEditor messages (2), `buildCompletionContext` edges
  (4), KeyboardNavigator undo / redo / copy (5), VirtualScroller edges
  (5), AnnotationPopover multi-anchor (2), axe-core scenarios (10
  new), and the meta-scanner
  `tests/i18n/hardcodedStringsScan.test.ts` that prevents future
  hardcoded English strings from sneaking back in.
- **Strict-TS slice cleanup.** `noPropertyAccessFromIndexSignature`
  and `noUncheckedIndexedAccess` enabled temporarily, applied to
  `src/table/{Cell,ColumnHeader,ColumnReorder,KeyboardNavigator,TableBody,TableContainer}.ts`
  (~50 sites) plus 3 sites in `src/export/ExportQuery.ts` missed by
  Phase 7. Both flags reverted to `false` globally per the per-phase
  routing — Phase 9 flips globally.
- **Documentation.** `docs/guides/accessibility.md` adds a structured
  manual screen-reader test plan (VoiceOver / NVDA / JAWS matrix), a
  Lighthouse contrast-verification recipe, and an explicit "what's not
  yet supported" section (`prefers-contrast: more`, `forced-colors`,
  touch + drag). `docs/guides/i18n.md` documents the 5 new keys and
  the meta-scanner.
- No public-API symbol moves; `tests/api-surface.exports.test.ts` and
  `tests/api-surface.snapshot.test.ts` remain green untouched.
