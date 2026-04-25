[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / TableEvents

# Type Alias: TableEvents

> **TableEvents** = `object`

Defined in: [core/TableEvents.ts:32](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L32)

## Properties

### columnChange

> **columnChange**: `object`

Defined in: [core/TableEvents.ts:108](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L108)

Fired when visibility, order, pin state, or widths change.

#### columnOrder

> **columnOrder**: `string`[]

#### pinnedColumns

> **pinnedColumns**: `string`[]

#### visibleColumns

> **visibleColumns**: `string`[]

***

### derivedChange

> **derivedChange**: `object`

Defined in: [core/TableEvents.ts:123](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L123)

Fired when derived columns are added, updated, removed, or replaced.

#### columnName?

> `optional` **columnName?**: `string`

#### derivedColumns

> **derivedColumns**: [`DerivedColumnDef`](DerivedColumnDef.md)[]

#### kind

> **kind**: `"added"` \| `"removed"` \| `"updated"` \| `"replaced"`

***

### destroy

> **destroy**: `Record`\<`string`, `never`\>

Defined in: [core/TableEvents.ts:133](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L133)

Fired on the library's own teardown, before signals are disposed.

***

### error

> **error**: `object`

Defined in: [core/TableEvents.ts:70](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L70)

General error event. Fired for any recoverable typed error the library
surfaces at runtime — load failures, SQL validation, export failures,
persistence write failures, visualization fetch failures, etc.
`source` discriminates which subsystem produced the error.

#### error

> **error**: [`DataTableError`](../classes/DataTableError.md)

#### source

> **source**: [`TableErrorSource`](TableErrorSource.md)

#### Example

```ts
table.on('error', ({ error, source }) => {
  if (error instanceof LoadError && error.code === 'PARSE_FAILED') {
    toast('Could not read that file.');
  } else if (source === 'persistence') {
    // IDB failures are non-fatal; degrade quietly.
    console.warn(error);
  } else {
    reportToSentry(error);
  }
});
```

***

### filterChange

> **filterChange**: `object`

Defined in: [core/TableEvents.ts:95](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L95)

Fired on any change to the active filter list.

#### filteredRowCount

> **filteredRowCount**: `number`

#### filters

> **filters**: [`Filter`](Filter.md)[]

#### totalRowCount

> **totalRowCount**: `number`

***

### loadComplete

> **loadComplete**: `object`

Defined in: [core/TableEvents.ts:43](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L43)

Fired after data is loaded and schema is known.

#### rowCount

> **rowCount**: `number`

#### schema

> **schema**: [`ColumnSchema`](../interfaces/ColumnSchema.md)[]

#### tableName

> **tableName**: `string`

***

### loadError

> **loadError**: `object`

Defined in: [core/TableEvents.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L50)

Fired if a load fails. The `error` is always a typed DataTableError (subclass of Error).

#### error

> **error**: `Error`

***

### loadProgress

> **loadProgress**: [`ProgressInfo`](../interfaces/ProgressInfo.md)

Defined in: [core/TableEvents.ts:40](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L40)

Per-chunk progress while loading (bytes, percent, stage).

***

### loadStart

> **loadStart**: `object`

Defined in: [core/TableEvents.ts:37](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L37)

Fired when a load operation begins.

#### source

> **source**: `string`

***

### ready

> **ready**: `object`

Defined in: [core/TableEvents.ts:34](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L34)

Fired after `initialize()` completes and the worker is ready.

#### bridgeReady

> **bridgeReady**: `true`

***

### selectionChange

> **selectionChange**: `object`

Defined in: [core/TableEvents.ts:105](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L105)

Fired when the selected-row set changes.

#### selectedRows

> **selectedRows**: `Set`\<`number`\>

***

### sortChange

> **sortChange**: `object`

Defined in: [core/TableEvents.ts:102](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L102)

Fired on sort changes.

#### sortColumns

> **sortColumns**: [`SortColumn`](../interfaces/SortColumn.md)[]

***

### undoChange

> **undoChange**: `object`

Defined in: [core/TableEvents.ts:130](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L130)

Fired whenever canUndo/canRedo changes (e.g., after any action or an undo/redo).

#### canRedo

> **canRedo**: `boolean`

#### canUndo

> **canUndo**: `boolean`

***

### warning

> **warning**: `object`

Defined in: [core/TableEvents.ts:88](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/TableEvents.ts#L88)

Non-fatal warning event. Emitted when the library continues operating
in a degraded mode (e.g., stylesheet missing, IndexedDB unavailable).

#### code

> **code**: `string`

#### details?

> `optional` **details?**: `Record`\<`string`, `unknown`\>

#### message

> **message**: `string`

#### Example

```ts
table.on('warning', ({ code, message }) => {
  if (code === 'STYLESHEET_MISSING') {
    console.warn('Forgot to import @jeyabbalas/data-table/styles?');
  } else if (code === 'PERSISTENCE_UNAVAILABLE') {
    // Running in a private window — inform the user.
  }
});
```
