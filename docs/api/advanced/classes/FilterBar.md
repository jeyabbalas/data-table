[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterBar

# Class: FilterBar

Defined in: [filters/FilterBar.ts:70](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterBar.ts#L70)

FilterBar renders a horizontal bar of filter chips showing all active filters.
It auto-shows when filters are present and collapses when empty.

The chips sit in one row, in the order the filters were added, which
scrolls sideways once it is wider than the table, with "Clear all",
"Expression" and "Presets" pinned at its end. A chip that adding a filter
puts out of view is scrolled into view, smoothly; changing or removing a
filter scrolls nothing.

The bar is a `role="toolbar"` with the APG roving-tabindex treatment, so it
is a single tab stop however many chips it holds: `←` / `→` move between the
chips' remove buttons, "Clear all", "Expression" and "Presets", `Home` /
`End` jump to the ends, and the movement wraps. Removing a filter with its
chip's own button leaves the stop, and focus, on the chip next to it.

## Example

```ts
import { FilterBar } from '@jeyabbalas/data-table/advanced';

const bar = new FilterBar(state, actions, {
  classPrefix: 'dt',
  alwaysShow: false,
  onFilterRemove: (column) => console.log('cleared', column),
});
parentEl.appendChild(bar.getElement());
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

Defined in: [filters/FilterBar.ts:88](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterBar.ts#L88)

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

Defined in: [filters/FilterBar.ts:333](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterBar.ts#L333)

Destroy and clean up

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterBar.ts:326](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterBar.ts#L326)

Get the bar's DOM element

#### Returns

`HTMLElement`
