[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ExpressionEditorFactory

# Type Alias: ExpressionEditorFactory

> **ExpressionEditorFactory** = (`container`, `context`, `config`) => [`ExpressionEditor`](../interfaces/ExpressionEditor.md)

Defined in: [derived/ExpressionEditorTypes.ts:67](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/ExpressionEditorTypes.ts#L67)

Factory function for creating expression editors.
Downstream apps provide this to use DefaultExpressionEditor, Monaco or
similar. If not provided, CodeMirrorExpressionEditor is used.

`config` is the dialog's placeholder and accessible name, in the table's
language. Pass it on, as
`(c, ctx, config) => new DefaultExpressionEditor(c, ctx, 'dt', undefined, config)`
does. A factory written for two arguments still fits this type.

## Parameters

### container

`HTMLElement`

### context

[`CompletionContext`](../interfaces/CompletionContext.md)

### config

[`ExpressionEditorConfig`](../interfaces/ExpressionEditorConfig.md)

## Returns

[`ExpressionEditor`](../interfaces/ExpressionEditor.md)
