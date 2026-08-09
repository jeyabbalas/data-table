[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / TableContainer

# Class: TableContainer

Defined in: [table/TableContainer.ts:200](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L200)

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

Defined in: [table/TableContainer.ts:366](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L366)

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

Defined in: [table/TableContainer.ts:1542](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L1542)

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

Defined in: [table/TableContainer.ts:3030](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L3030)

Destroy the table container and clean up resources

#### Returns

`void`

***

### getBodyContainer()

> **getBodyContainer**(): `HTMLElement`

Defined in: [table/TableContainer.ts:2922](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2922)

Get the body container element

#### Returns

`HTMLElement`

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../../index/type-aliases/ColorScheme.md)

Defined in: [table/TableContainer.ts:704](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L704)

Returns the currently-applied color scheme.

#### Returns

[`ColorScheme`](../../index/type-aliases/ColorScheme.md)

***

### getColumnHeaders()

> **getColumnHeaders**(): [`ColumnHeader`](ColumnHeader.md)[]

Defined in: [table/TableContainer.ts:3009](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L3009)

The `ColumnHeader` instances that are **mounted right now**, in DOM order.

The header row is windowed: it holds the pinned prefix plus the columns
near the horizontal viewport, between two spacers. So this is a snapshot
of the current window, not the table's columns — it changes as the user
scrolls sideways, and a wide table never returns more than a few dozen
entries however many columns it has. Read `state.visibleColumns` for the
column list.

Suitable for acting on what is on screen (reading a visualization
container, restyling the mounted set). Not suitable as a place to attach
per-column behaviour: a header that scrolls in later will not have been
in any array this method ever returned. Drive that from the container's
`onHeaderMount` / `onHeaderUnmount` options instead.

The array is a copy; the headers in it are live.

#### Returns

[`ColumnHeader`](ColumnHeader.md)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [table/TableContainer.ts:2948](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2948)

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

Defined in: [table/TableContainer.ts:2891](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2891)

Get the root element

#### Returns

`HTMLElement`

***

### getFilterBar()

> **getFilterBar**(): [`FilterBar`](FilterBar.md) \| `null`

Defined in: [table/TableContainer.ts:3016](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L3016)

Get the filter bar instance

#### Returns

[`FilterBar`](FilterBar.md) \| `null`

***

### getFilterPanel()

> **getFilterPanel**(): [`FilterPanel`](FilterPanel.md) \| `null`

Defined in: [table/TableContainer.ts:3023](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L3023)

Get the filter panel instance

#### Returns

[`FilterPanel`](FilterPanel.md) \| `null`

***

### getGridElement()

> **getGridElement**(): `HTMLElement`

Defined in: [table/TableContainer.ts:2908](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2908)

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

Defined in: [table/TableContainer.ts:2915](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2915)

Get the header row element

#### Returns

`HTMLElement`

***

### getHeaderScroll()

> **getHeaderScroll**(): `HTMLElement`

Defined in: [table/TableContainer.ts:2941](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2941)

Get the header scroll element

This is the container that handles horizontal scrolling for the header.
It should be synced with the body scroll.

#### Returns

`HTMLElement`

***

### getInstanceId()

> **getInstanceId**(): `string`

Defined in: [table/TableContainer.ts:2973](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2973)

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

Defined in: [table/TableContainer.ts:2955](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2955)

Get the resolved options

#### Returns

`Required`\<[`TableContainerOptions`](../interfaces/TableContainerOptions.md)\>

***

### getPortalTarget()

> **getPortalTarget**(): `HTMLElement`

Defined in: [table/TableContainer.ts:2832](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2832)

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

Defined in: [table/TableContainer.ts:2931](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2931)

Get the scroll container element (body scroll)

This is the container that handles both horizontal and vertical scrolling for the body.

#### Returns

`HTMLElement`

***

### getTableBody()

> **getTableBody**(): [`TableBody`](TableBody.md) \| `null`

Defined in: [table/TableContainer.ts:2987](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2987)

Get the table body instance

#### Returns

[`TableBody`](TableBody.md) \| `null`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/TableContainer.ts:2980](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2980)

Check if the container has been destroyed

#### Returns

`boolean`

***

### onResize()

> **onResize**(`callback`): () => `void`

Defined in: [table/TableContainer.ts:821](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L821)

Subscribe to resize events

#### Parameters

##### callback

[`ResizeCallback`](../type-aliases/ResizeCallback.md)

Function to call when container resizes

#### Returns

Unsubscribe function

() => `void`

***

### refreshColumnWindow()

> **refreshColumnWindow**(): `void`

Defined in: [table/TableContainer.ts:936](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L936)

Recompute the shared column window and reconcile every consumer of it.

Synchronous: when this returns, the DOM matches the current `scrollLeft`.
That is the whole reason it exists as a method rather than as a scroll
handler. The browser does not dispatch `scroll` until after the current
task, so code that *writes* `scrollLeft` — keyboard navigation, the
filter-change scroll pin, the scroll restore after a re-render — would
otherwise leave a frame in which what is on screen belongs to the previous
offset. At 1,000 columns that frame is a blank table.

Cheap when nothing moved: cached prefix sums, a binary search, and a
comparison per axis — no DOM work at all. Safe to call unconditionally
after any programmatic scroll, which is what every call site does.

#### Returns

`void`

#### Example

```typescript
bodyScroll.scrollLeft = targetLeft;
container.refreshColumnWindow(); // both axes match the new offset now
```

***

### render()

> **render**(): `void`

Defined in: [table/TableContainer.ts:2158](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2158)

Bring the table's DOM up to date with its state.

Two tiers, dispatched on headerStructure:

- **The schema or the relation changed** — a load. Everything is rebuilt
  once, including `TableBody`, and scroll and focus are restored across
  the rebuild.
- **Anything else** — a hide, show, reorder, pin, derived-column add, or
  a caller asking for a refresh. The header row is reconciled by column
  name and `TableBody` *survives*: it has its own `visibleColumns`
  subscription that re-renders a reorder and refetches a set change, so
  destroying it here only threw away its row cache and its scroll
  position. Focus and scroll are left alone, because nothing that held
  either was removed — a header that *was* removed parks focus on the
  grid as it goes, which is both earlier and more accurate than the
  rebuild's frame-later rescue.

This is what collapses the load's double render. Both signals write in one
batch, so the `schema` subscriber rebuilds against the final value of
both, and the `visibleColumns` subscriber that follows finds every column
already mounted where it belongs — a walk over the window, no
construction, no `TableBody`.

Deliberately not a bare early return in that case, though the phase plan
called for one: `render()` is public on an `/advanced` class and means
"bring the DOM up to date", and the cheap tier is what keeps that true for
state it does not dispatch on.

A horizontal scroll is neither tier: it goes through
[refreshColumnWindow](#refreshcolumnwindow), which never reaches this method.

Synchronous either way — callers assert on the DOM immediately after
writing state.

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [table/TableContainer.ts:697](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L697)

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

Defined in: [table/TableContainer.ts:2884](https://github.com/jeyabbalas/data-table/blob/e27b31a13db38a2a6380497540343e8910254c1b/src/table/TableContainer.ts#L2884)

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
