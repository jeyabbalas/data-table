[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorder

# Class: ColumnReorder

Defined in: [table/ColumnReorder.ts:113](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L113)

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

Defined in: [table/ColumnReorder.ts:141](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L141)

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

Defined in: [table/ColumnReorder.ts:538](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L538)

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

Defined in: [table/ColumnReorder.ts:617](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L617)

Destroy the reorder handler and clean up resources

#### Returns

`void`

***

### detachHandler()

> **detachHandler**(`header`): `void`

Defined in: [table/ColumnReorder.ts:556](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L556)

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

Defined in: [table/ColumnReorder.ts:579](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L579)

Disable column reordering

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [table/ColumnReorder.ts:570](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L570)

Enable column reordering

#### Returns

`void`

***

### isDraggingNow()

> **isDraggingNow**(): `boolean`

Defined in: [table/ColumnReorder.ts:603](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L603)

Check if currently dragging

#### Returns

`boolean`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [table/ColumnReorder.ts:610](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L610)

Check if reordering is enabled

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/ColumnReorder.ts:588](https://github.com/jeyabbalas/data-table/blob/e8e34e47ecc8404384b71d0c64a3b46ed801ffc1/src/table/ColumnReorder.ts#L588)

Refresh handlers after headers are recreated

#### Returns

`void`
