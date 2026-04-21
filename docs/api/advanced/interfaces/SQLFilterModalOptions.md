[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModalOptions

# Interface: SQLFilterModalOptions

Defined in: [filters/SQLFilterModal.ts:17](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L17)

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/SQLFilterModal.ts:18](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L18)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:33](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L33)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [filters/SQLFilterModal.ts:27](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L27)

Custom editor factory. If omitted, uses CodeMirrorExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [filters/SQLFilterModal.ts:25](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L25)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `TableContainer`/`createDataTable()`; defaults to `''`
for standalone/test construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/SQLFilterModal.ts:35](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L35)

Resolved i18n strings. Defaults to English.
