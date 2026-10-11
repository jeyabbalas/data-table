[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationPopoverOptions

# Interface: AnnotationPopoverOptions

Defined in: [table/AnnotationPopover.ts:68](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L68)

Options accepted by [AnnotationPopover](../classes/AnnotationPopover.md).

## Properties

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [table/AnnotationPopover.ts:70](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L70)

CSS class prefix (default: `'dt'`).

***

### messages?

> `optional` **messages?**: [`Strings`](../../index/interfaces/Strings.md)

Defined in: [table/AnnotationPopover.ts:78](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L78)

Resolved i18n strings: the section titles, the severity names on the
pills, and the "+N more" and "N hidden by the severity filter" lines
(`messages.annotations`). Defaults to English.

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [table/AnnotationPopover.ts:72](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L72)

Where to mount the popover element. Defaults to `document.body`.

***

### severityFilter?

> `optional` **severityFilter?**: () => [`SeverityFilter`](../../index/interfaces/SeverityFilter.md)

Defined in: [table/AnnotationPopover.ts:85](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L85)

Reads the severity filter in force. The popover leaves out the
annotations whose severity it hides, and says how many it left out.
`createDataTable` passes its store's `getSeverityFilter`. Without it,
every annotation is listed.

#### Returns

[`SeverityFilter`](../../index/interfaces/SeverityFilter.md)
