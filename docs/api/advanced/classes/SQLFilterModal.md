[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModal

# Class: SQLFilterModal

Defined in: [filters/SQLFilterModal.ts:46](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L46)

Modal dialog that hosts the raw-SQL `WHERE`-clause filter editor backed
by a CodeMirror editor (DuckDB grammar + autocompletion). On Apply, emits
a [RawSQLFilter](../../index/interfaces/RawSQLFilter.md). Treat user-authored SQL as trusted developer input
— see the trust-boundary note on `RawSQLFilter.sql`.

## Constructors

### Constructor

> **new SQLFilterModal**(`state`, `actions`, `options?`): `SQLFilterModal`

Defined in: [filters/SQLFilterModal.ts:80](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L80)

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

Defined in: [filters/SQLFilterModal.ts:514](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L514)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/SQLFilterModal.ts:557](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L557)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:549](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L549)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/SQLFilterModal.ts:553](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L553)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [filters/SQLFilterModal.ts:447](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L447)

Open the modal in create mode (empty fields)

#### Returns

`void`

***

### openForEdit()

> **openForEdit**(`filterId`): `void`

Defined in: [filters/SQLFilterModal.ts:459](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/filters/SQLFilterModal.ts#L459)

Open the modal in edit mode (pre-populated from existing SQL filter)

#### Parameters

##### filterId

`string`

#### Returns

`void`
