[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterChip

# Class: FilterChip

Defined in: [filters/FilterChip.ts:196](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterChip.ts#L196)

FilterChip renders a single filter as a removable pill-shaped chip.

## Constructors

### Constructor

> **new FilterChip**(`filter`, `onRemove`, `options?`): `FilterChip`

Defined in: [filters/FilterChip.ts:203](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterChip.ts#L203)

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

Defined in: [filters/FilterChip.ts:304](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterChip.ts#L304)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterChip.ts:290](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterChip.ts#L290)

Get the chip's DOM element

#### Returns

`HTMLElement`

***

### getFilter()

> **getFilter**(): [`Filter`](../../index/type-aliases/Filter.md)

Defined in: [filters/FilterChip.ts:297](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/filters/FilterChip.ts#L297)

Get the filter this chip represents

#### Returns

[`Filter`](../../index/type-aliases/Filter.md)
