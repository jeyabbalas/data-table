[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBodyOptions

# Interface: TableBodyOptions

Defined in: [table/TableBody.ts:44](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L44)

Options for configuring the TableBody

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/TableBody.ts:107](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L107)

Shared popover singleton used to display cell-scope annotations on
hover / focus of an annotated cell.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/TableBody.ts:92](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L92)

Shared annotation store. When provided, the body applies
`dt-row--annotated` / `dt-cell--annotated` classes at render time and
keeps the rendered rows in step with its `change` events (see
`annotationSync`).

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableBody.ts:48](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L48)

CSS class prefix (default: 'dt')

***

### fetchBlockSize?

> `optional` **fetchBlockSize?**: `number`

Defined in: [table/TableBody.ts:120](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L120)

Rows fetched per block. Default: 128. Clamped to [16, 1024].

Row fetches are quantized to block-aligned windows so overlapping scroll
positions dedupe onto the same query and an in-flight block is never
re-requested. 128 is roughly 3–4× a realistic viewport (~30–48 rows), so
the viewport spans 1–2 blocks; fetch cost on the OFFSET path is dominated
by the offset rather than the limit, and power-of-two alignment keeps
dedupe keys stable.

***

### gridElement?

> `optional` **gridElement?**: `HTMLElement`

Defined in: [table/TableBody.ts:69](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L69)

The owning `.dt-grid` element. Used as the rescue landing spot for real
DOM focus when a row that holds it is about to be detached: virtualization
recycles rows out from under the user, and focus on a detached node falls
back to `<body>`, which silently ends keyboard navigation. Omit it and that
rescue is simply skipped.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableBody.ts:54](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L54)

Per-instance identifier mixed into cell DOM ids so two tables on the same
page don't collide. Required for `aria-activedescendant` to resolve;
without it cells are rendered without ids.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableBody.ts:109](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L109)

Resolved i18n strings (used for the placeholder-row label). Defaults to English.

***

### onRowsRendered?

> `optional` **onRowsRendered?**: () => `void`

Defined in: [table/TableBody.ts:61](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L61)

Called after every pass that materializes or recycles row elements.
`TableContainer` uses it to re-point `aria-activedescendant`, whose target
must be a live element — virtualization can destroy the cursor's cell
without the cursor itself changing.

#### Returns

`void`

***

### prefetch?

> `optional` **prefetch?**: `boolean`

Defined in: [table/TableBody.ts:138](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L138)

Speculatively fetch one block beyond the viewport in the current scroll
direction while the pipeline is otherwise idle. Default: true.

Prefetches run at 'normal' worker priority, so visible-block fetches
(priority 'high') always jump ahead of them in the worker queue.

***

### rowCacheRows?

> `optional` **rowCacheRows?**: `number`

Defined in: [table/TableBody.ts:130](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L130)

Maximum rows kept in the in-memory row cache. Default: 2048. Rounded up
to whole blocks, with a floor of 4 blocks.

2048 rows is 16 default-size blocks (≈2–4 MB at typical row widths) —
enough for instant scroll-back across ±900 rows with zero queries, which
is the reuse role the SQL-keyed QueryCache used to (poorly) play for
scroll traffic.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableBody.ts:46](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L46)

Fixed height per row in pixels (default: 32)

***

### scrollContainer?

> `optional` **scrollContainer?**: `HTMLElement`

Defined in: [table/TableBody.ts:75](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableBody.ts#L75)

External scroll container for unified scrolling.
When provided, VirtualScroller will use this container for scroll events
instead of creating its own scroll container.
