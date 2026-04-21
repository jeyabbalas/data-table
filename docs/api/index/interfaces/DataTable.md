[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTable

# Interface: DataTable

Defined in: [DataTable.ts:228](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L228)

The returned object from [createDataTable](../functions/createDataTable.md).

## Properties

### actions

> `readonly` **actions**: [`StateActions`](../../advanced/classes/StateActions.md)

Defined in: [DataTable.ts:232](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L232)

Command/mutation layer.

***

### bridge

> `readonly` **bridge**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:234](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L234)

DuckDB worker bridge for custom SQL queries.

***

### container

> `readonly` **container**: [`TableContainer`](../../advanced/classes/TableContainer.md)

Defined in: [DataTable.ts:236](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L236)

UI container. Rarely needed directly; prefer the event bus.

***

### instanceId

> `readonly` **instanceId**: `string`

Defined in: [DataTable.ts:243](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L243)

Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into modal
element IDs to keep two tables on the same page from colliding on
`aria-labelledby` targets.

***

### state

> `readonly` **state**: [`TableState`](../../advanced/interfaces/TableState.md)

Defined in: [DataTable.ts:230](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L230)

Reactive state signals — advanced users can subscribe directly.

## Methods

### clearSession()

> **clearSession**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:276](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L276)

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

Defined in: [DataTable.ts:282](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L282)

Tear down everything this table owns: DOM, subscriptions, worker (if owned),
session store (if owned). Call when unmounting from the DOM.

#### Returns

`Promise`\<`void`\>

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:311](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L311)

The currently-applied color scheme. Reflects the last [setColorScheme](#setcolorscheme) call (or the initial option).

#### Returns

[`ColorScheme`](../type-aliases/ColorScheme.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [DataTable.ts:289](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L289)

`true` once [destroy](#destroy) has been called. Useful as a guard in
framework cleanup callbacks (e.g., React `useEffect` returns) that may
run after an earlier destroy.

#### Returns

`boolean`

***

### isPersistenceActive()

> **isPersistenceActive**(): `boolean`

Defined in: [DataTable.ts:297](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L297)

`true` if IndexedDB-backed session persistence is active. Returns `false`
when persistence was disabled via options OR when IndexedDB was
unavailable at init time (check for a `warning` event with code
`PERSISTENCE_UNAVAILABLE` to distinguish).

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `opts?`): `Promise`\<`void`\>

Defined in: [DataTable.ts:249](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L249)

Load a new data source into the table. Re-uses the existing worker.
Emits `loadStart` → (`loadProgress` …) → `loadComplete` or `loadError`.

#### Parameters

##### source

`string` \| `File` \| `Blob` \| `ArrayBuffer`

##### opts?

[`LoadDataOptions`](../../advanced/interfaces/LoadDataOptions.md) & `object`

#### Returns

`Promise`\<`void`\>

***

### off()

> **off**\<`K`\>(`event`, `handler`): `void`

Defined in: [DataTable.ts:260](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L260)

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

Defined in: [DataTable.ts:255](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L255)

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

Defined in: [DataTable.ts:266](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L266)

Open the export dialog. No-op if `exportDialog: false`.

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [DataTable.ts:308](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L308)

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
