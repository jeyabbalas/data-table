[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterChip

# Class: FilterChip

Defined in: [filters/FilterChip.ts:190](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterChip.ts#L190)

FilterChip renders a single filter as a removable pill-shaped chip.

## Constructors

### Constructor

> **new FilterChip**(`filter`, `onRemove`, `options?`): `FilterChip`

Defined in: [filters/FilterChip.ts:197](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterChip.ts#L197)

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

Defined in: [filters/FilterChip.ts:298](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterChip.ts#L298)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterChip.ts:284](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterChip.ts#L284)

Get the chip's DOM element

#### Returns

`HTMLElement`

***

### getFilter()

> **getFilter**(): [`Filter`](../../index/type-aliases/Filter.md)

Defined in: [filters/FilterChip.ts:291](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterChip.ts#L291)

Get the filter this chip represents

#### Returns

[`Filter`](../../index/type-aliases/Filter.md)
