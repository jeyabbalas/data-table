[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorder

# Class: ColumnReorder

Defined in: [table/ColumnReorder.ts:109](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L109)

ColumnReorder manages drag-and-drop column reordering for a header row.

## Example

```typescript
const reorder = new ColumnReorder(
  headerRowEl,
  (newOrder) => actions.setColumnOrder(newOrder),
  { classPrefix: 'dt' }
);

// After headers are added:
reorder.refresh();

// Later, clean up
reorder.destroy();
```

## Constructors

### Constructor

> **new ColumnReorder**(`headerRow`, `onReorder`, `options?`): `ColumnReorder`

Defined in: [table/ColumnReorder.ts:145](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L145)

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

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnReorder.ts:651](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L651)

Destroy the reorder handler and clean up resources

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [table/ColumnReorder.ts:617](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L617)

Disable column reordering

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [table/ColumnReorder.ts:609](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L609)

Enable column reordering

#### Returns

`void`

***

### isDraggingNow()

> **isDraggingNow**(): `boolean`

Defined in: [table/ColumnReorder.ts:637](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L637)

Check if currently dragging

#### Returns

`boolean`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [table/ColumnReorder.ts:644](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L644)

Check if reordering is enabled

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/ColumnReorder.ts:627](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/table/ColumnReorder.ts#L627)

Mark headers added since the last call as not natively draggable. The
press that starts a drag is heard on the header row, so a new header
needs nothing else.

#### Returns

`void`
