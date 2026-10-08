[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelOptions

# Interface: FilterPanelOptions

Defined in: [filters/FilterPanel.ts:45](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPanel.ts#L45)

Options for FilterPanel

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterPanel.ts:47](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPanel.ts#L47)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/FilterPanel.ts:61](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPanel.ts#L61)

Element to mirror `data-dt-color-scheme` from (typically the owning
table's `.dt-root`). Keeps the panel's theming in sync when the table's
color scheme changes at runtime (see `DataTable.setColorScheme` on the
facade).

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [filters/FilterPanel.ts:54](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPanel.ts#L54)

Unique per-instance identifier mixed into the title's id, which names
the panel, so two tables on the same page don't share it. Normally
supplied by `createDataTable()`; a panel constructed without one
generates its own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterPanel.ts:63](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/filters/FilterPanel.ts#L63)

Resolved i18n strings. Defaults to English.
