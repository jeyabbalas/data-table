[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanel

# Class: DerivedColumnEditPanel

Defined in: [derived/DerivedColumnEditPanel.ts:45](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L45)

Floating panel that hosts the rename / SQL-expression editor for an
existing derived column. Composed by the facade; reach for it directly
only when assembling a custom container shell.

## Constructors

### Constructor

> **new DerivedColumnEditPanel**(`state`, `actions`, `options?`): `DerivedColumnEditPanel`

Defined in: [derived/DerivedColumnEditPanel.ts:79](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L79)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`DerivedColumnEditPanelOptions`](../interfaces/DerivedColumnEditPanelOptions.md)

#### Returns

`DerivedColumnEditPanel`

## Methods

### close()

> **close**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:513](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L513)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:746](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L746)

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [derived/DerivedColumnEditPanel.ts:742](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L742)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:734](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L734)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnEditPanel.ts:738](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L738)

#### Returns

`boolean`

***

### open()

> **open**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:392](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L392)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`

***

### toggle()

> **toggle**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:384](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnEditPanel.ts#L384)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
