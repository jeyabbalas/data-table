[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableBody

# Class: TableBody

Defined in: [table/TableBody.ts:105](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L105)

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

Defined in: [table/TableBody.ts:155](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L155)

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

Defined in: [table/TableBody.ts:1729](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1729)

Destroy the table body and clean up resources

#### Returns

`void`

***

### getVirtualScroller()

> **getVirtualScroller**(): [`VirtualScroller`](VirtualScroller.md)

Defined in: [table/TableBody.ts:1693](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1693)

Get the virtual scroller instance

#### Returns

[`VirtualScroller`](VirtualScroller.md)

***

### getVisibleRange()

> **getVisibleRange**(): [`VisibleRange`](../interfaces/VisibleRange.md)

Defined in: [table/TableBody.ts:1700](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1700)

Get current visible range

#### Returns

[`VisibleRange`](../interfaces/VisibleRange.md)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [table/TableBody.ts:201](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L201)

Initialize the table body

Sets up virtual scroller, subscribes to state changes, and performs
initial render.

#### Returns

`Promise`\<`void`\>

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableBody.ts:1722](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1722)

Check if the table body has been destroyed

#### Returns

`boolean`

***

### refresh()

> **refresh**(): `void`

Defined in: [table/TableBody.ts:1707](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1707)

Force a refresh of the table body

#### Returns

`void`

***

### scrollToRow()

> **scrollToRow**(`index`, `align?`): `void`

Defined in: [table/TableBody.ts:1715](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/table/TableBody.ts#L1715)

Scroll to a specific row

#### Parameters

##### index

`number`

##### align?

`"start"` \| `"center"` \| `"end"`

#### Returns

`void`
