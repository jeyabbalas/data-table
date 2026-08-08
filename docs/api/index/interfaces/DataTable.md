[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTable

# Interface: DataTable

Defined in: [DataTable.ts:363](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L363)

The returned object from [createDataTable](../functions/createDataTable.md).

## Properties

### actions

> `readonly` **actions**: [`StateActions`](../../advanced/classes/StateActions.md)

Defined in: [DataTable.ts:367](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L367)

Command/mutation layer.

***

### annotations

> `readonly` **annotations**: [`AnnotationStore`](../../advanced/classes/AnnotationStore.md)

Defined in: [DataTable.ts:378](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L378)

Programmatic row / column / cell annotation store. Annotations are
app-authored metadata (validation errors, QC notes) that overlay the
table read-only; they do not participate in undo/redo and persist
independently via `SessionSnapshot`.

***

### bridge

> `readonly` **bridge**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:369](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L369)

DuckDB worker bridge for custom SQL queries.

***

### container

> `readonly` **container**: [`TableContainer`](../../advanced/classes/TableContainer.md)

Defined in: [DataTable.ts:371](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L371)

UI container. Rarely needed directly; prefer the event bus.

***

### instanceId

> `readonly` **instanceId**: `string`

Defined in: [DataTable.ts:389](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L389)

Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into cell and
modal element IDs to keep two tables on the same page from colliding on
`aria-labelledby` and `aria-activedescendant` targets.

This is the value actually used in the DOM, which is not the
[CreateDataTableOptions.instanceId](CreateDataTableOptions.md#instanceid) you passed in: a random suffix
is always appended. Read it here rather than assuming it.

***

### state

> `readonly` **state**: [`TableState`](../../advanced/interfaces/TableState.md)

Defined in: [DataTable.ts:365](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L365)

Reactive state signals — advanced users can subscribe directly.

## Methods

### clearSession()

> **clearSession**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:451](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L451)

Wipe the persisted UI snapshot for the current table AND reset in-memory
state. Clears filters, sort, columns, derived columns, undo/redo stacks,
filter presets, and the bridge's query cache. After this call the table
behaves as if just constructed with no `source` — call [loadData](#loaddata)
to populate it again. Safe to call when persistence is disabled (only the
IndexedDB delete is skipped).

#### Returns

`Promise`\<`void`\>

***

### destroy()

> **destroy**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:457](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L457)

Tear down everything this table owns: DOM, subscriptions, worker (if owned),
session store (if owned). Call when unmounting from the DOM.

#### Returns

`Promise`\<`void`\>

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:486](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L486)

The currently-applied color scheme. Reflects the last [setColorScheme](#setcolorscheme) call (or the initial option).

#### Returns

[`ColorScheme`](../type-aliases/ColorScheme.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [DataTable.ts:464](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L464)

`true` once [destroy](#destroy) has been called. Useful as a guard in
framework cleanup callbacks (e.g., React `useEffect` returns) that may
run after an earlier destroy.

#### Returns

`boolean`

***

### isPersistenceActive()

> **isPersistenceActive**(): `boolean`

Defined in: [DataTable.ts:472](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L472)

`true` if IndexedDB-backed session persistence is active. Returns `false`
when persistence was disabled via options OR when IndexedDB was
unavailable at init time (check for a `warning` event with code
`PERSISTENCE_UNAVAILABLE` to distinguish).

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `opts?`): `Promise`\<`void`\>

Defined in: [DataTable.ts:399](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L399)

Load a new data source into the table. Re-uses the existing worker.
Emits `loadStart` → (`loadProgress` …) → `loadComplete` or `loadError`.

#### Parameters

##### source

`string` \| `File` \| `Blob` \| `ArrayBuffer`

##### opts?

[`LoadDataOptions`](../../advanced/interfaces/LoadDataOptions.md) & `object`

#### Returns

`Promise`\<`void`\>

#### Remarks

Resolves at first **interactive** paint — schema known, first
row block rendered, filter counts correct — not when every column chart
has drawn. See [whenVizReady](#whenvizready).

***

### off()

> **off**\<`K`\>(`event`, `handler`): `void`

Defined in: [DataTable.ts:438](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L438)

Alternative to the return value of `on`.

#### Type Parameters

##### K

`K` *extends* keyof [`TableEvents`](../type-aliases/TableEvents.md)

#### Parameters

##### event

`K`

##### handler

(`payload`) => `void`

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`event`, `handler`): () => `void`

Defined in: [DataTable.ts:436](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L436)

Subscribe to an event. Returns an unsubscribe function.

#### Type Parameters

##### K

`K` *extends* keyof [`TableEvents`](../type-aliases/TableEvents.md)

#### Parameters

##### event

`K`

##### handler

(`payload`) => `void`

#### Returns

() => `void`

***

### openExportDialog()

> **openExportDialog**(): `void`

Defined in: [DataTable.ts:441](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L441)

Open the export dialog. No-op if `exportDialog: false`.

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [DataTable.ts:483](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L483)

Switch the light/dark theme at runtime. `'light'` / `'dark'` force the
corresponding theme; `'auto'` clears the override and lets
`prefers-color-scheme` govern again. Open body-portalled modals re-sync
automatically via their mounted `data-dt-color-scheme` attribute.

#### Parameters

##### scheme

[`ColorScheme`](../type-aliases/ColorScheme.md)

#### Returns

`void`

#### Throws

[ConfigurationError](../classes/ConfigurationError.md) — if `scheme` is not `'light' | 'dark' | 'auto'`.

#### Throws

[DestroyedError](../classes/DestroyedError.md) — if the table has been destroyed.

***

### whenVizReady()

> **whenVizReady**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:433](https://github.com/jeyabbalas/data-table/blob/51ba4ef4aa1b4adfe8a0a7317bb8afc40fcaf160/src/DataTable.ts#L433)

Resolves when the current load's visible column charts have finished
fetching — the promise form of the `vizReady` event.

`loadData` (and `await createDataTable({ source })`) resolves at first
interactive paint and does not wait for charts. Await this when you need
them drawn: a screenshot, a PDF, a visual-regression snapshot.

Resolves immediately before the first load, and is replaced on each
subsequent `loadData` — call it after starting the load you care about.
With `visualizations: false` or `{ eager: true }` it has already
resolved by the time `loadData` does.

#### Returns

`Promise`\<`void`\>

#### Remarks

**It can stay pending while the document is hidden.** Chart
creation is driven by an `IntersectionObserver`, and a browser gives a
background or minimized window no rendering opportunity, so no
intersection is ever computed and no chart is ever created. That is the
platform's behavior, not a stall; the promise settles when the tab
becomes visible. Use `{ eager: true }` if you must have charts in a
hidden document.

#### Example

```ts
const table = await createDataTable({ container, source });
// The grid is already interactive here.
await table.whenVizReady();
await page.screenshot();
```
