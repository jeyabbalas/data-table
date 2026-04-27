[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:67](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L67)

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

Defined in: [table/TableBody.ts:102](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L102)

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

Defined in: [table/TableBody.ts:1460](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1460)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getVirtualScroller()

> **getVirtualScroller**(): [`VirtualScroller`](VirtualScroller.md)

Defined in: [table/TableBody.ts:1424](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1424)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:1431](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1431)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:145](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L145)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableBody.ts:1453](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1453)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:1438](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1438)

Force a refresh of the table body

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:1446](https://github.com/jeyabbalas/data-table/blob/f22a19ec87341b8bb1fcc88431dd0ee7f9f703fb/src/table/TableBody.ts#L1446)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
