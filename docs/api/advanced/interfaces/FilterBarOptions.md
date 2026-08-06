[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterBarOptions

# Interface: FilterBarOptions

Defined in: [filters/FilterBar.ts:18](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L18)

Options for FilterBar

## Properties

### alwaysShow?

> `optional` **alwaysShow?**: `boolean`

Defined in: [filters/FilterBar.ts:26](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L26)

When true, the filter bar is always visible (shows expression filter button even with no filters). Default: false.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterBar.ts:20](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L20)

CSS class prefix (default: 'dt')

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterBar.ts:32](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L32)

Resolved i18n strings. Defaults to English.

***

### onAddSQLFilter?

> `optional` **onAddSQLFilter?**: () => `void`

Defined in: [filters/FilterBar.ts:28](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L28)

Callback when the "Expression" filter button is clicked

#### Returns

`void`

***

### onFilterRemove?

> `optional` **onFilterRemove?**: (`column`) => `void`

Defined in: [filters/FilterBar.ts:22](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L22)

Called when a filter chip is removed, for clearing visualization state

#### Parameters

##### column

`string`

#### Returns

`void`

***

### onPresetsClick?

> `optional` **onPresetsClick?**: () => `void`

Defined in: [filters/FilterBar.ts:30](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L30)

Callback when the "Presets" button is clicked

#### Returns

`void`

***

### onRawSQLEdit?

> `optional` **onRawSQLEdit?**: (`id`) => `void`

Defined in: [filters/FilterBar.ts:24](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/filters/FilterBar.ts#L24)

Called when a raw-sql filter chip body is clicked (for editing). Receives the filter id.

#### Parameters

##### id

`string`

#### Returns

`void`
