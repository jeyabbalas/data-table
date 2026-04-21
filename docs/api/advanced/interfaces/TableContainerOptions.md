[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainerOptions

# Interface: TableContainerOptions

Defined in: [table/TableContainer.ts:61](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L61)

Options for configuring the TableContainer

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableContainer.ts:67](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L67)

CSS class prefix (default: 'dt')

***

### colorScheme?

> `optional` **colorScheme?**: `ContainerColorScheme`

Defined in: [table/TableContainer.ts:98](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L98)

Initial light/dark theme. `'auto'` (default) follows the OS
`prefers-color-scheme`; `'light'` / `'dark'` force the theme by writing
`data-dt-color-scheme` onto the root element.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [table/TableContainer.ts:79](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L79)

Custom expression editor factory for derived column panel/modal

***

### headerHeight?

> `optional` **headerHeight?**: `number`

Defined in: [table/TableContainer.ts:65](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L65)

Fixed header height in pixels (default: 120 for visualizations)

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableContainer.ts:73](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L73)

Unique per-instance identifier mixed into modal element IDs so two
tables on the same page don't collide on `aria-labelledby` targets.
Auto-generated if omitted.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableContainer.ts:100](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L100)

Resolved i18n strings. Defaults to English.

***

### onFilterRemove?

> `optional` **onFilterRemove?**: (`column`) => `void`

Defined in: [table/TableContainer.ts:77](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L77)

Called when a filter is removed via filter chip, for clearing visualization state

#### Parameters

##### column

`string`

#### Returns

`void`

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [table/TableContainer.ts:92](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L92)

Where to mount fixed-position modals (derived column editor, SQL filter
modal). Defaults to `document.body`. Pass your app's modal root container
to keep the library's modals inside your stacking/portal hierarchy instead
of at the top of the document.

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [table/TableContainer.ts:85](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L85)

FilterPresetManager instance — enables the Presets button and preset panel

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableContainer.ts:63](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L63)

Fixed row height in pixels (default: 32)

***

### showAddColumnButton?

> `optional` **showAddColumnButton?**: `boolean`

Defined in: [table/TableContainer.ts:81](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L81)

Show "+" add column button at right edge (default: true)

***

### showExpressionFilter?

> `optional` **showExpressionFilter?**: `boolean`

Defined in: [table/TableContainer.ts:83](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L83)

Show "Expression" filter button in filter bar for SQL WHERE conditions (default: true)

***

### showFilterBar?

> `optional` **showFilterBar?**: `boolean`

Defined in: [table/TableContainer.ts:75](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/table/TableContainer.ts#L75)

Show filter bar between header and body (default: true)
