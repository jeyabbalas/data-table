[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModalOptions

# Interface: DerivedColumnModalOptions

Defined in: [derived/DerivedColumnModal.ts:17](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L17)

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnModal.ts:18](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L18)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:35](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L35)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnModal.ts:27](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L27)

Custom editor factory (e.g., CodeMirror). If omitted, uses DefaultExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [derived/DerivedColumnModal.ts:25](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L25)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `TableContainer`/`createDataTable()`; defaults to `''`
for standalone/test construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnModal.ts:37](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L37)

Resolved i18n strings. Defaults to English.

***

### onCreated?

> `optional` **onCreated?**: () => `void`

Defined in: [derived/DerivedColumnModal.ts:29](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnModal.ts#L29)

Called after a derived column is successfully created.

#### Returns

`void`
