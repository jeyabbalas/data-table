[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModalOptions

# Interface: DerivedColumnModalOptions

Defined in: [derived/DerivedColumnModal.ts:26](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L26)

Construction options for [DerivedColumnModal](../classes/DerivedColumnModal.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnModal.ts:27](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L27)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:45](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L45)

Element to mirror `data-dt-color-scheme` from. The modal backdrop
portals to `<body>` so it doesn't inherit from `.dt-root` via the DOM —
pass the `.dt-root` element here to keep it theme-synced.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnModal.ts:37](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L37)

Custom editor factory. If omitted, uses CodeMirrorExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [derived/DerivedColumnModal.ts:35](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L35)

Unique per-instance identifier mixed into element IDs and the radio
group name, so two tables on the same page don't collide on
`aria-labelledby` targets or share a checked radio. Normally supplied
by `TableContainer`/`createDataTable()`; a modal constructed without
one generates its own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnModal.ts:47](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L47)

Resolved i18n strings. Defaults to English.

***

### onCreated?

> `optional` **onCreated?**: () => `void`

Defined in: [derived/DerivedColumnModal.ts:39](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnModal.ts#L39)

Called after a derived column is successfully created.

#### Returns

`void`
