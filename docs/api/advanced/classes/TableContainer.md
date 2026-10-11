[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainer

# Class: TableContainer

Defined in: [table/TableContainer.ts:342](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L342)

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

Defined in: [table/TableContainer.ts:499](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L499)

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

Defined in: [table/TableContainer.ts:1427](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L1427)

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

Defined in: [table/TableContainer.ts:3375](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3375)

Destroy the table container and clean up resources

#### Returns

`void`

***

### extractColumn()

> **extractColumn**(`request`): `Promise`\<\{ `error?`: `string`; `name?`: `string`; `success`: `boolean`; \}\>

Defined in: [table/TableContainer.ts:2923](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L2923)

Add a column that reads one part of a nested or JSON column, as
`actions.addNestedFieldColumn(column, path, options)` does, and show it:
the cursor goes to the new column, in `row` when given (where the value
inspector asked from) or else on its header (where the header's extract
panel asked from), the view scrolls to it, its header flashes as any
newly shown column's does, and the live region says it was added. Focus
still in the table goes to the grid, which carries the cursor.

What the extract panel and the value inspector's "add as column" call.
The work is here, not in them: the new column re-renders the table,
which tears both panels down. A failure leaves them up, and they show
its reason; with neither open any more, the live region says it. The
same request (column, path, options and name) while one is still
running gets that one's promise, and adds no second column. When the
panel that asked was closed before the add landed, the live region
still says the column was added, but the cursor, the view and focus
stay where they are.

#### Parameters

##### request

[`NestedFieldColumnOptions`](../../index/interfaces/NestedFieldColumnOptions.md) & `object`

The column, the path into it and the options
  `addNestedFieldColumn` takes, and the body row (0-based, as sorted and
  filtered) for the cursor.

#### Returns

`Promise`\<\{ `error?`: `string`; `name?`: `string`; `success`: `boolean`; \}\>

what `addNestedFieldColumn` resolves to: the new column's name,
  or why there is none.

#### Example

```typescript
await container.extractColumn({ column: 'point', path: ['x'] }); // cursor on point_x's header
await container.extractColumn({ column: 'tags', path: [], extract: 'length', row: 12 });
```

***

### getBodyContainer()

> **getBodyContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:3254](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3254)

Get the body container element

#### Returns

`HTMLElement`

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:1211](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L1211)

Returns the currently-applied color scheme.

#### Returns

[`ColorScheme`](../../index/type-aliases/ColorScheme.md)

***

### getColumnHeaders()

> **getColumnHeaders**(): [`ColumnHeader`](ColumnHeader.md)[]

Defined in: [table/TableContainer.ts:3354](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3354)

Get all column header instances, one per visible column, in order.
Useful for accessing visualization containers in each header.

Every header has its stats and chart slots, but only the columns near the
view have their pin, hide, filter and sort buttons and their drag and
resize handles. The others are shells, whose `getControls()` holds at
most a derived column's f(x) icon and a column name with a tooltip.

#### Returns

[`ColumnHeader`](ColumnHeader.md)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [table/TableContainer.ts:3280](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3280)

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

Defined in: [table/TableContainer.ts:3223](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3223)

Get the root element

#### Returns

`HTMLElement`

***

### getFilterBar()

> **getFilterBar**(): [`FilterBar`](FilterBar.md) \| `null`

Defined in: [table/TableContainer.ts:3361](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3361)

Get the filter bar instance

#### Returns

[`FilterBar`](FilterBar.md) \| `null`

***

### getFilterPanel()

> **getFilterPanel**(): [`FilterPanel`](FilterPanel.md) \| `null`

Defined in: [table/TableContainer.ts:3368](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3368)

Get the filter panel instance

#### Returns

[`FilterPanel`](FilterPanel.md) \| `null`

***

### getGridElement()

> **getGridElement**(): `HTMLElement`

Defined in: [table/TableContainer.ts:3240](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3240)

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

Defined in: [table/TableContainer.ts:3247](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3247)

Get the header row element

#### Returns

`HTMLElement`

