[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterBarOptions

# Interface: FilterBarOptions

Defined in: [filters/FilterBar.ts:17](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L17)

Options for FilterBar

## Properties

### alwaysShow?

> `optional` **alwaysShow?**: `boolean`

Defined in: [filters/FilterBar.ts:25](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L25)

When true, the filter bar is always visible (shows expression filter button even with no filters). Default: false.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [filters/FilterBar.ts:19](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L19)

CSS class prefix (default: 'dt')

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [filters/FilterBar.ts:31](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L31)

Resolved i18n strings. Defaults to English.

***

### onAddSQLFilter?

> `optional` **onAddSQLFilter?**: () => `void`

Defined in: [filters/FilterBar.ts:27](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L27)

Callback when the "Expression" filter button is clicked

#### Returns

`void`

***

### onFilterRemove?

> `optional` **onFilterRemove?**: (`column`) => `void`

Defined in: [filters/FilterBar.ts:21](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L21)

Called when a filter chip is removed, for clearing visualization state

#### Parameters

##### column

`string`

#### Returns

`void`

***

### onPresetsClick?

> `optional` **onPresetsClick?**: () => `void`

Defined in: [filters/FilterBar.ts:29](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L29)

Callback when the "Presets" button is clicked

#### Returns

`void`

***

### onRawSQLEdit?

> `optional` **onRawSQLEdit?**: (`id`) => `void`

Defined in: [filters/FilterBar.ts:23](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/filters/FilterBar.ts#L23)

Called when a raw-sql filter chip body is clicked (for editing). Receives the filter id.

#### Parameters

##### id

`string`

#### Returns

`void`
