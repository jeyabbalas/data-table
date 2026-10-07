[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanel

# Class: DerivedColumnEditPanel

Defined in: [derived/DerivedColumnEditPanel.ts:56](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L56)

Floating panel that hosts the rename / SQL-expression editor for an
existing derived column. Composed by the facade; reach for it directly
only when assembling a custom container shell.

## Constructors

### Constructor

> **new DerivedColumnEditPanel**(`state`, `actions`, `options?`): `DerivedColumnEditPanel`

Defined in: [derived/DerivedColumnEditPanel.ts:91](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L91)

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

Defined in: [derived/DerivedColumnEditPanel.ts:534](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L534)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:767](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L767)

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [derived/DerivedColumnEditPanel.ts:763](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L763)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:755](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L755)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnEditPanel.ts:759](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L759)

#### Returns

`boolean`

***

### open()

> **open**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:407](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L407)

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

Defined in: [derived/DerivedColumnEditPanel.ts:399](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnEditPanel.ts#L399)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
