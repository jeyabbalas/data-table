[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBodyOptions

# Interface: TableBodyOptions

Defined in: [table/TableBody.ts:25](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L25)

Options for configuring the TableBody

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/TableBody.ts:59](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L59)

Shared popover singleton used to display cell-scope annotations on
hover / focus of an annotated cell.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/TableBody.ts:54](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L54)

Shared annotation store. When provided, the body applies
`dt-row--annotated` / `dt-cell--annotated` classes at render time and
subscribes to `change` events to keep visible rows in sync.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableBody.ts:29](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L29)

CSS class prefix (default: 'dt')

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableBody.ts:35](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L35)

Per-instance identifier mixed into cell DOM ids so two tables on the same
page don't collide. Required for `aria-activedescendant` to resolve;
without it cells are rendered without ids.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableBody.ts:61](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L61)

Resolved i18n strings (used for the placeholder-row label). Defaults to English.

***

### onRowsRendered?

> `optional` **onRowsRendered?**: () => `void`

Defined in: [table/TableBody.ts:42](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L42)

Called after every pass that materializes or recycles row elements.
`TableContainer` uses it to re-point `aria-activedescendant`, whose target
must be a live element — virtualization can destroy the cursor's cell
without the cursor itself changing.

#### Returns

`void`

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableBody.ts:27](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L27)

Fixed height per row in pixels (default: 32)

***

### scrollContainer?

> `optional` **scrollContainer?**: `HTMLElement`

Defined in: [table/TableBody.ts:48](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/TableBody.ts#L48)

External scroll container for unified scrolling.
When provided, VirtualScroller will use this container for scroll events
instead of creating its own scroll container.
