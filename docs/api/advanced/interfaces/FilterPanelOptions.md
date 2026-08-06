[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPanelOptions

# Interface: FilterPanelOptions

Defined in: [filters/FilterPanel.ts:43](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterPanel.ts#L43)

Options for FilterPanel

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterPanel.ts:45](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterPanel.ts#L45)

CSS class prefix (default: 'dt')

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/FilterPanel.ts:52](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterPanel.ts#L52)

Element to mirror `data-dt-color-scheme` from (typically the owning
table's `.dt-root`). Keeps the panel's theming in sync when the table's
color scheme changes at runtime (see `DataTable.setColorScheme` on the
facade).

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterPanel.ts:54](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterPanel.ts#L54)

Resolved i18n strings. Defaults to English.
