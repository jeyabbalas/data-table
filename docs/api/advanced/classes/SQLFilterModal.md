[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / SQLFilterModal

# Class: SQLFilterModal

Defined in: [filters/SQLFilterModal.ts:46](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L46)

Modal dialog that hosts the raw-SQL `WHERE`-clause filter editor backed
by a CodeMirror editor (DuckDB grammar + autocompletion). On Apply, emits
a [RawSQLFilter](../../index/interfaces/RawSQLFilter.md). Treat user-authored SQL as trusted developer input
— see the trust-boundary note on `RawSQLFilter.sql`.

## Constructors

### Constructor

> **new SQLFilterModal**(`state`, `actions`, `options?`): `SQLFilterModal`

Defined in: [filters/SQLFilterModal.ts:80](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L80)

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

Defined in: [filters/SQLFilterModal.ts:543](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L543)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/SQLFilterModal.ts:586](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L586)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/SQLFilterModal.ts:578](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L578)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/SQLFilterModal.ts:582](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L582)

#### Returns

`boolean`

***

### open()

> **open**(): `void`

Defined in: [filters/SQLFilterModal.ts:456](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L456)

Open the modal in create mode (empty fields)

#### Returns

`void`

***

### openForEdit()

> **openForEdit**(`filterId`, `returnFocus?`): `void`

Defined in: [filters/SQLFilterModal.ts:476](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/SQLFilterModal.ts#L476)

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
