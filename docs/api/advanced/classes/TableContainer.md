[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainer

# Class: TableContainer

Defined in: [table/TableContainer.ts:160](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L160)

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

Defined in: [table/TableContainer.ts:231](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L231)

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

### announce()

> **announce**(`message`): `void`

Defined in: [table/TableContainer.ts:794](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L794)

Speak a transient message through the table's second polite live region.

For state changes a screen-reader user would otherwise have no way to
observe: a new column width, a column's new position, the entry and exit
of column layout mode. Distinct from the standing filter / sort / row-count
region, which is rebuilt wholesale from state on every flush and would
overwrite anything written into it.

Repeating the same text re-announces it — a second identical message
(two resize steps that both land on the maximum, say) is blanked for a
frame first, because assistive tech ignores a live region whose text has
not changed.

#### Parameters

##### message

`string`

#### Returns

`void`

#### Example

```typescript
container.announce('Price 220 pixels wide');
```

***

### destroy()

> **destroy**(): `void`

Defined in: [table/TableContainer.ts:2025](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L2025)

Destroy the table container and clean up resources

#### Returns

`void`

***

### getBodyContainer()

> **getBodyContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1931](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1931)

Get the body container element

#### Returns

`HTMLElement`

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:547](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L547)

Returns the currently-applied color scheme.

#### Returns

[`ColorScheme`](../../index/type-aliases/ColorScheme.md)

***

### getColumnHeaders()

> **getColumnHeaders**(): [`ColumnHeader`](ColumnHeader.md)[]

Defined in: [table/TableContainer.ts:2004](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L2004)

Get all column header instances.
Useful for accessing visualization containers in each header.

#### Returns

[`ColumnHeader`](ColumnHeader.md)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [table/TableContainer.ts:1957](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1957)

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

Defined in: [table/TableContainer.ts:1900](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1900)

Get the root element

#### Returns

`HTMLElement`

***

### getFilterBar()

> **getFilterBar**(): [`FilterBar`](FilterBar.md) \| `null`

Defined in: [table/TableContainer.ts:2011](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L2011)

Get the filter bar instance

#### Returns

[`FilterBar`](FilterBar.md) \| `null`

***

### getFilterPanel()

> **getFilterPanel**(): [`FilterPanel`](FilterPanel.md) \| `null`

Defined in: [table/TableContainer.ts:2018](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L2018)

Get the filter panel instance

#### Returns

[`FilterPanel`](FilterPanel.md) \| `null`

***

### getGridElement()

> **getGridElement**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1917](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1917)

Get the ARIA grid element — the keyboard cursor's tab stop.

This is what `container.querySelector('[role="grid"]')` resolves to and
what to call `.focus()` on to put the keyboard cursor into the table. It
only carries `role="grid"` / `tabindex="0"` once a schema and table name
exist; before that it is an inert shell.

#### Returns

`HTMLElement`

#### Example

```typescript
table.getContainer().getGridElement().focus();
```

***

### getHeaderRow()

> **getHeaderRow**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1924](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1924)

Get the header row element

#### Returns

`HTMLElement`

***

### getHeaderScroll()

> **getHeaderScroll**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1950](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1950)

Get the header scroll element

This is the container that handles horizontal scrolling for the header.
It should be synced with the body scroll.

#### Returns

`HTMLElement`

***

### getInstanceId()

> **getInstanceId**(): `string`

Defined in: [table/TableContainer.ts:1982](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1982)

The instance identifier actually mixed into this table's element IDs.

Not the `instanceId` a caller passed in: `resolveInstanceId` always
appends a random suffix, so two tables handed the same value still mint
disjoint cell ids. Anything that builds an ID referencing this table —
the export dialog's `aria-labelledby`, a consumer's own test selector —
has to read the resolved value from here rather than assume the input.

#### Returns

`string`

#### Example

```typescript
const cellId = `dt-${container.getInstanceId()}-cell-0-1`;
```

***

### getOptions()

> **getOptions**(): `Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

Defined in: [table/TableContainer.ts:1964](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1964)

Get the resolved options

#### Returns

`Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

***

### getPortalTarget()

> **getPortalTarget**(): `HTMLElement`

Defined in: [table/TableContainer.ts:1848](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1848)

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

Defined in: [table/TableContainer.ts:1940](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1940)

Get the scroll container element (body scroll)

This is the container that handles both horizontal and vertical scrolling for the body.

#### Returns

`HTMLElement`

***

### getTableBody()

> **getTableBody**(): [`TableBody`](TableBody.md) \| `null`

Defined in: [table/TableContainer.ts:1996](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1996)

Get the table body instance

#### Returns

[`TableBody`](TableBody.md) \| `null`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableContainer.ts:1989](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1989)

Check if the container has been destroyed

#### Returns

`boolean`

***

### onResize()

> **onResize**(`callback`): () => `void`

Defined in: [table/TableContainer.ts:664](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L664)

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

Defined in: [table/TableContainer.ts:1288](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1288)

Render the table container

Creates ColumnHeader components for each visible column and renders
placeholder content for the body (to be implemented in Task 3.4).

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [table/TableContainer.ts:540](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L540)

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

Defined in: [table/TableContainer.ts:1893](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/table/TableContainer.ts#L1893)

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
