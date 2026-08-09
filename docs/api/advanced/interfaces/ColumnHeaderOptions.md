[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderOptions

# Interface: ColumnHeaderOptions

Defined in: [table/ColumnHeader.ts:28](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L28)

Options for configuring the ColumnHeader

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/ColumnHeader.ts:59](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L59)

Shared popover singleton used to display column-scope annotations on hover / focus.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/ColumnHeader.ts:57](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L57)

Shared annotation store for column-scope annotation classes + popover.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/ColumnHeader.ts:67](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L67)

Write a transient message to a polite live region. Used to announce the
final width after a resize drag, which is otherwise silent to a screen
reader. `TableContainer.announce` is the wiring.

#### Parameters

##### message

`string`

#### Returns

`void`

***

### cellId?

> `optional` **cellId?**: `string`

Defined in: [table/ColumnHeader.ts:36](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L36)

DOM `id` for the header cell. `TableContainer` supplies an
instance-scoped id so `aria-activedescendant` on `.dt-grid` can name this
cell; omit it when mounting a header outside a grid.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnHeader.ts:30](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L30)

CSS class prefix (default: 'dt')

***

### colIndex?

> `optional` **colIndex?**: `number`

Defined in: [table/ColumnHeader.ts:53](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L53)

1-based column index in the *presented* order (for `aria-colindex`).
Position in `state.columnOrder`, not in the schema — ARIA requires the
values to ascend in DOM order within a row, which the schema index stops
doing the moment a column is reordered.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/ColumnHeader.ts:61](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L61)

Shared singleton used to display the app-controlled column-name tooltip popover.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/ColumnHeader.ts:55](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L55)

Resolved i18n strings. Defaults to English.

***

### onDerivedIconClick?

> `optional` **onDerivedIconClick?**: (`columnName`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:40](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L40)

Called when the f(x) icon on a derived column is clicked

#### Parameters

##### columnName

`string`

##### buttonElement

`HTMLElement`

#### Returns

`void`

***

### onFilterClick?

> `optional` **onFilterClick?**: (`column`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:38](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L38)

Called when the filter button is clicked, with column name and button element for positioning

#### Parameters

##### column

`string`

##### buttonElement

`HTMLElement`

#### Returns

`void`

***

### showDerivedEditIcon?

> `optional` **showDerivedEditIcon?**: `boolean`

Defined in: [table/ColumnHeader.ts:46](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L46)

Show the f(x) edit icon on derived columns (default: true). When `false`,
the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
the facade via the public `derivedColumns` option.

***

### subscribe?

> `optional` **subscribe?**: `boolean`

Defined in: [table/ColumnHeader.ts:92](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/ColumnHeader.ts#L92)

Subscribe to the table's state signals directly (default: `true`).

A header self-subscribes to seven of them — sort, row count, pins,
filters, visible columns, the annotation store and the tooltip overrides —
which is fine for one header and is seven times the mounted-header count
when something owns many. `TableContainer` therefore mounts its headers
with `false` and fans the same seven out itself, so the subscriber count
is a small constant rather than a multiple of the window, and a scroll
that mounts and unmounts headers produces no subscribe churn at all.

Current values are still pulled in the constructor either way, so a header
is correct the moment it exists. What `false` turns off is only the
*reaction* to later changes, which the owner then owes it through
[ColumnHeader.update](../classes/ColumnHeader.md#update), [ColumnHeader.refreshStatsLine](../classes/ColumnHeader.md#refreshstatsline),
[ColumnHeader.refreshPinState](../classes/ColumnHeader.md#refreshpinstate),
[ColumnHeader.refreshFilterIndicator](../classes/ColumnHeader.md#refreshfilterindicator),
[ColumnHeader.refreshHideButtonState](../classes/ColumnHeader.md#refreshhidebuttonstate),
[ColumnHeader.refreshAnnotations](../classes/ColumnHeader.md#refreshannotations) and
[ColumnHeader.refreshTooltip](../classes/ColumnHeader.md#refreshtooltip).

Defaults to `true` so a header constructed directly through `/advanced` is
self-sufficient, which is what it has always been.
