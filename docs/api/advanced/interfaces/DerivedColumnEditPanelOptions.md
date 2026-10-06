[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanelOptions

# Interface: DerivedColumnEditPanelOptions

Defined in: [derived/DerivedColumnEditPanel.ts:19](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnEditPanel.ts#L19)

Construction options for [DerivedColumnEditPanel](../classes/DerivedColumnEditPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:20](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnEditPanel.ts#L20)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:24](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnEditPanel.ts#L24)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnEditPanel.ts:22](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnEditPanel.ts#L22)

Custom editor factory. If omitted, uses DefaultExpressionEditor.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnEditPanel.ts:26](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnEditPanel.ts#L26)

Resolved i18n strings. Defaults to English.
