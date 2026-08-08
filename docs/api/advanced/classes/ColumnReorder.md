[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnReorder

# Class: ColumnReorder

Defined in: [table/ColumnReorder.ts:89](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L89)

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

Defined in: [table/ColumnReorder.ts:116](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L116)

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

Defined in: [table/ColumnReorder.ts:491](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L491)

Destroy the reorder handler and clean up resources

#### Returns

`void`

***

### disable()

> **disable**(): `void`

Defined in: [table/ColumnReorder.ts:453](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L453)

Disable column reordering

#### Returns

`void`

***

### enable()

> **enable**(): `void`

Defined in: [table/ColumnReorder.ts:444](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L444)

Enable column reordering

#### Returns

`void`

***

### isDraggingNow()

> **isDraggingNow**(): `boolean`

Defined in: [table/ColumnReorder.ts:477](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L477)

Check if currently dragging

#### Returns

`boolean`

***

### isEnabled()

> **isEnabled**(): `boolean`

Defined in: [table/ColumnReorder.ts:484](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L484)

Check if reordering is enabled

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/ColumnReorder.ts:462](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/table/ColumnReorder.ts#L462)

Refresh handlers after headers are recreated

#### Returns

`void`
