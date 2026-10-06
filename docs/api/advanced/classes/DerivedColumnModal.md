[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModal

# Class: DerivedColumnModal

Defined in: [derived/DerivedColumnModal.ts:51](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L51)

Modal dialog for creating new derived columns (SQL expression or
pre-computed vector). Composed by the facade; portal-mounted to
`document.body` (or `portalTarget`) so its z-stacking is independent of
the table's own DOM.

## Constructors

### Constructor

> **new DerivedColumnModal**(`state`, `actions`, `options?`): `DerivedColumnModal`

Defined in: [derived/DerivedColumnModal.ts:88](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L88)

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

Defined in: [derived/DerivedColumnModal.ts:829](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L829)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnModal.ts:887](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L887)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:879](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L879)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnModal.ts:883](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L883)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [derived/DerivedColumnModal.ts:806](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/derived/DerivedColumnModal.ts#L806)

#### Returns

`void`
