[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBodyOptions

# Interface: TableBodyOptions

Defined in: [table/TableBody.ts:25](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L25)

Options for configuring the TableBody

## Properties

### annotationPopover?

> `optional` **annotationPopover?**: [`AnnotationPopover`](../classes/AnnotationPopover.md)

Defined in: [table/TableBody.ts:67](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L67)

Shared popover singleton used to display cell-scope annotations on
hover / focus of an annotated cell.

***

### annotations?

> `optional` **annotations?**: [`AnnotationStore`](../classes/AnnotationStore.md)

Defined in: [table/TableBody.ts:62](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L62)

Shared annotation store. When provided, the body applies
`dt-row--annotated` / `dt-cell--annotated` classes at render time and
subscribes to `change` events to keep visible rows in sync.

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/TableBody.ts:29](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L29)

CSS class prefix (default: 'dt')

***

### fetchBlockSize?

> `optional` **fetchBlockSize?**: `number`

Defined in: [table/TableBody.ts:80](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L80)

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

Defined in: [table/TableBody.ts:50](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L50)

The owning `.dt-grid` element. Used as the rescue landing spot for real
DOM focus when a row that holds it is about to be detached: virtualization
recycles rows out from under the user, and focus on a detached node falls
back to `<body>`, which silently ends keyboard navigation. Omit it and that
rescue is simply skipped.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [table/TableBody.ts:35](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L35)

Per-instance identifier mixed into cell DOM ids so two tables on the same
page don't collide. Required for `aria-activedescendant` to resolve;
without it cells are rendered without ids.

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/TableBody.ts:69](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L69)

Resolved i18n strings (used for the placeholder-row label). Defaults to English.

***

### onRowsRendered?

> `optional` **onRowsRendered?**: () => `void`

Defined in: [table/TableBody.ts:42](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L42)

Called after every pass that materializes or recycles row elements.
`TableContainer` uses it to re-point `aria-activedescendant`, whose target
must be a live element — virtualization can destroy the cursor's cell
without the cursor itself changing.

#### Returns

`void`

***

### prefetch?

> `optional` **prefetch?**: `boolean`

Defined in: [table/TableBody.ts:98](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L98)

Speculatively fetch one block beyond the viewport in the current scroll
direction while the pipeline is otherwise idle. Default: true.

Prefetches run at 'normal' worker priority, so visible-block fetches
(priority 'high') always jump ahead of them in the worker queue.

***

### rowCacheRows?

> `optional` **rowCacheRows?**: `number`

Defined in: [table/TableBody.ts:90](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L90)

Maximum rows kept in the in-memory row cache. Default: 2048. Rounded up
to whole blocks, with a floor of 4 blocks.

2048 rows is 16 default-size blocks (≈2–4 MB at typical row widths) —
enough for instant scroll-back across ±900 rows with zero queries, which
is the reuse role the SQL-keyed QueryCache used to (poorly) play for
scroll traffic.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [table/TableBody.ts:27](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L27)

Fixed height per row in pixels (default: 32)

***

### scrollContainer?

> `optional` **scrollContainer?**: `HTMLElement`

Defined in: [table/TableBody.ts:56](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/table/TableBody.ts#L56)

External scroll container for unified scrolling.
When provided, VirtualScroller will use this container for scroll events
instead of creating its own scroll container.
