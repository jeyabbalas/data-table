[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModalOptions

# Interface: DerivedColumnModalOptions

Defined in: [derived/DerivedColumnModal.ts:21](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L21)

Construction options for [DerivedColumnModal](../classes/DerivedColumnModal.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnModal.ts:22](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L22)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:40](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L40)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnModal.ts:32](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L32)

Custom editor factory (e.g., CodeMirror). If omitted, uses DefaultExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [derived/DerivedColumnModal.ts:30](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L30)

Unique per-instance identifier mixed into element IDs and the radio
group name, so two tables on the same page don't collide on
`aria-labelledby` targets or share a checked radio. Normally supplied
by `TableContainer`/`createDataTable()`; a modal constructed without
one generates its own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnModal.ts:42](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L42)

Resolved i18n strings. Defaults to English.

***

### onCreated?

> `optional` **onCreated?**: () => `void`

Defined in: [derived/DerivedColumnModal.ts:34](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L34)

Called after a derived column is successfully created.

#### Returns

`void`
