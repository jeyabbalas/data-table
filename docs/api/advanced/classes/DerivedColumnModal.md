[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnModal

# Class: DerivedColumnModal

Defined in: [derived/DerivedColumnModal.ts:56](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L56)

Modal dialog for creating new derived columns (SQL expression or
pre-computed vector). Composed by the facade; portal-mounted to
`document.body` (or `portalTarget`) so its z-stacking is independent of
the table's own DOM.

## Constructors

### Constructor

> **new DerivedColumnModal**(`state`, `actions`, `options?`): `DerivedColumnModal`

Defined in: [derived/DerivedColumnModal.ts:93](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L93)

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

Defined in: [derived/DerivedColumnModal.ts:869](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L869)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [derived/DerivedColumnModal.ts:925](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L925)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [derived/DerivedColumnModal.ts:917](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L917)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [derived/DerivedColumnModal.ts:921](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L921)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [derived/DerivedColumnModal.ts:846](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/derived/DerivedColumnModal.ts#L846)

#### Returns

`void`
