[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationPopover

# Class: AnnotationPopover

Defined in: [table/AnnotationPopover.ts:123](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L123)

## Constructors

### Constructor

> **new AnnotationPopover**(`options?`): `AnnotationPopover`

Defined in: [table/AnnotationPopover.ts:140](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L140)

#### Parameters

##### options?

[`AnnotationPopoverOptions`](../interfaces/AnnotationPopoverOptions.md) = `{}`

#### Returns

`AnnotationPopover`

## Methods

### cancelGraceHide()

> **cancelGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:254](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L254)

Cancel a pending grace-period hide (user moved pointer back in time).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/AnnotationPopover.ts:262](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L262)

Tear down the popover and remove its element from the DOM.

#### Returns

`void`

***

### getId()

> **getId**(): `string`

Defined in: [table/AnnotationPopover.ts:170](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L170)

Element id for the popover. Anchors write this into `aria-describedby`.

#### Returns

`string`

***

### hide()

> **hide**(): `void`

Defined in: [table/AnnotationPopover.ts:221](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L221)

Dismiss the popover and detach all listeners. Idempotent.

#### Returns

`void`

***

### isOpen()

> **isOpen**(): `boolean`

Defined in: [table/AnnotationPopover.ts:180](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L180)

`true` if the popover is open against any anchor.

#### Returns

`boolean`

***

### isOpenFor()

> **isOpenFor**(`anchor`): `boolean`

Defined in: [table/AnnotationPopover.ts:175](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L175)

`true` if the popover is currently anchored to `anchor`.

#### Parameters

##### anchor

`HTMLElement`

#### Returns

`boolean`

***

### scheduleGraceHide()

> **scheduleGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:244](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L244)

Start a grace-period timer that hides the popover unless cancelled.

#### Returns

`void`

***

### show()

> **show**(`anchor`, `annotations`): `void`

Defined in: [table/AnnotationPopover.ts:189](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/AnnotationPopover.ts#L189)

Display the popover anchored to `anchor` with the given annotations.
Re-rendering happens inline on every call so consumers don't need to
diff annotation changes themselves.

#### Parameters

##### anchor

`HTMLElement`

##### annotations

[`Annotation`](../../index/type-aliases/Annotation.md)[]

#### Returns

`void`
