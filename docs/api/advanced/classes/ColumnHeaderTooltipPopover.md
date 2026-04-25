[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeaderTooltipPopover

# Class: ColumnHeaderTooltipPopover

Defined in: [table/ColumnHeaderTooltipPopover.ts:132](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L132)

## Constructors

### Constructor

> **new ColumnHeaderTooltipPopover**(`options?`): `ColumnHeaderTooltipPopover`

Defined in: [table/ColumnHeaderTooltipPopover.ts:149](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L149)

#### Parameters

##### options?

[`ColumnHeaderTooltipPopoverOptions`](../interfaces/ColumnHeaderTooltipPopoverOptions.md) = `{}`

#### Returns

`ColumnHeaderTooltipPopover`

## Methods

### cancelGraceHide()

> **cancelGraceHide**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:285](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L285)

Cancel a pending grace-period hide (user moved pointer back in time).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:293](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L293)

Tear down the popover and remove its element from the DOM.

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeaderTooltipPopover.ts:184](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L184)

The popover's DOM element, or null until first [show](#show).

#### Returns

`HTMLElement` \| `null`

***

### getId()

> **getId**(): `string`

Defined in: [table/ColumnHeaderTooltipPopover.ts:179](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L179)

Element id for the popover. Anchors write this into `aria-describedby`.

#### Returns

`string`

***

### hide()

> **hide**(): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:252](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L252)

Dismiss the popover and detach all listeners. Idempotent.

#### Returns

`void`

***

### isOpen()

> **isOpen**(): `boolean`

Defined in: [table/ColumnHeaderTooltipPopover.ts:198](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L198)

`true` if the popover is open against any anchor.

#### Returns

`boolean`

***

### isOpenFor()

> **isOpenFor**(`anchor`): `boolean`

Defined in: [table/ColumnHeaderTooltipPopover.ts:189](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L189)

`true` if the popover is currently anchored to `anchor`.

#### Parameters

##### anchor

`HTMLElement`

#### Returns

`boolean`

***

### refresh()

> **refresh**(`anchor`, `content`): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:238](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L238)

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

Defined in: [table/ColumnHeaderTooltipPopover.ts:275](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L275)

Start a grace-period timer that hides the popover unless cancelled.

#### Returns

`void`

***

### show()

> **show**(`anchor`, `content`): `void`

Defined in: [table/ColumnHeaderTooltipPopover.ts:206](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeaderTooltipPopover.ts#L206)

Display the popover anchored to `anchor` with the given content.
Empty content (no title, description, or items) hides the popover.

#### Parameters

##### anchor

`HTMLElement`

##### content

[`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md)

#### Returns

`void`
