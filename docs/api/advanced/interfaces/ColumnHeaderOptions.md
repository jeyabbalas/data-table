[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderOptions

# Interface: ColumnHeaderOptions

Defined in: [table/ColumnHeader.ts:27](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L27)

Options for configuring the ColumnHeader

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/ColumnHeader.ts:58](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L58)

Shared popover singleton used to display column-scope annotations on hover / focus.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/ColumnHeader.ts:56](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L56)

Shared annotation store for column-scope annotation classes + popover.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/ColumnHeader.ts:66](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L66)

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

Defined in: [table/ColumnHeader.ts:35](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L35)

DOM `id` for the header cell. `TableContainer` supplies an
instance-scoped id so `aria-activedescendant` on `.dt-grid` can name this
cell; omit it when mounting a header outside a grid.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnHeader.ts:29](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L29)

CSS class prefix (default: 'dt')

***

### colIndex?

> `optional` **colIndex?**: `number`

Defined in: [table/ColumnHeader.ts:52](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L52)

1-based column index in the *presented* order (for `aria-colindex`).
Position in `state.columnOrder`, not in the schema — ARIA requires the
values to ascend in DOM order within a row, which the schema index stops
doing the moment a column is reordered.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/ColumnHeader.ts:60](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L60)

Shared singleton used to display the app-controlled column-name tooltip popover.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/ColumnHeader.ts:54](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L54)

Resolved i18n strings. Defaults to English.

***

### onDerivedIconClick?

> `optional` **onDerivedIconClick?**: (`columnName`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:39](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L39)

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

Defined in: [table/ColumnHeader.ts:37](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L37)

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

Defined in: [table/ColumnHeader.ts:45](https://github.com/jeyabbalas/data-table/blob/44506eead652a93da8d9e891a568f01017354a73/src/table/ColumnHeader.ts#L45)

Show the f(x) edit icon on derived columns (default: true). When `false`,
the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
the facade via the public `derivedColumns` option.
