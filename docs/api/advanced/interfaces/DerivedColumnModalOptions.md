[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModalOptions

# Interface: DerivedColumnModalOptions

Defined in: [derived/DerivedColumnModal.ts:19](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L19)

Construction options for [DerivedColumnModal](../classes/DerivedColumnModal.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnModal.ts:20](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L20)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:37](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L37)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnModal.ts:29](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L29)

Custom editor factory (e.g., CodeMirror). If omitted, uses DefaultExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [derived/DerivedColumnModal.ts:27](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L27)

Unique per-instance identifier mixed into element IDs so two tables on
the same page don't collide on `aria-labelledby` targets. Normally
supplied by `TableContainer`/`createDataTable()`; defaults to `''`
for standalone/test construction.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnModal.ts:39](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L39)

Resolved i18n strings. Defaults to English.

***

### onCreated?

> `optional` **onCreated?**: () => `void`

Defined in: [derived/DerivedColumnModal.ts:31](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/derived/DerivedColumnModal.ts#L31)

Called after a derived column is successfully created.

#### Returns

`void`
