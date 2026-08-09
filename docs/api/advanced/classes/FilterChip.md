[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterChip

# Class: FilterChip

Defined in: [filters/FilterChip.ts:145](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/filters/FilterChip.ts#L145)

FilterChip renders a single filter as a removable pill-shaped chip.

## Constructors

### Constructor

> **new FilterChip**(`filter`, `onRemove`, `options?`): `FilterChip`

Defined in: [filters/FilterChip.ts:152](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/filters/FilterChip.ts#L152)

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

Defined in: [filters/FilterChip.ts:248](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/filters/FilterChip.ts#L248)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterChip.ts:234](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/filters/FilterChip.ts#L234)

Get the chip's DOM element

#### Returns

`HTMLElement`

***

### getFilter()

> **getFilter**(): [`Filter`](../../index/type-aliases/Filter.md)

Defined in: [filters/FilterChip.ts:241](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/filters/FilterChip.ts#L241)

Get the filter this chip represents

#### Returns

[`Filter`](../../index/type-aliases/Filter.md)
