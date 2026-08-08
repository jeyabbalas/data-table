[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / AnnotationPopover

# Class: AnnotationPopover

Defined in: [table/AnnotationPopover.ts:113](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L113)

Shared, body-portalled popover singleton that renders the intersection of
row, column, and cell annotations on hover / focus of an annotated grid
element. One instance per `DataTable` is enough — the facade owns
one and threads it to every renderer that emits annotation tints.

## Constructors

### Constructor

> **new AnnotationPopover**(`options?`): `AnnotationPopover`

Defined in: [table/AnnotationPopover.ts:130](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L130)

#### Parameters

##### options?

[`AnnotationPopoverOptions`](../interfaces/AnnotationPopoverOptions.md) = `{}`

#### Returns

`AnnotationPopover`

## Methods

### cancelGraceHide()

> **cancelGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:256](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L256)

Cancel a pending grace-period hide (user moved pointer back in time).

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/AnnotationPopover.ts:264](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L264)

Tear down the popover and remove its element from the DOM.

#### Returns

`void`

***

### getId()

> **getId**(): `string`

Defined in: [table/AnnotationPopover.ts:161](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L161)

Element id for the popover. Anchors write this into `aria-describedby`.

#### Returns

`string`

***

### hide()

> **hide**(): `void`

Defined in: [table/AnnotationPopover.ts:223](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L223)

Dismiss the popover and detach all listeners. Idempotent.

#### Returns

`void`

***

### isOpen()

> **isOpen**(): `boolean`

Defined in: [table/AnnotationPopover.ts:173](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L173)

`true` if the popover is open against any anchor.

#### Returns

`boolean`

***

### isOpenFor()

> **isOpenFor**(`anchor`): `boolean`

Defined in: [table/AnnotationPopover.ts:166](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L166)

`true` if the popover is currently anchored to `anchor`.

#### Parameters

##### anchor

`HTMLElement`

#### Returns

`boolean`

***

### scheduleGraceHide()

> **scheduleGraceHide**(): `void`

Defined in: [table/AnnotationPopover.ts:246](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L246)

Start a grace-period timer that hides the popover unless cancelled.

#### Returns

`void`

***

### show()

> **show**(`anchor`, `annotations`): `void`

Defined in: [table/AnnotationPopover.ts:182](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/AnnotationPopover.ts#L182)

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
