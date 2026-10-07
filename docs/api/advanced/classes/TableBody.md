[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:243](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L243)

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

Defined in: [table/TableBody.ts:394](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L394)

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

Defined in: [table/TableBody.ts:2746](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2746)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getInspectTarget()

> **getInspectTarget**(`row`, `column`): \{ `cell`: `HTMLElement`; `rowId`: `number` \| `bigint`; \} \| `null`

Defined in: [table/TableBody.ts:2672](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2672)

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

Defined in: [table/TableBody.ts:2630](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2630)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:2637](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2637)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:455](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L455)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### inspectState()

> **inspectState**(`row`, `column`): `"ready"` \| `"loading"` \| `"none"`

Defined in: [table/TableBody.ts:2704](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2704)

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

Defined in: [table/TableBody.ts:2717](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2717)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:2644](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2644)

Force a refresh of the table body

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:2652](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/table/TableBody.ts#L2652)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
