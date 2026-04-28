[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / TableEvents

# Type Alias: TableEvents

> **TableEvents** = `object`

Defined in: [core/TableEvents.ts:50](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L50)

Discriminated event map for the [DataTable](../interfaces/DataTable.md) facade. Subscribe via
`table.on(event, handler)` (returns an unsubscribe function) or
`table.off(event, handler)`. Each key below documents the payload shape
the handler receives.

## Remarks

Defined as a `type` (not `interface`) so it satisfies
`Record<string, unknown>` for `EventEmitter`. Interfaces with named
keys in TypeScript don't auto-satisfy that constraint.

**Payload immutability.** Every payload field carrying a mutable
collection (`Filter[]`, `Set<number>`, `string[]`, `DerivedColumnDef[]`,
`ColumnSchema[]`, …) is a fresh shallow copy at emit time AND is typed
`readonly` (Phase 9 type-tightening) so handler-side mutation fails to
compile under `--strict`. The runtime clone is the load-bearing safety
net (Phase 8); the `readonly` markers surface intent at the type
level. Item identity inside the collection is not deep-cloned — treat
the items themselves as read-only too. If you need a mutable copy,
call `.slice()` / `new Set(...)` / `new Map(...)` at the consumer.

## Properties

### columnChange

> **columnChange**: `object`

Defined in: [core/TableEvents.ts:126](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L126)

Fired when visibility, order, pin state, or widths change.

#### columnOrder

> **columnOrder**: readonly `string`[]

#### pinnedColumns

> **pinnedColumns**: readonly `string`[]

#### visibleColumns

> **visibleColumns**: readonly `string`[]

***

### derivedChange

> **derivedChange**: `object`

Defined in: [core/TableEvents.ts:141](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L141)

Fired when derived columns are added, updated, removed, or replaced.

#### columnName?

> `optional` **columnName?**: `string`

#### derivedColumns

> **derivedColumns**: readonly [`DerivedColumnDef`](DerivedColumnDef.md)[]

#### kind

> **kind**: `"added"` \| `"removed"` \| `"updated"` \| `"replaced"`

***

### destroy

> **destroy**: `Record`\<`string`, `never`\>

Defined in: [core/TableEvents.ts:151](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L151)

Fired on the library's own teardown, before signals are disposed.

***

### error

> **error**: `object`

Defined in: [core/TableEvents.ts:88](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L88)

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

Defined in: [core/TableEvents.ts:113](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L113)

Fired on any change to the active filter list.

#### filteredRowCount

> **filteredRowCount**: `number`

#### filters

> **filters**: readonly [`Filter`](Filter.md)[]

#### totalRowCount

> **totalRowCount**: `number`

***

### loadComplete

> **loadComplete**: `object`

Defined in: [core/TableEvents.ts:61](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L61)

Fired after data is loaded and schema is known.

#### rowCount

> **rowCount**: `number`

#### schema

> **schema**: readonly [`ColumnSchema`](../interfaces/ColumnSchema.md)[]

#### tableName

> **tableName**: `string`

***

### loadError

> **loadError**: `object`

Defined in: [core/TableEvents.ts:68](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L68)

Fired if a load fails. The `error` is always a typed DataTableError (subclass of Error).

#### error

> **error**: `Error`

***

### loadProgress

> **loadProgress**: [`ProgressInfo`](../interfaces/ProgressInfo.md)

Defined in: [core/TableEvents.ts:58](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L58)

Per-chunk progress while loading (bytes, percent, stage).

***

### loadStart

> **loadStart**: `object`

Defined in: [core/TableEvents.ts:55](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L55)

Fired when a load operation begins.

#### source

> **source**: `string`

***

### ready

> **ready**: `object`

Defined in: [core/TableEvents.ts:52](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L52)

Fired after `initialize()` completes and the worker is ready.

#### bridgeReady

> **bridgeReady**: `true`

***

### selectionChange

> **selectionChange**: `object`

Defined in: [core/TableEvents.ts:123](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L123)

Fired when the selected-row set changes.

#### selectedRows

> **selectedRows**: `ReadonlySet`\<`number`\>

***

### sortChange

> **sortChange**: `object`

Defined in: [core/TableEvents.ts:120](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L120)

Fired on sort changes.

#### sortColumns

> **sortColumns**: readonly [`SortColumn`](../interfaces/SortColumn.md)[]

***

### undoChange

> **undoChange**: `object`

Defined in: [core/TableEvents.ts:148](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L148)

Fired whenever canUndo/canRedo changes (e.g., after any action or an undo/redo).

#### canRedo

> **canRedo**: `boolean`

#### canUndo

> **canUndo**: `boolean`

***

### warning

> **warning**: `object`

Defined in: [core/TableEvents.ts:106](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/TableEvents.ts#L106)

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
