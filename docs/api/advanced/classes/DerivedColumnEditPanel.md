[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnEditPanel

# Class: DerivedColumnEditPanel

Defined in: [derived/DerivedColumnEditPanel.ts:33](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L33)

Floating panel that hosts the rename / SQL-expression editor for an
existing derived column. Composed by the facade; reach for it directly
only when assembling a custom container shell.

## Constructors

### Constructor

> **new DerivedColumnEditPanel**(`state`, `actions`, `options?`): `DerivedColumnEditPanel`

Defined in: [derived/DerivedColumnEditPanel.ts:66](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L66)

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

Defined in: [derived/DerivedColumnEditPanel.ts:483](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L483)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:687](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L687)

#### Returns

`void`

***

### getCurrentColumn()

> **getCurrentColumn**(): `string` \| `null`

Defined in: [derived/DerivedColumnEditPanel.ts:683](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L683)

#### Returns

`string` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnEditPanel.ts:675](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L675)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnEditPanel.ts:679](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L679)

#### Returns

`boolean`

***

### open()

> **open**(`columnName`, `anchorElement`): `void`

Defined in: [derived/DerivedColumnEditPanel.ts:365](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L365)

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

Defined in: [derived/DerivedColumnEditPanel.ts:357](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/derived/DerivedColumnEditPanel.ts#L357)

#### Parameters

##### columnName

`string`

##### anchorElement

`HTMLElement`

#### Returns

`void`
