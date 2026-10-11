[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainerOptions

# Interface: TableContainerOptions

Defined in: [table/TableContainer.ts:71](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L71)

Options for configuring the TableContainer

## Properties

### annotationNavigation?

> `optional` **annotationNavigation?**: `boolean`

Defined in: [table/TableContainer.ts:184](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L184)

`F8` / `Shift+F8` and `Alt+↓` / `Alt+↑` go to the next and previous
annotation (default: true). `actions.nextAnnotation`,
`actions.previousAnnotation` and `actions.revealRow` work either way. A
failure of a search the keys start is reported through `onError`. The
facade passes its own `annotationNavigation` option.

***

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/TableContainer.ts:140](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L140)

Shared popover singleton used by `TableBody` and `ColumnHeader` to
display intersecting annotations on hover / focus. Owned by
`createDataTable`; destroyed alongside the container.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/TableContainer.ts:134](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L134)

Shared annotation store. When provided, `TableBody` and every
`ColumnHeader` render its annotations inline (tint + popover), and the
container hears its changes, once for the whole grid, to keep them up
to date without a `render()`.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableContainer.ts:77](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L77)

CSS class prefix (default: 'dt')

***

### colorScheme?

> `optional` **colorScheme?**: [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:125](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L125)

Initial light/dark theme. `'auto'` (default) follows the OS
`prefers-color-scheme`; `'light'` / `'dark'` force the theme by writing
`data-dt-color-scheme` onto the root element.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/TableContainer.ts:146](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L146)

Shared popover singleton used by `ColumnHeader` to display the app-set
column-header tooltip on hover / focus of the column-name span. Owned
by `createDataTable`; destroyed alongside the container.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../../index/type-aliases/ExpressionEditorFactory.md)

Defined in: [table/TableContainer.ts:90](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L90)

Custom expression editor factory for derived column panel/modal

***

### extractColumns?

> `optional` **extractColumns?**: `boolean`

Defined in: [table/TableContainer.ts:108](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L108)

"Extract field → column" (default: true): the extract button on every
nested and JSON column header, whose panel adds a column that reads a
part of that column, and the value inspector's "add as column" buttons,
row "+" and Ctrl/Cmd+Enter. Both add through
`actions.addNestedFieldColumn`, which works either way. Like
`showAddColumnButton`, the facade ties it to the public `derivedColumns`
option.

***

### fetchBlockSize?

> `optional` **fetchBlockSize?**: `number`

Defined in: [table/TableContainer.ts:151](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L151)

Rows fetched per scroll block, forwarded to `TableBody`. Default: 128.
Clamped to [16, 1024]. See [TableBodyOptions.fetchBlockSize](TableBodyOptions.md#fetchblocksize).

***

### headerHeight?

> `optional` **headerHeight?**: `number`

Defined in: [table/TableContainer.ts:75](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L75)

Fixed header height in pixels (default: 120 for visualizations)

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableContainer.ts:84](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L84)

Unique per-instance identifier mixed into modal and grid-cell element IDs
so two tables on the same page don't collide on `aria-labelledby` /
`aria-activedescendant` targets. Auto-generated if omitted, and a random
suffix is appended even when supplied — see `resolveInstanceId`.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableContainer.ts:127](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L127)

Resolved i18n strings. Defaults to English.

***

### onError?

> `optional` **onError?**: (`error`) => `void`

Defined in: [table/TableContainer.ts:176](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L176)

Called with a failure nothing else hears of: a panel that loads on
first use, the value inspector or the extract panel, whose chunk did
not download; the chunk that keeps an annotated filter's table of
annotated rows; or the annotation navigator's, for a navigation the
keys started (one the actions start rejects with it). The error is a
`ConfigurationError` with code `CHUNK_LOAD_FAILED`, `details.panel`
(`'valueInspector'`, `'extractPanel'`, `'annotatedRows'` or
`'annotationNavigator'`) and the import's error as `cause`; for a
panel, the live region says it too. `createDataTable` emits it as the
table's `error` event. A search the keys started that fails otherwise
comes here too.

#### Parameters

##### error

[`DataTableError`](../../index/classes/DataTableError.md)

#### Returns

`void`

***

### onFilterRemove?

> `optional` **onFilterRemove?**: (`column`) => `void`

Defined in: [table/TableContainer.ts:88](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L88)

Called when a filter is removed via filter chip, for clearing visualization state

#### Parameters

##### column

`string`

#### Returns

`void`

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [table/TableContainer.ts:119](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L119)

Where to mount fixed-position modals (derived column editor, SQL filter
modal). Defaults to `document.body`. Pass your app's modal root container
to keep the library's modals inside your stacking/portal hierarchy instead
of at the top of the document.

***

### prefetch?

> `optional` **prefetch?**: `boolean`

Defined in: [table/TableContainer.ts:162](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L162)

Speculative one-block-ahead prefetch while scrolling, forwarded to
`TableBody`. Default: true. See [TableBodyOptions.prefetch](TableBodyOptions.md#prefetch).

***

### presetManager?

> `optional` **presetManager?**: [`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

Defined in: [table/TableContainer.ts:112](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L112)

FilterPresetManager instance — enables the Presets button and preset panel

***

### rowCacheRows?

> `optional` **rowCacheRows?**: `number`

Defined in: [table/TableContainer.ts:157](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L157)

Maximum rows kept in the body's row cache, forwarded to `TableBody`.
Default: 2048, rounded up to whole blocks (floor 4 blocks). See
[TableBodyOptions.rowCacheRows](TableBodyOptions.md#rowcacherows).

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableContainer.ts:73](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L73)

Fixed row height in pixels (default: 32)

***

### showAddColumnButton?

> `optional` **showAddColumnButton?**: `boolean`

Defined in: [table/TableContainer.ts:92](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L92)

Show "+" add column button at right edge (default: true)

***

### showDerivedColumnEditIcon?

> `optional` **showDerivedColumnEditIcon?**: `boolean`

Defined in: [table/TableContainer.ts:98](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L98)

Show the f(x) edit icon on every derived-column header (default: true).
Independent of `showAddColumnButton` so `/advanced` callers can mix and
match. The facade ties both to the public `derivedColumns` option.

***

### showExpressionFilter?

> `optional` **showExpressionFilter?**: `boolean`

Defined in: [table/TableContainer.ts:110](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L110)

Show "Expression" filter button in filter bar for SQL WHERE conditions (default: true)

***

### showFilterBar?

> `optional` **showFilterBar?**: `boolean`

Defined in: [table/TableContainer.ts:86](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L86)

Show filter bar between header and body (default: true)
