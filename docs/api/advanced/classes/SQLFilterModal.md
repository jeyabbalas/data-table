[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModal

# Class: SQLFilterModal

Defined in: [filters/SQLFilterModal.ts:38](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L38)

## Constructors

### Constructor

> **new SQLFilterModal**(`state`, `actions`, `options?`): `SQLFilterModal`

Defined in: [filters/SQLFilterModal.ts:69](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L69)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`SQLFilterModalOptions`](../interfaces/SQLFilterModalOptions.md)

#### Returns

`SQLFilterModal`

## Methods

### close()

> **close**(): `void`

Defined in: [filters/SQLFilterModal.ts:489](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L489)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/SQLFilterModal.ts:532](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L532)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:524](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L524)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/SQLFilterModal.ts:528](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L528)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [filters/SQLFilterModal.ts:422](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L422)

Open the modal in create mode (empty fields)

#### Returns

`void`

***

### openForEdit()

> **openForEdit**(`filterId`): `void`

Defined in: [filters/SQLFilterModal.ts:434](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/SQLFilterModal.ts#L434)

Open the modal in edit mode (pre-populated from existing SQL filter)

#### Parameters

##### filterId

`string`

#### Returns

`void`
