[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ExpressionEditorFactory

# Type Alias: ExpressionEditorFactory

> **ExpressionEditorFactory** = (`container`, `context`) => [`ExpressionEditor`](../interfaces/ExpressionEditor.md)

Defined in: [derived/ExpressionEditorTypes.ts:39](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/ExpressionEditorTypes.ts#L39)

Factory function for creating expression editors.
Downstream apps provide this to use CodeMirror or similar.
If not provided, DefaultExpressionEditor is used.

## Parameters

### container

`HTMLElement`

### context

[`CompletionContext`](../interfaces/CompletionContext.md)

## Returns

[`ExpressionEditor`](../interfaces/ExpressionEditor.md)
