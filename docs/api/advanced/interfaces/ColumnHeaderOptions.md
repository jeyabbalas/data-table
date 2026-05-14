[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderOptions

# Interface: ColumnHeaderOptions

Defined in: [table/ColumnHeader.ts:27](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L27)

Options for configuring the ColumnHeader

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/ColumnHeader.ts:47](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L47)

Shared popover singleton used to display column-scope annotations on hover / focus.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/ColumnHeader.ts:45](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L45)

Shared annotation store for column-scope annotation classes + popover.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/ColumnHeader.ts:29](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L29)

CSS class prefix (default: 'dt')

***

### colIndex?

> `optional` **colIndex?**: `number`

Defined in: [table/ColumnHeader.ts:41](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L41)

1-based column index in the full schema (for aria-colindex)

***

### columnHeaderTooltipPopover?

> `optional` **columnHeaderTooltipPopover?**: [`ColumnHeaderTooltipPopover`](../classes/ColumnHeaderTooltipPopover.md)

Defined in: [table/ColumnHeader.ts:49](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L49)

Shared singleton used to display the app-controlled column-name tooltip popover.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/ColumnHeader.ts:43](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L43)

Resolved i18n strings. Defaults to English.

***

### onDerivedIconClick?

> `optional` **onDerivedIconClick?**: (`columnName`, `buttonElement`) => `void`

Defined in: [table/ColumnHeader.ts:33](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L33)

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

Defined in: [table/ColumnHeader.ts:31](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L31)

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

Defined in: [table/ColumnHeader.ts:39](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/ColumnHeader.ts#L39)

Show the f(x) edit icon on derived columns (default: true). When `false`,
the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
the facade via the public `derivedColumns` option.
