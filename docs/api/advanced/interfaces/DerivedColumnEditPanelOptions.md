[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanelOptions

# Interface: DerivedColumnEditPanelOptions

Defined in: [derived/DerivedColumnEditPanel.ts:18](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/derived/DerivedColumnEditPanel.ts#L18)

Construction options for [DerivedColumnEditPanel](../classes/DerivedColumnEditPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [derived/DerivedColumnEditPanel.ts:19](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/derived/DerivedColumnEditPanel.ts#L19)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:23](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/derived/DerivedColumnEditPanel.ts#L23)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [derived/DerivedColumnEditPanel.ts:21](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/derived/DerivedColumnEditPanel.ts#L21)

Custom editor factory. If omitted, uses DefaultExpressionEditor.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [derived/DerivedColumnEditPanel.ts:25](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/derived/DerivedColumnEditPanel.ts#L25)

Resolved i18n strings. Defaults to English.