***

### getHeaderScroll()

> **getHeaderScroll**(): `HTMLElement`

Defined in: [table/TableContainer.ts:3273](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3273)

Get the header scroll element

This is the container that handles horizontal scrolling for the header.
It should be synced with the body scroll.

#### Returns

`HTMLElement`

***

### getInstanceId()

> **getInstanceId**(): `string`

Defined in: [table/TableContainer.ts:3305](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3305)

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

Defined in: [table/TableContainer.ts:3287](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3287)

Get the resolved options

#### Returns

`Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

***

### getPortalTarget()

> **getPortalTarget**(): `HTMLElement`

Defined in: [table/TableContainer.ts:3188](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3188)

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

Defined in: [table/TableContainer.ts:3263](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3263)

Get the scroll container element (body scroll)

This is the container that handles both horizontal and vertical scrolling for the body.

#### Returns

`HTMLElement`

***

### getTableBody()

> **getTableBody**(): [`TableBody`](TableBody.md) \| `null`

Defined in: [table/TableContainer.ts:3319](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3319)

Get the table body instance

#### Returns

[`TableBody`](TableBody.md) \| `null`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableContainer.ts:3312](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3312)

Check if the container has been destroyed

#### Returns

`boolean`

***

### onResize()

> **onResize**(`callback`): () => `void`

Defined in: [table/TableContainer.ts:1328](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L1328)

Subscribe to resize events

#### Parameters

##### callback

[`ResizeCallback`](../type-aliases/ResizeCallback.md)

Function to call when container resizes

#### Returns

Unsubscribe function

() => `void`

***

### openValueInspector()

> **openValueInspector**(`cell`): `boolean`

Defined in: [table/TableContainer.ts:2702](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L2702)

Open the value inspector on a body cell: the whole of a nested (LIST,
ARRAY, STRUCT, MAP, UNION, VARIANT) or JSON value as a keyboard tree, in
a panel beside the cell. What `F2` on the cursor, a double click and the
cell's inspect icon do. Closes the other panels; Escape closes it, and
focus goes back to the grid with the cursor where it was.

The panel is a lazy chunk: it opens a microtask later, after the cursor
keys have scrolled the cell into view, and the first time after the
chunk loads. What happens meanwhile is the user going on, and the open
waiting for it is dropped: a newer one, another panel opening, the
cursor moving off the cell, a new filter, sort, selection or table, and,
when focus was in the table, focus leaving it. Called from code, the
cursor need not be on the cell, but moving it in the same task drops
the open, as it closes the panel once open. A chunk that fails to load
is announced and reported through the `onError` option.

#### Parameters

##### cell

The cell, by row (0-based, in the table as sorted and
  filtered) and column name.

###### column

`string`

###### row

`number`

#### Returns

`boolean`

whether there is a value to inspect there: `false` for a column
  that is not nested or JSON, a NULL, a row not loaded or not rendered.
  `true` still opens nothing when the open is dropped before the chunk
  is there.

#### Example

```typescript
container.openValueInspector({ row: 12, column: 'tags' });
```

***

### render()

> **render**(): `void`

Defined in: [table/TableContainer.ts:2066](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L2066)

Render the table container

Creates ColumnHeader components for each visible column and renders
placeholder content for the body (to be implemented in Task 3.4).

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [table/TableContainer.ts:1204](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L1204)

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

Defined in: [table/TableContainer.ts:3206](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/table/TableContainer.ts#L3206)

Resolves once the surviving `TableBody` has painted the rows in view:
its first fetch, and the refetch a restored session's sort or filters
cause.

Used by `loadDataImpl` so `await createDataTable({ source })` and
`await table.loadData(source)` only resolve after the first row
fetch lands — closing the contract gap where consumers could call
`addFilter` synchronously and race the unfiltered initial SELECT.

Resolves (never rejects) on every path: success, body-init error
(swallowed at the assignment site), `destroy()` mid-init, and the
no-fetch paths (zero rows, empty `visibleColumns`).

#### Returns

`Promise`\<`void`\>
