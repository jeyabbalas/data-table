[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModal

# Class: SQLFilterModal

Defined in: [filters/SQLFilterModal.ts:50](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L50)

Modal dialog that hosts the raw-SQL `WHERE`-clause filter editor backed
by a CodeMirror editor (DuckDB grammar + autocompletion). On Apply, emits
a [RawSQLFilter](../../index/interfaces/RawSQLFilter.md). Treat user-authored SQL as trusted developer input
— see the trust-boundary note on `RawSQLFilter.sql`.

## Constructors

### Constructor

> **new SQLFilterModal**(`state`, `actions`, `options?`): `SQLFilterModal`

Defined in: [filters/SQLFilterModal.ts:84](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L84)

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

Defined in: [filters/SQLFilterModal.ts:551](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L551)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/SQLFilterModal.ts:594](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L594)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:586](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L586)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/SQLFilterModal.ts:590](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L590)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [filters/SQLFilterModal.ts:464](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L464)

Open the modal in create mode (empty fields)

#### Returns

`void`

***

### openForEdit()

> **openForEdit**(`filterId`, `returnFocus?`): `void`

Defined in: [filters/SQLFilterModal.ts:484](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/SQLFilterModal.ts#L484)

Open the modal in edit mode (pre-populated from existing SQL filter)

#### Parameters

##### filterId

`string`

The raw-SQL filter to edit.

##### returnFocus?

`HTMLElement`

Where focus goes when the modal closes, in place of
  the element focused when it opened. Pass one that outlives the edit:
  updating or removing the filter rebuilds the filter bar's chips.

#### Returns

`void`
