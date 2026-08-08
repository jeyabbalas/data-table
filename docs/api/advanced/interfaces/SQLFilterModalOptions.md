[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModalOptions

# Interface: SQLFilterModalOptions

Defined in: [filters/SQLFilterModal.ts:19](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L19)

Construction options for [SQLFilterModal](../classes/SQLFilterModal.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/SQLFilterModal.ts:20](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L20)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:35](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L35)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [filters/SQLFilterModal.ts:29](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L29)

Custom editor factory. If omitted, uses CodeMirrorExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [filters/SQLFilterModal.ts:27](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L27)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `TableContainer`/`createDataTable()`; defaults to `''`
for standalone/test construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/SQLFilterModal.ts:37](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/SQLFilterModal.ts#L37)

Resolved i18n strings. Defaults to English.
