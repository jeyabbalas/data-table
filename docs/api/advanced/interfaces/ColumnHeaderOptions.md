[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderOptions

# Interface: ColumnHeaderOptions

Defined in: [table/ColumnHeader.ts:37](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L37)

Options for configuring the ColumnHeader

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/ColumnHeader.ts:77](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L77)

Shared popover singleton used to display column-scope annotations on hover / focus.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/ColumnHeader.ts:75](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L75)

Shared annotation store for column-scope annotation classes + popover.

***

### announce?

> `optional` **announce?**: (`message`) => `void`

Defined in: [table/ColumnHeader.ts:85](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L85)

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

Defined in: [table/ColumnHeader.ts:45](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L45)

DOM `id` for the header cell. `TableContainer` supplies an
instance-scoped id so `aria-activedescendant` on `.dt-grid` can name this
cell; omit it when mounting a header outside a grid.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnHeader.ts:39](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L39)

CSS class prefix (default: 'dt')

***

### colIndex?

> `optional` **colIndex?**: `number`

Defined in: [table/ColumnHeader.ts:71](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L71)

1-based column index in the *presented* order (for `aria-colindex`).
Position in `state.columnOrder`, not in the schema — ARIA requires the
values to ascend in DOM order within a row, which the schema index stops
doing the moment a column is reordered.

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/ColumnHeader.ts:79](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L79)

Shared singleton used to display the app-controlled column-name tooltip popover.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/ColumnHeader.ts:73](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L73)

Resolved i18n strings. Defaults to English.

***

### onDerivedIconClick?

> `optional` **onDerivedIconClick?**: (`columnName`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:49](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L49)

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

Defined in: [table/ColumnHeader.ts:58](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L58)

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

Defined in: [table/ColumnHeader.ts:47](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L47)

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

Defined in: [table/ColumnHeader.ts:64](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L64)

Show the f(x) edit icon on derived columns (default: true). When `false`,
the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
the facade via the public `derivedColumns` option.
