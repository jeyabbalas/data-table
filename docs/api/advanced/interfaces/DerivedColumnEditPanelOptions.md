[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanelOptions

# Interface: DerivedColumnEditPanelOptions

Defined in: [derived/DerivedColumnEditPanel.ts:18](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/derived/DerivedColumnEditPanel.ts#L18)

Construction options for [DerivedColumnEditPanel](../classes/DerivedColumnEditPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:19](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/derived/DerivedColumnEditPanel.ts#L19)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:23](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/derived/DerivedColumnEditPanel.ts#L23)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnEditPanel.ts:21](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/derived/DerivedColumnEditPanel.ts#L21)

Custom editor factory. If omitted, uses DefaultExpressionEditor.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnEditPanel.ts:25](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/derived/DerivedColumnEditPanel.ts#L25)

Resolved i18n strings. Defaults to English.
