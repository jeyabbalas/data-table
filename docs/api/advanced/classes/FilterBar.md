[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterBar

# Class: FilterBar

Defined in: [filters/FilterBar.ts:61](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterBar.ts#L61)

FilterBar renders a horizontal bar of filter chips showing all active filters.
It auto-shows when filters are present and collapses when empty.

The bar is a `role="toolbar"` with the APG roving-tabindex treatment, so it
is a single tab stop however many chips it holds: `←` / `→` move between the
chips' remove buttons, "Clear all", "Expression" and "Presets", `Home` /
`End` jump to the ends, and the movement wraps.

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

Defined in: [filters/FilterBar.ts:75](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterBar.ts#L75)

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

Defined in: [filters/FilterBar.ts:268](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterBar.ts#L268)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterBar.ts:261](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/filters/FilterBar.ts#L261)

Get the bar's DOM element

#### Returns

`HTMLElement`
