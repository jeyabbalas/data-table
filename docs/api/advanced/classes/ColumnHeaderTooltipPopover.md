[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderTooltipPopover

# Class: ColumnHeaderTooltipPopover

Defined in: [table/ColumnHeaderTooltipPopover.ts:133](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L133)

Shared, body-portalled popover singleton that renders the structured
column-header tooltip set via `actions.setColumnHeaderTooltip`. Anchored
on hover / focus of the column-name span. Pairs with
[AnnotationPopover](AnnotationPopover.md) but lives at a higher z-index so they don't
collide.

## Constructors

### Constructor

> **new ColumnHeaderTooltipPopover**(`options?`): `ColumnHeaderTooltipPopover`

Defined in: [table/ColumnHeaderTooltipPopover.ts:150](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L150)

#### Parameters

##### options?

[`ColumnHeaderTooltipPopoverOptions`](../interfaces/ColumnHeaderTooltipPopoverOptions.md) = `{}`

#### Returns

`ColumnHeaderTooltipPopover`

## Methods

### cancelGraceHide()

> **cancelGraceHide**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:291](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L291)

Cancel a pending grace-period hide (user moved pointer back in time).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:299](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L299)

Tear down the popover and remove its element from the DOM.

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeaderTooltipPopover.ts:183](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L183)

The popover's DOM element, or null until first [show](#show).

#### Returns

`HTMLElement` \| `null`

***

### getId()

> **getId**(): `string`

Defined in: [table/ColumnHeaderTooltipPopover.ts:178](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L178)

Element id for the popover. Anchors write this into `aria-describedby`.

#### Returns

`string`

***

### hide()

> **hide**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:258](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L258)

Dismiss the popover and detach all listeners. Idempotent.

#### Returns

`void`

***

### isOpen()

> **isOpen**(): `boolean`

Defined in: [table/ColumnHeaderTooltipPopover.ts:195](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L195)

`true` if the popover is open against any anchor.

#### Returns

`boolean`

***

### isOpenFor()

> **isOpenFor**(`anchor`): `boolean`

Defined in: [table/ColumnHeaderTooltipPopover.ts:188](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L188)

`true` if the popover is currently anchored to `anchor`.

#### Parameters

##### anchor

`HTMLElement`

#### Returns

`boolean`

***

### refresh()

> **refresh**(`anchor`, `content`): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:244](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L244)

Re-render the popover in place when content changes for the currently
shown anchor. No-op when not currently shown for `anchor` (so callers
can safely invoke this on every signal change without forcing the
popover open).

#### Parameters

##### anchor

`HTMLElement`

##### content

[`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)

#### Returns

`void`

***

### scheduleGraceHide()

> **scheduleGraceHide**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:281](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L281)

Start a grace-period timer that hides the popover unless cancelled.

#### Returns

`void`

***

### show()

> **show**(`anchor`, `content`): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:203](https://github.com/jeyabbalas/data-table/blob/ce18c7a4c9bdee8a7130f27bf4913927802d2bfd/src/table/ColumnHeaderTooltipPopover.ts#L203)

Display the popover anchored to `anchor` with the given content.
Empty content (no title, description, or items) hides the popover.

#### Parameters

##### anchor

`HTMLElement`

##### content

[`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)

#### Returns

`void`
