[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanel

# Class: DerivedColumnEditPanel

Defined in: [derived/DerivedColumnEditPanel.ts:27](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L27)

## Constructors

### Constructor

> **new DerivedColumnEditPanel**(`state`, `actions`, `options?`): `DerivedColumnEditPanel`

Defined in: [derived/DerivedColumnEditPanel.ts:60](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L60)

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

Defined in: [derived/DerivedColumnEditPanel.ts:476](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L476)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:686](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L686)

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [derived/DerivedColumnEditPanel.ts:682](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L682)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:674](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L674)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnEditPanel.ts:678](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L678)

#### Returns

`boolean`

***

### open()

> **open**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:361](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L361)

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

Defined in: [derived/DerivedColumnEditPanel.ts:353](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/derived/DerivedColumnEditPanel.ts#L353)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
