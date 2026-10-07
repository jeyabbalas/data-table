[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanelOptions

# Interface: DerivedColumnEditPanelOptions

Defined in: [derived/DerivedColumnEditPanel.ts:20](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L20)

Construction options for [DerivedColumnEditPanel](../classes/DerivedColumnEditPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:21](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L21)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:25](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L25)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnEditPanel.ts:23](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L23)

Custom editor factory. If omitted, uses DefaultExpressionEditor.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnEditPanel.ts:27](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L27)

Resolved i18n strings. Defaults to English.
