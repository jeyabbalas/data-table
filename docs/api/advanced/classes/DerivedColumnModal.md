[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModal

# Class: DerivedColumnModal

Defined in: [derived/DerivedColumnModal.ts:52](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L52)

Modal dialog for creating new derived columns (SQL expression or
pre-computed vector). Composed by the facade; portal-mounted to
`document.body` (or `portalTarget`) so its z-stacking is independent of
the table's own DOM.

## Constructors

### Constructor

> **new DerivedColumnModal**(`state`, `actions`, `options?`): `DerivedColumnModal`

Defined in: [derived/DerivedColumnModal.ts:89](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L89)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`DerivedColumnModalOptions`](../interfaces/DerivedColumnModalOptions.md)

#### Returns

`DerivedColumnModal`

## Methods

### close()

> **close**(): `void`

Defined in: [derived/DerivedColumnModal.ts:834](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L834)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnModal.ts:892](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L892)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:884](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L884)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnModal.ts:888](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L888)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [derived/DerivedColumnModal.ts:811](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/derived/DerivedColumnModal.ts#L811)

#### Returns

`void`
