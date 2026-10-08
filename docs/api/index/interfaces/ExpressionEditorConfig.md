[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ExpressionEditorConfig

# Interface: ExpressionEditorConfig

Defined in: [derived/ExpressionEditorTypes.ts:46](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/ExpressionEditorTypes.ts#L46)

The placeholder and accessible name a dialog gives its expression editor,
from the table's `messages`: `derived.expressionPlaceholder` and
`derived.expressionLabel` in the add-column dialog and the column edit
panel, `filters.sqlFilter.editorPlaceholder` and
`filters.sqlFilter.conditionLabel` in the expression filter.

`CodeMirrorExpressionEditor` takes it as its 4th argument and
`DefaultExpressionEditor` as its 5th; an [ExpressionEditorFactory](../type-aliases/ExpressionEditorFactory.md)
gets it as its 3rd.

## Properties

### ariaLabel?

> `optional` **ariaLabel?**: `string`

Defined in: [derived/ExpressionEditorTypes.ts:54](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/ExpressionEditorTypes.ts#L54)

The editor's accessible name, the text of the label above it. The
bundled editors replace an empty one with their default, since an
editor without a name is an unnamed text box to a screen reader.

***

### placeholder?

> `optional` **placeholder?**: `string`

Defined in: [derived/ExpressionEditorTypes.ts:48](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/derived/ExpressionEditorTypes.ts#L48)

Shown while the editor is empty. An empty string shows none.
