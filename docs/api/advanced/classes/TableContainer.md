[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainer

# Class: TableContainer

Defined in: [table/TableContainer.ts:143](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L143)

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

Defined in: [table/TableContainer.ts:202](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L202)

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

Defined in: [table/TableContainer.ts:1530](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1530)

Destroy the table container and clean up resources

#### Returns

`void`

***

### getBodyContainer()

> **getBodyContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1454](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1454)

Get the body container element

#### Returns

`HTMLElement`

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:431](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L431)

Returns the currently-applied color scheme.

#### Returns

[`ColorScheme`](../../index/type-aliases/ColorScheme.md)

***

### getColumnHeaders()

> **getColumnHeaders**(): [`ColumnHeader`](ColumnHeader.md)[]

Defined in: [table/TableContainer.ts:1509](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1509)

Get all column header instances.
Useful for accessing visualization containers in each header.

#### Returns

[`ColumnHeader`](ColumnHeader.md)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [table/TableContainer.ts:1480](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1480)

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

Defined in: [table/TableContainer.ts:1440](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1440)

Get the root element

#### Returns

`HTMLElement`

***

### getFilterBar()

> **getFilterBar**(): [`FilterBar`](FilterBar.md) \| `null`

Defined in: [table/TableContainer.ts:1516](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1516)

Get the filter bar instance

#### Returns

[`FilterBar`](FilterBar.md) \| `null`

***

### getFilterPanel()

> **getFilterPanel**(): [`FilterPanel`](FilterPanel.md) \| `null`

Defined in: [table/TableContainer.ts:1523](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1523)

Get the filter panel instance

#### Returns

[`FilterPanel`](FilterPanel.md) \| `null`

***

### getHeaderRow()

> **getHeaderRow**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1447](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1447)

Get the header row element

#### Returns

`HTMLElement`

***

### getHeaderScroll()

> **getHeaderScroll**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1473](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1473)

Get the header scroll element

This is the container that handles horizontal scrolling for the header.
It should be synced with the body scroll.

#### Returns

`HTMLElement`

***

### getOptions()

> **getOptions**(): `Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

Defined in: [table/TableContainer.ts:1487](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1487)

Get the resolved options

#### Returns

`Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

***

### getPortalTarget()

> **getPortalTarget**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1388](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1388)

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

Defined in: [table/TableContainer.ts:1463](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1463)

Get the scroll container element (body scroll)

This is the container that handles both horizontal and vertical scrolling for the body.

#### Returns

`HTMLElement`

***

### getTableBody()

> **getTableBody**(): [`TableBody`](TableBody.md) \| `null`

Defined in: [table/TableContainer.ts:1501](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1501)

Get the table body instance

#### Returns

[`TableBody`](TableBody.md) \| `null`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableContainer.ts:1494](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1494)

Check if the container has been destroyed

#### Returns

`boolean`

***

### onResize()

> **onResize**(`callback`): () => `void`

Defined in: [table/TableContainer.ts:539](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L539)

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

Defined in: [table/TableContainer.ts:928](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L928)

Render the table container

Creates ColumnHeader components for each visible column and renders
placeholder content for the body (to be implemented in Task 3.4).

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [table/TableContainer.ts:424](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L424)

Switch the light/dark theme for this container at runtime. Updates the
`data-dt-color-scheme` attribute on the root element; open body-portalled
modals observe the attribute via MutationObserver (installed by ModalHost
when they were opened) and re-sync automatically.

#### Parameters

##### scheme

[`ColorScheme`](../../index/type-aliases/ColorScheme.md)

#### Returns

`void`

***

### whenBodyReady()

> **whenBodyReady**(): `Promise`\<`void`\>

Defined in: [table/TableContainer.ts:1433](https://github.com/jeyabbalas/data-table/blob/a7d429b4ecaa77d708c5fb2347c14e413094a698/src/table/TableContainer.ts#L1433)

Resolves once the surviving `TableBody`'s first paint has settled.

Used by `loadDataImpl` so `await createDataTable({ source })` and
`await table.loadData(source)` only resolve after the first row
fetch lands — closing the contract gap where consumers could call
`addFilter` synchronously and race the unfiltered initial SELECT.

Resolves (never rejects) on every path: success, body-init error
(swallowed at the assignment site), `destroy()` mid-init, and the
no-fetch paths (zero rows, empty `visibleColumns`).

#### Returns

`Promise`\<`void`\>
