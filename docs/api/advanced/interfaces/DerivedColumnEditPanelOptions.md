[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanelOptions

# Interface: DerivedColumnEditPanelOptions

Defined in: [derived/DerivedColumnEditPanel.ts:25](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L25)

Construction options for [DerivedColumnEditPanel](../classes/DerivedColumnEditPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:26](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L26)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:30](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L30)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnEditPanel.ts:28](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L28)

Custom editor factory. If omitted, uses CodeMirrorExpressionEditor.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:48](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L48)

Unique per-instance identifier mixed into element IDs (the title, which
names the panel, and the name field), so two tables on the same page
don't share them. Normally supplied by `createDataTable()`; a panel
constructed without one generates its own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnEditPanel.ts:32](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/DerivedColumnEditPanel.ts#L32)

Resolved i18n strings. Defaults to English.
