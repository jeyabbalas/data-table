[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationPopover

# Class: AnnotationPopover

Defined in: [table/AnnotationPopover.ts:179](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L179)

Shared, body-portalled popover singleton that renders the intersection of
row, column, and cell annotations on hover / focus of an annotated grid
element. One instance per `DataTable` is enough — the facade owns
one and threads it to every renderer that emits annotation tints.

## Constructors

### Constructor

> **new AnnotationPopover**(`options?`): `AnnotationPopover`

Defined in: [table/AnnotationPopover.ts:203](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L203)

#### Parameters

##### options?

[`AnnotationPopoverOptions`](../interfaces/AnnotationPopoverOptions.md) = `{}`

#### Returns

`AnnotationPopover`

## Methods

### cancelGraceHide()

> **cancelGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:411](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L411)

Cancel a pending grace-period hide (user moved pointer back in time).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/AnnotationPopover.ts:419](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L419)

Tear down the popover and remove its element from the DOM.

#### Returns

`void`

***

### getId()

> **getId**(): `string`

Defined in: [table/AnnotationPopover.ts:252](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L252)

Element id for the popover. Anchors write this into `aria-describedby`.

#### Returns

`string`

***

### hide()

> **hide**(): `void`

Defined in: [table/AnnotationPopover.ts:376](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L376)

Dismiss the popover and detach all listeners. Idempotent.

#### Returns

`void`

***

### isOpen()

> **isOpen**(): `boolean`

Defined in: [table/AnnotationPopover.ts:264](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L264)

`true` if the popover is open against any anchor.

#### Returns

`boolean`

***

### isOpenFor()

> **isOpenFor**(`anchor`): `boolean`

Defined in: [table/AnnotationPopover.ts:257](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L257)

`true` if the popover is currently anchored to `anchor`.

#### Parameters

##### anchor

`HTMLElement`

#### Returns

`boolean`

***

### scheduleGraceHide()

> **scheduleGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:401](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L401)

Start a grace-period timer that hides the popover unless cancelled.

#### Returns

`void`

***

### show()

> **show**(`anchor`, `annotations`): `void`

Defined in: [table/AnnotationPopover.ts:285](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/AnnotationPopover.ts#L285)

Display the popover anchored to `anchor`, listing `annotations` by scope
(row, then column, then cell), each scope in the order given, five at
most each. Annotations the severity filter hides are left out; when it
hides every one, or `annotations` is empty, the popover hides instead.

#### Parameters

##### anchor

`HTMLElement`

##### annotations

readonly [`Annotation`](../../index/type-aliases/Annotation.md)[]

#### Returns

`void`
