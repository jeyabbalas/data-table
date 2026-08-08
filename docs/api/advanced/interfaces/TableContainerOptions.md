[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainerOptions

# Interface: TableContainerOptions

Defined in: [table/TableContainer.ts:60](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L60)

Options for configuring the TableContainer

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/TableContainer.ts:118](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L118)

Shared popover singleton used by `TableBody` and `ColumnHeader` to
display intersecting annotations on hover / focus. Owned by
`createDataTable`; destroyed alongside the container.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/TableContainer.ts:112](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L112)

Shared annotation store. When provided, `TableBody` and every
`ColumnHeader` subscribe to it so annotations render inline (tint +
popover) without requiring a full `render()`.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableContainer.ts:66](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L66)

CSS class prefix (default: 'dt')

***

### colorScheme?

> `optional` **colorScheme?**: [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:104](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L104)

Initial light/dark theme. `'auto'` (default) follows the OS
`prefers-color-scheme`; `'light'` / `'dark'` force the theme by writing
`data-dt-color-scheme` onto the root element.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/TableContainer.ts:124](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L124)

Shared popover singleton used by `ColumnHeader` to display the app-set
column-header tooltip on hover / focus of the column-name span. Owned
by `createDataTable`; destroyed alongside the container.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [table/TableContainer.ts:79](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L79)

Custom expression editor factory for derived column panel/modal

***

### fetchBlockSize?

> `optional` **fetchBlockSize?**: `number`

Defined in: [table/TableContainer.ts:129](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L129)

Rows fetched per scroll block, forwarded to `TableBody`. Default: 128.
Clamped to [16, 1024]. See [TableBodyOptions.fetchBlockSize](TableBodyOptions.md#fetchblocksize).

***

### headerHeight?

> `optional` **headerHeight?**: `number`

Defined in: [table/TableContainer.ts:64](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L64)

Fixed header height in pixels (default: 120 for visualizations)

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableContainer.ts:73](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L73)

Unique per-instance identifier mixed into modal and grid-cell element IDs
so two tables on the same page don't collide on `aria-labelledby` /
`aria-activedescendant` targets. Auto-generated if omitted, and a random
suffix is appended even when supplied — see `resolveInstanceId`.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableContainer.ts:106](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L106)

Resolved i18n strings. Defaults to English.

***

### onFilterRemove?

> `optional` **onFilterRemove?**: (`column`) => `void`

Defined in: [table/TableContainer.ts:77](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L77)

Called when a filter is removed via filter chip, for clearing visualization state

#### Parameters

##### column

`string`

#### Returns

`void`

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [table/TableContainer.ts:98](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L98)

Where to mount fixed-position modals (derived column editor, SQL filter
modal). Defaults to `document.body`. Pass your app's modal root container
to keep the library's modals inside your stacking/portal hierarchy instead
of at the top of the document.

***

### prefetch?

> `optional` **prefetch?**: `boolean`

Defined in: [table/TableContainer.ts:140](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L140)

Speculative one-block-ahead prefetch while scrolling, forwarded to
`TableBody`. Default: true. See [TableBodyOptions.prefetch](TableBodyOptions.md#prefetch).

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [table/TableContainer.ts:91](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L91)

FilterPresetManager instance — enables the Presets button and preset panel

***

### rowCacheRows?

> `optional` **rowCacheRows?**: `number`

Defined in: [table/TableContainer.ts:135](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L135)

Maximum rows kept in the body's row cache, forwarded to `TableBody`.
Default: 2048, rounded up to whole blocks (floor 4 blocks). See
[TableBodyOptions.rowCacheRows](TableBodyOptions.md#rowcacherows).

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableContainer.ts:62](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L62)

Fixed row height in pixels (default: 32)

***

### showAddColumnButton?

> `optional` **showAddColumnButton?**: `boolean`

Defined in: [table/TableContainer.ts:81](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L81)

Show "+" add column button at right edge (default: true)

***

### showDerivedColumnEditIcon?

> `optional` **showDerivedColumnEditIcon?**: `boolean`

Defined in: [table/TableContainer.ts:87](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L87)

Show the f(x) edit icon on every derived-column header (default: true).
Independent of `showAddColumnButton` so `/advanced` callers can mix and
match. The facade ties both to the public `derivedColumns` option.

***

### showExpressionFilter?

> `optional` **showExpressionFilter?**: `boolean`

Defined in: [table/TableContainer.ts:89](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L89)

Show "Expression" filter button in filter bar for SQL WHERE conditions (default: true)

***

### showFilterBar?

> `optional` **showFilterBar?**: `boolean`

Defined in: [table/TableContainer.ts:75](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/table/TableContainer.ts#L75)

Show filter bar between header and body (default: true)
