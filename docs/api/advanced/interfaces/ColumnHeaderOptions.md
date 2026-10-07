[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderOptions

# Interface: ColumnHeaderOptions

Defined in: [table/ColumnHeader.ts:36](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L36)

Options for configuring the ColumnHeader

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/ColumnHeader.ts:76](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L76)

Shared popover singleton used to display column-scope annotations on hover / focus.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/ColumnHeader.ts:74](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L74)

Shared annotation store for column-scope annotation classes + popover.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/ColumnHeader.ts:84](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L84)

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

Defined in: [table/ColumnHeader.ts:44](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L44)

DOM `id` for the header cell. `TableContainer` supplies an
instance-scoped id so `aria-activedescendant` on `.dt-grid` can name this
cell; omit it when mounting a header outside a grid.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnHeader.ts:38](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L38)

CSS class prefix (default: 'dt')

***

### colIndex?

> `optional` **colIndex?**: `number`

Defined in: [table/ColumnHeader.ts:70](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L70)

1-based column index in the *presented* order (for `aria-colindex`).
Position in `state.columnOrder`, not in the schema — ARIA requires the
values to ascend in DOM order within a row, which the schema index stops
doing the moment a column is reordered.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/ColumnHeader.ts:78](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L78)

Shared singleton used to display the app-controlled column-name tooltip popover.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/ColumnHeader.ts:72](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L72)

Resolved i18n strings. Defaults to English.

***

### onDerivedIconClick?

> `optional` **onDerivedIconClick?**: (`columnName`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:48](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L48)

Called when the f(x) icon on a derived column is clicked

#### Parameters

##### columnName

`string`

##### buttonElement

`HTMLElement`

#### Returns

`void`

***

### onExtractClick?

> `optional` **onExtractClick?**: (`column`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:57](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L57)

Called when the extract button is clicked, with the column name and the
button, under which the extract panel opens. The button
(`.dt-col-extract-btn`, after the filter button) is only on a nested or
JSON column, and only with this callback: `TableContainer` passes it
while extraction is on (`extractColumns`, which the facade ties to
`derivedColumns`).

#### Parameters

##### column

`string`

##### buttonElement

`HTMLElement`

#### Returns

`void`

***

### onFilterClick?

> `optional` **onFilterClick?**: (`column`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:46](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L46)

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

Defined in: [table/ColumnHeader.ts:63](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/table/ColumnHeader.ts#L63)

Show the f(x) edit icon on derived columns (default: true). When `false`,
the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
the facade via the public `derivedColumns` option.
