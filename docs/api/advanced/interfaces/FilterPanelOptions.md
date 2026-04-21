[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelOptions

# Interface: FilterPanelOptions

Defined in: [filters/FilterPanel.ts:43](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L43)

Options for FilterPanel

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterPanel.ts:45](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L45)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/FilterPanel.ts:51](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L51)

Element to mirror `data-dt-color-scheme` from (typically the owning
table's `.dt-root`). Keeps the panel's theming in sync when the table's
color scheme changes at runtime via DataTable.setColorScheme.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterPanel.ts:53](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterPanel.ts#L53)

Resolved i18n strings. Defaults to English.
