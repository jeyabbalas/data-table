[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModal

# Class: DerivedColumnModal

Defined in: [derived/DerivedColumnModal.ts:48](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L48)

Modal dialog for creating new derived columns (SQL expression or
pre-computed vector). Composed by the facade; portal-mounted to
`document.body` (or `portalTarget`) so its z-stacking is independent of
the table's own DOM.

## Constructors

### Constructor

> **new DerivedColumnModal**(`state`, `actions`, `options?`): `DerivedColumnModal`

Defined in: [derived/DerivedColumnModal.ts:85](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L85)

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

Defined in: [derived/DerivedColumnModal.ts:816](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L816)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnModal.ts:874](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L874)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:866](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L866)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnModal.ts:870](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L870)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [derived/DerivedColumnModal.ts:793](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/derived/DerivedColumnModal.ts#L793)

#### Returns

`void`
