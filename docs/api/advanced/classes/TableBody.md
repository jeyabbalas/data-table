[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:64](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L64)

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

Defined in: [table/TableBody.ts:98](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L98)

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

Defined in: [table/TableBody.ts:1440](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1440)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getVirtualScroller()

> **getVirtualScroller**(): [`VirtualScroller`](VirtualScroller.md)

Defined in: [table/TableBody.ts:1404](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1404)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:1411](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1411)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:140](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L140)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableBody.ts:1433](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1433)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:1418](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1418)

Force a refresh of the table body

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:1426](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableBody.ts#L1426)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
