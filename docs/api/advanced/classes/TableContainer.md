[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainer

# Class: TableContainer

Defined in: [table/TableContainer.ts:142](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L142)

TableContainer manages the DOM structure and lifecycle for the data table.

## Example

```typescript
const container = document.getElementById('my-table');
const state = createTableState();
const table = new TableContainer(container, state);

// Later, clean up
table.destroy();
```

## Constructors

### Constructor

> **new TableContainer**(`container`, `state`, `actions?`, `bridge?`, `options?`): `TableContainer`

Defined in: [table/TableContainer.ts:195](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L195)

#### Parameters

##### container

`HTMLElement`

##### state

[`TableState`](../interfaces/TableState.md)

##### actions?

[`StateActions`](StateActions.md)

##### bridge?

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### options?

[`TableContainerOptions`](../interfaces/TableContainerOptions.md) = `{}`

#### Returns

`TableContainer`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/TableContainer.ts:1470](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1470)

Destroy the table container and clean up resources

#### Returns

`void`

***

### getBodyContainer()

> **getBodyContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1394](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1394)

Get the body container element

#### Returns

`HTMLElement`

***

### getColorScheme()

> **getColorScheme**(): `ContainerColorScheme`

Defined in: [table/TableContainer.ts:416](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L416)

Returns the currently-applied color scheme.

#### Returns

`ContainerColorScheme`

***

### getColumnHeaders()

> **getColumnHeaders**(): [`ColumnHeader`](ColumnHeader.md)[]

Defined in: [table/TableContainer.ts:1449](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1449)

Get all column header instances.
Useful for accessing visualization containers in each header.

#### Returns

[`ColumnHeader`](ColumnHeader.md)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [table/TableContainer.ts:1420](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1420)

Get current container dimensions

#### Returns

`object`

##### height

> **height**: `number`

##### width

> **width**: `number`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1380](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1380)

Get the root element

#### Returns

`HTMLElement`

***

### getFilterBar()

> **getFilterBar**(): [`FilterBar`](FilterBar.md) \| `null`

Defined in: [table/TableContainer.ts:1456](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1456)

Get the filter bar instance

#### Returns

[`FilterBar`](FilterBar.md) \| `null`

***

### getFilterPanel()

> **getFilterPanel**(): [`FilterPanel`](FilterPanel.md) \| `null`

Defined in: [table/TableContainer.ts:1463](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1463)

Get the filter panel instance

#### Returns

[`FilterPanel`](FilterPanel.md) \| `null`

***

### getHeaderRow()

> **getHeaderRow**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1387](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1387)

Get the header row element

#### Returns

`HTMLElement`

***

### getHeaderScroll()

> **getHeaderScroll**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1413](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1413)

Get the header scroll element

This is the container that handles horizontal scrolling for the header.
It should be synced with the body scroll.

#### Returns

`HTMLElement`

***

### getOptions()

> **getOptions**(): `Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

Defined in: [table/TableContainer.ts:1427](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1427)

Get the resolved options

#### Returns

`Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

***

### getPortalTarget()

> **getPortalTarget**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1344](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1344)

Where fixed-position modals owned by this table mount. Returns the
`portalTarget` option if supplied, otherwise `document.body`. Exposed
as the single source of truth so higher-level wiring (e.g.
`createDataTable()`'s export dialog) can honour the same choice
without re-implementing the fallback.

#### Returns

`HTMLElement`

***

### getScrollContainer()

> **getScrollContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1403](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1403)

Get the scroll container element (body scroll)

This is the container that handles both horizontal and vertical scrolling for the body.

#### Returns

`HTMLElement`

***

### getTableBody()

> **getTableBody**(): [`TableBody`](TableBody.md) \| `null`

Defined in: [table/TableContainer.ts:1441](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1441)

Get the table body instance

#### Returns

[`TableBody`](TableBody.md) \| `null`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableContainer.ts:1434](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L1434)

Check if the container has been destroyed

#### Returns

`boolean`

***

### onResize()

> **onResize**(`callback`): () => `void`

Defined in: [table/TableContainer.ts:524](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L524)

Subscribe to resize events

#### Parameters

##### callback

[`ResizeCallback`](../type-aliases/ResizeCallback.md)

Function to call when container resizes

#### Returns

Unsubscribe function

() => `void`

***

### render()

> **render**(): `void`

Defined in: [table/TableContainer.ts:914](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L914)

Render the table container

Creates ColumnHeader components for each visible column and renders
placeholder content for the body (to be implemented in Task 3.4).

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [table/TableContainer.ts:409](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/TableContainer.ts#L409)

Switch the light/dark theme for this container at runtime. Updates the
`data-dt-color-scheme` attribute on the root element; open body-portalled
modals observe the attribute via MutationObserver (installed by ModalHost
when they were opened) and re-sync automatically.

#### Parameters

##### scheme

`ContainerColorScheme`

#### Returns

`void`
