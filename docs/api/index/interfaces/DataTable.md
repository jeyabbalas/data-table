[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / DataTable

# Interface: DataTable

Defined in: [DataTable.ts:251](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L251)

The returned object from [createDataTable](../functions/createDataTable.md).

## Properties

### actions

> `readonly` **actions**: [`StateActions`](../../advanced/classes/StateActions.md)

Defined in: [DataTable.ts:255](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L255)

Command/mutation layer.

***

### annotations

> `readonly` **annotations**: [`AnnotationStore`](../../advanced/classes/AnnotationStore.md)

Defined in: [DataTable.ts:266](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L266)

Programmatic row / column / cell annotation store. Annotations are
app-authored metadata (validation errors, QC notes) that overlay the
table read-only; they do not participate in undo/redo and persist
independently via `SessionSnapshot`.

***

### bridge

> `readonly` **bridge**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:257](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L257)

DuckDB worker bridge for custom SQL queries.

***

### container

> `readonly` **container**: [`TableContainer`](../../advanced/classes/TableContainer.md)

Defined in: [DataTable.ts:259](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L259)

UI container. Rarely needed directly; prefer the event bus.

***

### instanceId

> `readonly` **instanceId**: `string`

Defined in: [DataTable.ts:273](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L273)

Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into modal
element IDs to keep two tables on the same page from colliding on
`aria-labelledby` targets.

***

### state

> `readonly` **state**: [`TableState`](../../advanced/interfaces/TableState.md)

Defined in: [DataTable.ts:253](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L253)

Reactive state signals — advanced users can subscribe directly.

## Methods

### clearSession()

> **clearSession**(): `Promise`\<`void`\>

Defined in: [DataTable.ts:300](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L300)

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

Defined in: [DataTable.ts:306](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L306)

Tear down everything this table owns: DOM, subscriptions, worker (if owned),
session store (if owned). Call when unmounting from the DOM.

#### Returns

`Promise`\<`void`\>

***

### getColorScheme()

> **getColorScheme**(): [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:335](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L335)

The currently-applied color scheme. Reflects the last [setColorScheme](#setcolorscheme) call (or the initial option).

#### Returns

[`ColorScheme`](../type-aliases/ColorScheme.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [DataTable.ts:313](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L313)

`true` once [destroy](#destroy) has been called. Useful as a guard in
framework cleanup callbacks (e.g., React `useEffect` returns) that may
run after an earlier destroy.

#### Returns

`boolean`

***

### isPersistenceActive()

> **isPersistenceActive**(): `boolean`

Defined in: [DataTable.ts:321](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L321)

`true` if IndexedDB-backed session persistence is active. Returns `false`
when persistence was disabled via options OR when IndexedDB was
unavailable at init time (check for a `warning` event with code
`PERSISTENCE_UNAVAILABLE` to distinguish).

#### Returns

`boolean`

***

### loadData()

> **loadData**(`source`, `opts?`): `Promise`\<`void`\>

Defined in: [DataTable.ts:279](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L279)

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

Defined in: [DataTable.ts:287](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L287)

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

Defined in: [DataTable.ts:285](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L285)

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

Defined in: [DataTable.ts:290](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L290)

Open the export dialog. No-op if `exportDialog: false`.

#### Returns

`void`

***

### setColorScheme()

> **setColorScheme**(`scheme`): `void`

Defined in: [DataTable.ts:332](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/DataTable.ts#L332)

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
