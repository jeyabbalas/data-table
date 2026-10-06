[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:242](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L242)

TableBody renders data rows using virtual scrolling.

## Example

```typescript
const body = new TableBody(container, state, bridge, actions);
await body.initialize();

// Later, clean up
body.destroy();
```

## Constructors

### Constructor

> **new TableBody**(`container`, `state`, `bridge`, `actions?`, `options?`): `TableBody`

Defined in: [table/TableBody.ts:393](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L393)

#### Parameters

##### container

`HTMLElement`

##### state

[`TableState`](../interfaces/TableState.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### actions?

[`StateActions`](StateActions.md)

##### options?

[`TableBodyOptions`](../interfaces/TableBodyOptions.md) = `{}`

#### Returns

`TableBody`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/TableBody.ts:2744](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2744)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getInspectTarget()

> **getInspectTarget**(`row`, `column`): \{ `cell`: `HTMLElement`; `rowId`: `number` \| `bigint`; \} \| `null`

Defined in: [table/TableBody.ts:2670](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2670)

What the value inspector needs to open on the cell at `row` (0-based, in
the table as sorted and filtered) and `column`: the row's `__rowid__`,
which the inspector reads the value by, and the cell's element, which it
opens beside.

`null` when there is nothing to inspect there: a column that is not
nested or JSON, a NULL, a row not fetched or not rendered, a cell still
waiting for its value.

#### Parameters

##### row

`number`

##### column

`string`

#### Returns

\{ `cell`: `HTMLElement`; `rowId`: `number` \| `bigint`; \} \| `null`

#### Example

```typescript
const target = body.getInspectTarget(12, 'tags');
if (target) inspector.open({ rowId: target.rowId, anchor: target.cell, ... });
```

***

### getVirtualScroller()

> **getVirtualScroller**(): [`VirtualScroller`](VirtualScroller.md)

Defined in: [table/TableBody.ts:2628](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2628)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:2635](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2635)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:454](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L454)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### inspectState()

> **inspectState**(`row`, `column`): `"ready"` \| `"loading"` \| `"none"`

Defined in: [table/TableBody.ts:2702](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2702)

Whether the value inspector has a value to open at a body cell:
`'ready'` when [getInspectTarget](#getinspecttarget) finds one; `'loading'` while the
cell could still hold one, its row or its column's data not fetched yet,
or the row not rendered; `'none'` when there is nothing to inspect, as
for a column that is not nested or JSON, a NULL, or a row past the end.

#### Parameters

##### row

`number`

##### column

`string`

#### Returns

`"ready"` \| `"loading"` \| `"none"`

#### Example

```typescript
if (body.inspectState(12, 'tags') === 'loading') pending = { row: 12, column: 'tags' };
```

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableBody.ts:2715](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2715)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:2642](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2642)

Force a refresh of the table body

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:2650](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/table/TableBody.ts#L2650)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
