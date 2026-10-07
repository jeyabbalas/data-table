[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPresetPanelOptions

# Interface: FilterPresetPanelOptions

Defined in: [filters/FilterPresetPanel.ts:17](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterPresetPanel.ts#L17)

Construction options for [FilterPresetPanel](../classes/FilterPresetPanel.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterPresetPanel.ts:18](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterPresetPanel.ts#L18)

***

### colorSchemeSource?

> `optional` **colorSchemeSource?**: `HTMLElement`

Defined in: [filters/FilterPresetPanel.ts:27](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterPresetPanel.ts#L27)

Element to mirror `data-dt-color-scheme` from (typically `.dt-root`).

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [filters/FilterPresetPanel.ts:25](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterPresetPanel.ts#L25)

Unique per-instance identifier mixed into the title's id, which names
the panel, so two tables on the same page don't share it. Normally
supplied by `createDataTable()`; a panel constructed without one
generates its own.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterPresetPanel.ts:29](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/filters/FilterPresetPanel.ts#L29)

Resolved i18n strings. Defaults to English.
