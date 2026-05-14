---
'@jeyabbalas/data-table': minor
---

Add `derivedColumns` option to `createDataTable` and lazy-load the SQL / derived-column modal chunks.

Set `derivedColumns: false` to hide the "+" add-column button and the per-header `f(x)` edit icon. The programmatic API (`actions.addDerivedColumn`, `actions.removeDerivedColumn`, `actions.updateDerivedColumn`) is unaffected.

`SQLFilterModal`, `DerivedColumnModal`, `DerivedColumnEditPanel`, and `FilterPresetPanel` now load via dynamic `import()` inside the click handlers that open them. Consumers' bundlers chunk-split these out of the main bundle and only fetch them on first use. Combined with `expressionFilter: false` and `derivedColumns: false`, this lets consumers omit the `@codemirror/*` and `@lezer/highlight` optional peer dependencies entirely.

No breaking changes. The `/advanced` entry's exports of these modal classes still drag CodeMirror through their static module-top imports — that remains the documented contract for the power-user entry.

Tightened raw-SQL chip styling so the chip body no longer shows a `cursor: pointer` or an underline-on-hover affordance when `expressionFilter: false`. The chip stays visible (and removable via its `×`) but no longer hints at an action that does nothing.
