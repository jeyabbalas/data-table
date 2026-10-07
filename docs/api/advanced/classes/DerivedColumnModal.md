[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModal

# Class: DerivedColumnModal

Defined in: [derived/DerivedColumnModal.ts:52](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L52)

Modal dialog for creating new derived columns (SQL expression or
pre-computed vector). Composed by the facade; portal-mounted to
`document.body` (or `portalTarget`) so its z-stacking is independent of
the table's own DOM.

## Constructors

### Constructor

> **new DerivedColumnModal**(`state`, `actions`, `options?`): `DerivedColumnModal`

Defined in: [derived/DerivedColumnModal.ts:89](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L89)

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

Defined in: [derived/DerivedColumnModal.ts:860](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L860)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnModal.ts:916](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L916)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:908](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L908)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnModal.ts:912](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L912)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [derived/DerivedColumnModal.ts:837](https://github.com/jeyabbalas/data-table/blob/162e68fef8fc417c3de6b5f5df2ea0ee931673c0/src/derived/DerivedColumnModal.ts#L837)

#### Returns

`void`
