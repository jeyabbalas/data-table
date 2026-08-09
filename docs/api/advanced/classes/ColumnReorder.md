[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorder

# Class: ColumnReorder

Defined in: [table/ColumnReorder.ts:95](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L95)

ColumnReorder manages drag-and-drop column reordering for a header row.

## Example

```typescript
const reorder = new ColumnReorder(
  headerRowEl,
  (newOrder) => actions.setColumnOrder(newOrder),
  { classPrefix: 'dt' }
);

// After headers are created/refreshed:
reorder.refresh();

// Later, clean up
reorder.destroy();
```

## Constructors

### Constructor

> **new ColumnReorder**(`headerRow`, `onReorder`, `options?`): `ColumnReorder`

Defined in: [table/ColumnReorder.ts:122](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L122)

#### Parameters

##### headerRow

`HTMLElement`

##### onReorder

[`ReorderCallback`](../type-aliases/ReorderCallback.md)

##### options?

[`ColumnReorderOptions`](../interfaces/ColumnReorderOptions.md) = `{}`

#### Returns

`ColumnReorder`

## Methods

### attachHandler()

> **attachHandler**(`header`): `void`

Defined in: [table/ColumnReorder.ts:453](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L453)

Bind one header element, if it is not bound already.

The per-element half of [refresh](#refresh), for a windowed header row where
headers mount and unmount at scroll rate: `refresh()` there would detach
and re-bind the entire mounted set on every frame, and the map it keeps is
the only handle on those anonymous listeners.

A no-op while reordering is disabled, matching `attachHandlers`.

#### Parameters

##### header

`HTMLElement`

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnReorder.ts:532](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L532)

Destroy the reorder handler and clean up resources

#### Returns

`void`

***

### detachHandler()

> **detachHandler**(`header`): `void`

Defined in: [table/ColumnReorder.ts:471](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L471)

Unbind one header element.

Called as a header unmounts. Without it the handler — and through its
closure this whole controller — stays reachable from an element the header
row has already dropped, so a mount/unmount storm leaks one entry per
header scrolled past. The `Map` is keyed by element, so an entry for a
detached node is never collected on its own.

#### Parameters

##### header

`HTMLElement`

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [table/ColumnReorder.ts:494](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L494)

Disable column reordering

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [table/ColumnReorder.ts:485](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L485)

Enable column reordering

#### Returns

`void`

***

### isDraggingNow()

> **isDraggingNow**(): `boolean`

Defined in: [table/ColumnReorder.ts:518](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L518)

Check if currently dragging

#### Returns

`boolean`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [table/ColumnReorder.ts:525](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L525)

Check if reordering is enabled

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/ColumnReorder.ts:503](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnReorder.ts#L503)

Refresh handlers after headers are recreated

#### Returns

`void`
