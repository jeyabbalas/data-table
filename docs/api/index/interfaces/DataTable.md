[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTable

# Interface: DataTable

Defined in: [DataTable.ts:257](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L257)

The returned object from [createDataTable](../functions/createDataTable.md).

## Properties

### actions

> `readonly` **actions**: [`StateActions`](../../advanced/classes/StateActions.md)

Defined in: [DataTable.ts:261](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L261)

Command/mutation layer.

***

### annotations

> `readonly` **annotations**: [`AnnotationStore`](../../advanced/classes/AnnotationStore.md)

Defined in: [DataTable.ts:272](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L272)

Programmatic row / column / cell annotation store. Annotations are
app-authored metadata (validation errors, QC notes) that overlay the
table read-only; they do not participate in undo/redo and persist
independently via `SessionSnapshot`.

***

### bridge

> `readonly` **bridge**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:263](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L263)

DuckDB worker bridge for custom SQL queries.

***

### container

> `readonly` **container**: [`TableContainer`](../../advanced/classes/TableContainer.md)

Defined in: [DataTable.ts:265](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L265)

UI container. Rarely needed directly; prefer the event bus.

***

### instanceId

> `readonly` **instanceId**: `string`

Defined in: [DataTable.ts:283](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L283)

Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into cell and
modal element IDs to keep two tables on the same page from colliding on
`aria-labelledby` and `aria-activedescendant` targets.

This is the value actually used in the DOM, which is not the
[CreateDataTableOptions.instanceId](CreateDataTableOptions.md#instanceid) you passed in: a random suffix
is always appended. Read it here rather than assuming it.

***

### state

> `readonly` **state**: [`TableState`](../../advanced/interfaces/TableState.md)

Defined in: [DataTable.ts:259](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L259)

Reactive state signals — advanced users can subscribe directly.

## Methods

### clearSession()

> **clearSession**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:310](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L310)

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

Defined in: [DataTable.ts:316](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L316)

Tear down everything this table owns: DOM, subscriptions, worker (if owned),
session store (if owned). Call when unmounting from the DOM.

#### Returns

`Promise`\<`void`\>

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:345](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L345)

The currently-applied color scheme. Reflects the last [setColorScheme](#setcolorscheme) call (or the initial option).

#### Returns

[`ColorScheme`](../type-aliases/ColorScheme.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [DataTable.ts:323](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L323)

`true` once [destroy](#destroy) has been called. Useful as a guard in
framework cleanup callbacks (e.g., React `useEffect` returns) that may
run after an earlier destroy.

#### Returns

`boolean`

***

### isPersistenceActive()

> **isPersistenceActive**(): `boolean`

Defined in: [DataTable.ts:331](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L331)

`true` if IndexedDB-backed session persistence is active. Returns `false`
when persistence was disabled via options OR when IndexedDB was
unavailable at init time (check for a `warning` event with code
`PERSISTENCE_UNAVAILABLE` to distinguish).

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `opts?`): `Promise`\<`void`\>

Defined in: [DataTable.ts:289](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L289)

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

Defined in: [DataTable.ts:297](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L297)

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

Defined in: [DataTable.ts:295](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L295)

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

Defined in: [DataTable.ts:300](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L300)

Open the export dialog. No-op if `exportDialog: false`.

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [DataTable.ts:342](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/DataTable.ts#L342)

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
