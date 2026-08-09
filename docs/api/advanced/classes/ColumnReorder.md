[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorder

# Class: ColumnReorder

Defined in: [table/ColumnReorder.ts:95](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L95)

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

Defined in: [table/ColumnReorder.ts:122](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L122)

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

Defined in: [table/ColumnReorder.ts:497](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L497)

Destroy the reorder handler and clean up resources

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [table/ColumnReorder.ts:459](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L459)

Disable column reordering

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [table/ColumnReorder.ts:450](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L450)

Enable column reordering

#### Returns

`void`

***

### isDraggingNow()

> **isDraggingNow**(): `boolean`

Defined in: [table/ColumnReorder.ts:483](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L483)

Check if currently dragging

#### Returns

`boolean`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [table/ColumnReorder.ts:490](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L490)

Check if reordering is enabled

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/ColumnReorder.ts:468](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/table/ColumnReorder.ts#L468)

Refresh handlers after headers are recreated

#### Returns

`void`
