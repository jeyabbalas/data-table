[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanel

# Class: DerivedColumnEditPanel

Defined in: [derived/DerivedColumnEditPanel.ts:44](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L44)

Floating panel that hosts the rename / SQL-expression editor for an
existing derived column. Composed by the facade; reach for it directly
only when assembling a custom container shell.

## Constructors

### Constructor

> **new DerivedColumnEditPanel**(`state`, `actions`, `options?`): `DerivedColumnEditPanel`

Defined in: [derived/DerivedColumnEditPanel.ts:78](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L78)

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

Defined in: [derived/DerivedColumnEditPanel.ts:505](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L505)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:723](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L723)

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [derived/DerivedColumnEditPanel.ts:719](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L719)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:711](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L711)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnEditPanel.ts:715](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L715)

#### Returns

`boolean`

***

### open()

> **open**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:383](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L383)

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

Defined in: [derived/DerivedColumnEditPanel.ts:375](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnEditPanel.ts#L375)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
