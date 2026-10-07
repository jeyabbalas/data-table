[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModalOptions

# Interface: SQLFilterModalOptions

Defined in: [filters/SQLFilterModal.ts:23](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L23)

Construction options for [SQLFilterModal](../classes/SQLFilterModal.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/SQLFilterModal.ts:24](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L24)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:39](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L39)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [filters/SQLFilterModal.ts:33](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L33)

Custom editor factory. If omitted, uses CodeMirrorExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [filters/SQLFilterModal.ts:31](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L31)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `TableContainer`/`createDataTable()`; defaults to `''`
for standalone/test construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/SQLFilterModal.ts:41](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/SQLFilterModal.ts#L41)

Resolved i18n strings. Defaults to English.
