[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterChip

# Class: FilterChip

Defined in: [filters/FilterChip.ts:204](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterChip.ts#L204)

FilterChip renders a single filter as a removable pill-shaped chip.

## Constructors

### Constructor

> **new FilterChip**(`filter`, `onRemove`, `options?`): `FilterChip`

Defined in: [filters/FilterChip.ts:211](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterChip.ts#L211)

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md)

##### onRemove

() => `void`

##### options?

[`FilterChipOptions`](../interfaces/FilterChipOptions.md) = `{}`

#### Returns

`FilterChip`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterChip.ts:312](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterChip.ts#L312)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterChip.ts:298](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterChip.ts#L298)

Get the chip's DOM element

#### Returns

`HTMLElement`

***

### getFilter()

> **getFilter**(): [`Filter`](../../index/type-aliases/Filter.md)

Defined in: [filters/FilterChip.ts:305](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterChip.ts#L305)

Get the filter this chip represents

#### Returns

[`Filter`](../../index/type-aliases/Filter.md)
