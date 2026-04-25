[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterBar

# Class: FilterBar

Defined in: [filters/FilterBar.ts:55](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterBar.ts#L55)

FilterBar renders a horizontal bar of filter chips showing all active filters.
It auto-shows when filters are present and collapses when empty.

## Example

```ts
import { FilterBar } from '@jeyabbalas/data-table/advanced';

const bar = new FilterBar(parentEl, state, actions, {
  classPrefix: 'dt',
  alwaysShow: false,
  onFilterRemove: (column) => console.log('cleared', column),
});
// unmount:
bar.destroy();
```

## See

 - FilterChip
 - FilterPanel
 - FilterPanelField
 - SQLFilterModal
 - FilterPresetPanel

## Constructors

### Constructor

> **new FilterBar**(`state`, `actions`, `options?`): `FilterBar`

Defined in: [filters/FilterBar.ts:68](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterBar.ts#L68)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`FilterBarOptions`](../interfaces/FilterBarOptions.md) = `{}`

#### Returns

`FilterBar`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterBar.ts:251](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterBar.ts#L251)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterBar.ts:244](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/filters/FilterBar.ts#L244)

Get the bar's DOM element

#### Returns

`HTMLElement`
