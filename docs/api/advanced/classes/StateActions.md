[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StateActions

# Class: StateActions

Defined in: [core/Actions.ts:226](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L226)

StateActions class provides methods to manipulate TableState.

Exposed on `table.actions` from `createDataTable()`. This is the write-path
counterpart to `table.state` (read signals). Every mutation (filter change,
sort, column visibility, derived column, etc.) flows through here so undo,
events, and persistence stay in sync.

## Example

```ts
const table = await createDataTable({ container, source });

// Apply a range filter programmatically
table.actions.addFilter({
  type: 'range',
  column: 'age',
  min: 18,
  max: 65,
  maxInclusive: true,
});

// Toggle sort on a column (none → asc → desc → none)
table.actions.toggleSort('price');

// Add a derived column
await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'age_group',
  expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
});
```

## Constructors

### Constructor

> **new StateActions**(`state`, `bridge`, `undoManager?`): `StateActions`

Defined in: [core/Actions.ts:274](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L274)

#### Parameters

##### state

[`TableState`](../interfaces/TableState.md)

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### undoManager?

[`UndoManager`](UndoManager.md)

#### Returns

`StateActions`

## Methods

### addDerivedColumn()

> **addDerivedColumn**(`def`): `Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:1900](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1900)

Add a derived column (expression or vector), last in the column order.
Validates name uniqueness, creates VIEW, updates state.

Names are compared as DuckDB compares them, ignoring the case of ASCII
letters: `LABEL` beside a column `label` gets `already exists`, since
DuckDB would read `label`'s values for it. `__rowid__` is reserved, in
any case.

Runs in its turn: derived-column changes, undo, redo, reset and loads run
one at a time, in call order, and an add is validated against the columns
the changes ahead of it leave. A second add of one name gets `already
exists` once the first lands. Resolves `{ success: false }` when new
data is loaded before the add has landed.

#### Parameters

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

***

### addFilter()

> **addFilter**(`filter`): `void`

Defined in: [core/Actions.ts:1128](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1128)

Add or update a filter

If a filter for the same column exists, it will be replaced.

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md)

#### Returns

`void`

***

### addNestedFieldColumn()

> **addNestedFieldColumn**(`column`, `path`, `options?`): `Promise`\<\{ `error?`: `string`; `name?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:2072](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2072)

Add a column that reads one part of a nested or JSON column: a struct's
field, a list's or array's element, a map's value, a union's member, a
key or index inside a JSON document; or how long a list is, how many
entries a map has, which member a union holds. It is a derived
expression column, with the histogram, stats and filters any column of
its type gets.

`path` is read against the column's DuckDB type
(`ColumnSchema.originalType`), a step at a time:

- STRUCT: a field's name, or its 1-based position (the only way to an
  unnamed field).
- LIST, ARRAY: an element's 1-based position, as in SQL (`tags[1]`).
- MAP: a key, as text or as a number.
- UNION: a member's tag.
- JSON, VARIANT: every step from there on, an object's key (a string) or
  an array's 0-based index (a number), as in JSONPath.

The column goes right after its source, past the derived columns right
after the source that read it, so that extracts stay in the order they
were made: `point, point_x, point_y`. A pinned source's column goes
right after the pinned columns, unpinned. One undo entry: undo removes
the column, redo puts it back where it was.

Runs in its turn, as [addDerivedColumn](#addderivedcolumn) does, and resolves as it
does, `{ success: false, error }`, for a column that is not in the
schema or neither nested nor JSON, a path that does not fit the type, an
option it does not know, a name that is taken (ignoring letter case),
an expression DuckDB refuses, a destroyed table, or new data loaded
before the column has landed.

#### Parameters

##### column

`string`

The nested or JSON column's name.

##### path

readonly (`string` \| `number`)[]

The steps from the column to the part to read. Empty for
  the column itself: its length or tag (`extract`), or a JSON column's
  value read as `jsonLeaf` says.

##### options?

[`NestedFieldColumnOptions`](../../index/interfaces/NestedFieldColumnOptions.md) = `{}`

#### Returns

`Promise`\<\{ `error?`: `string`; `name?`: `string`; `success`: `boolean`; \}\>

`{ success: true, name }`, with the new column's name.

#### Examples

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.addNestedFieldColumn('point', ['x']);
// { success: true, name: 'point_x' }, a DOUBLE column right after point
```

```ts
// people: STRUCT(name VARCHAR, langs VARCHAR[])[]: the first person's
// second language
await table.actions.addNestedFieldColumn('people', [1, 'langs', 2]);
// { success: true, name: 'people_1_langs_2' }
```

```ts
// doc: JSON. A key with a dot in it, then an array index.
const result = await table.actions.addNestedFieldColumn('doc', ['a.b', 0]);
if (!result.success) console.warn(result.error);
```

***

### addRawSQLFilter()

> **addRawSQLFilter**(`sql`, `label?`): `string`

Defined in: [core/Actions.ts:1235](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1235)

Add a raw SQL filter. Does NOT re-validate — caller is responsible
for validation (see [validateSQLFilter](#validatesqlfilter)). Creates a RawSQLFilter
with a unique id and synthetic column key, appends to `state.filters`.
Captures an undo snapshot before mutation.

**Trust boundary.** The `sql` string is spliced verbatim into a WHERE
clause when filters are evaluated (see `filterToSQL` in
`src/filters/FilterSQL.ts`). The library calls DuckDB to validate
parseability via [validateSQLFilter](#validatesqlfilter), but does not constrain
semantics — any SELECT/UNION/EXISTS expression DuckDB accepts will
run. Treat `sql` as trusted developer input. If your end users author
raw SQL (e.g. through the SQL filter modal), validate at the host
application layer or document the data-exposure surface to them.

#### Parameters

##### sql

`string`

##### label?

`string`

#### Returns

`string`

The filter's unique id

***

### addToSort()

> **addToSort**(`column`): `void`

Defined in: [core/Actions.ts:1382](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1382)

Add column to multi-sort (Shift+click behavior)

If column is already in sort, toggles its direction or removes it.

#### Parameters

##### column

`string`

#### Returns

`void`

***

### beginColumnLayoutChange()

> **beginColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:703](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L703)

Open a column-layout gesture: the whole of it becomes one undo entry.

A gesture is any run of width and order changes the user reads as a single
action — a resize drag, or a keyboard `Shift+F2` session that resizes and
moves a column before committing. Captures the pre-gesture state once and
suppresses nested capture, so the ten `setColumnWidth` calls a drag emits
(or the ten `setColumnOrder` calls a keyboard move emits) do not become ten
undo steps. Close it with [StateActions.endColumnLayoutChange](#endcolumnlayoutchange) or
[StateActions.cancelColumnLayoutChange](#cancelcolumnlayoutchange).

Captures even when undo is disabled — the snapshot is what
`cancelColumnLayoutChange()` restores from, which has to work regardless.
Calling it twice without closing keeps the first (outermost) snapshot.

#### Returns

`void`

#### Example

```typescript
actions.beginColumnLayoutChange();
actions.setColumnWidth('price', 220);
actions.setColumnOrder(['price', 'name', 'qty']);
actions.endColumnLayoutChange(); // one Ctrl+Z undoes both
```

#### Throws

`DestroyedError` if the table was destroyed.

***

### beginColumnWidthChange()

> **beginColumnWidthChange**(): `void`

Defined in: [core/Actions.ts:758](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L758)

Begin a column width drag sequence.
Captures state once at drag start for undo.

A width drag is one flavour of column-layout gesture; this delegates so
the mouse path picks up the "push only if something changed" guard too.

#### Returns

`void`

#### Throws

`DestroyedError` if the table was destroyed.

***

### cancelColumnLayoutChange()

> **cancelColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:740](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L740)

Abandon an open column-layout gesture, restoring the state it opened on.

The `Escape` half of the keyboard gesture: width **and** position go back
to what they were at entry, and nothing is pushed onto the undo stack —
a cancelled gesture never happened. No-op when no gesture is open.

#### Returns

`void`

#### Throws

`DestroyedError` if the table was destroyed.

***

### clearFilters()

> **clearFilters**(): `void`

Defined in: [core/Actions.ts:1176](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1176)

Clear all filters

The `filteredRows` reset is unconditional — it repairs the count whether
or not there was anything to clear — but the filter list is only written
when it actually changes, so this is idempotent in the same way
[StateActions.removeFilter](#removefilter) is.

#### Returns

`void`

***

### clearFocusedCell()

> **clearFocusedCell**(): `void`

Defined in: [core/Actions.ts:2973](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2973)

Clear focused cell.

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [core/Actions.ts:2919](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2919)

Clear all row selection

#### Returns

`void`

***

### clearSort()

> **clearSort**(): `void`

Defined in: [core/Actions.ts:1409](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1409)

Clear all sorting

#### Returns

`void`

***

### endColumnLayoutChange()

> **endColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:721](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L721)

Commit an open column-layout gesture, pushing one undo entry.

The entry is pushed **only if the state actually changed** — a mousedown
and mouseup on the resize handle with no movement in between, or a
`Shift+F2` the user immediately commits, leaves the undo stack alone
rather than adding a step that undoes to an identical state. No-op when
no gesture is open.

#### Returns

`void`

#### Throws

`DestroyedError` if the table was destroyed.

***

### endColumnWidthChange()

> **endColumnWidthChange**(): `void`

Defined in: [core/Actions.ts:769](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L769)

End a column width drag sequence.
Pushes the pre-drag snapshot to the undo stack, unless the drag was a
no-op.

#### Returns

`void`

#### Throws

`DestroyedError` if the table was destroyed.

***

### getCellValue()

> **getCellValue**(`rowId`, `column`, `options?`): `Promise`\<`unknown`\>

Defined in: [core/Actions.ts:2778](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2778)

Read one cell's value, exactly: the value in column `column` of the row
whose `__rowid__` is `rowId`, from the current effective table (the
derived-column VIEW when there is one).

A nested column's value (`type: 'nested'`: a LIST, ARRAY, STRUCT, MAP,
UNION or VARIANT) is read as exact JSON text and turned into JS values:

- LIST and ARRAY → an array.
- STRUCT → an object keyed by field name; a struct whose fields have no
  names (`row(1, 'a')`) → an array of its values. Every key is an own
  property, `__proto__`, `constructor` and `toJSON` included, so the
  object survives `structuredClone` and `JSON.stringify`. Test keys with
  `Object.hasOwn`: a field named `hasOwnProperty` hides the method.
- MAP → a `Map`, entries in order, keys typed by the key type: an
  integer key is a number (a bigint beyond ±(2^53−1)), a FLOAT, DOUBLE or
  DECIMAL key a number, a BOOLEAN key a boolean, any other key its text
  (a DATE key `'2024-01-02'`, a STRUCT key `"{'k': 1}"`).
- UNION → `{ [tag]: value }`.
- Integers → a number when exact, a `bigint` beyond ±(2^53−1). DECIMAL,
  FLOAT and DOUBLE → a number (`NaN`, `±Infinity` and `-0` kept; a FLOAT
  is its float32 value, `0.10000000149011612` for `0.1`). BOOLEAN → a
  boolean. Dates, times, timestamps, UUIDs, INTERVALs, BLOBs, ENUMs and
  BITs → DuckDB's text: `'2024-01-02'`, `'1 year 2 months'`, `'\\xAA\\xBB'`.
- A VARIANT, or JSON inside a value → what its JSON holds.

Any other column's value is the one [getColumnValues](#getcolumnvalues) returns for
the row: a `bigint` for `BIGINT`, `UBIGINT`, `HUGEINT` and `UHUGEINT`; a
number for the other integers and for `FLOAT`, `DOUBLE` and `DECIMAL`;
DuckDB's text for `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY` and
`TIME WITH TIME ZONE`; a `JSON` column's text; a `Uint8Array` for a
`BLOB`. SQL NULL, at the top or anywhere inside, is `null`.

One query by `__rowid__`. It skips the query cache and runs ahead of
queued chart and stats queries.

#### Parameters

##### rowId

`number` \| `bigint`

The row's `__rowid__`: a non-negative integer, as a
  number or as the bigint `getColumnValues('__rowid__')` gives.

##### column

`string`

The column's name.

##### options?

[`GetCellValueOptions`](../../index/interfaces/GetCellValueOptions.md) = `{}`

#### Returns

`Promise`\<`unknown`\>

#### Examples

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.getCellValue(10, 'point'); // { x: 1.5, y: -0.5, tier: 'gold' }
```

```ts
// attrs: MAP(VARCHAR, INTEGER), keys in order, `size` a key like any other
const attrs = (await table.actions.getCellValue(11n, 'attrs')) as Map<string, number>;
attrs.get('size'); // 1
```

```ts
// big_ints: BIGINT[]: numbers when exact, bigints beyond 2^53
await table.actions.getCellValue(3, 'big_ints');
// [9007199254740991, 9007199254740993n, -9223372036854775808n, 9223372036854775807n]
```

#### Throws

`QueryError` with `code: 'COLUMN_NOT_FOUND'` when `column` is not
  in the current schema.

#### Throws

`QueryError` with `code: 'INVALID_ROWID'` and `details: { rowId }`
  when `rowId` is not a non-negative integer (a safe integer, or a bigint
  within the BIGINT range), or when no row has it.

#### Throws

`QueryError` with `code: 'NO_TABLE'` when called before any data
  is loaded.

#### Throws

`QueryError` with `code: 'QUERY_ABORTED'` when `options.signal`
  aborts the read.

#### Throws

`DestroyedError` if the table was destroyed before or during the
  call.

***

### getColumnHeaderTooltip()

> **getColumnHeaderTooltip**(`column`): [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

Defined in: [core/Actions.ts:1773](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1773)

Get the app-controlled tooltip content for a column header, or `null`
if unset. Always returns the normalized object form, even when the
setter was called with the string shorthand.

#### Parameters

##### column

`string`

#### Returns

[`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

***

### getColumnValues()

> **getColumnValues**(`name`, `opts?`): `Promise`\<`unknown`[] \| `Int32Array`\<`ArrayBufferLike`\> \| `Float64Array`\<`ArrayBufferLike`\> \| `BigInt64Array`\<`ArrayBufferLike`\>\>

Defined in: [core/Actions.ts:2613](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2613)

Return the values of a single column as an in-memory array, honoring the
current effective table (base or derived-column VIEW), the requested
scope, and optional pagination.

Values are returned in stable `__rowid__` order for `scope: 'all'` and
`scope: 'filtered'`. For `scope: 'selected'` the values are returned in
positional order within the current filter/sort view (same semantics as
the export "selected rows" scope) — not strict selection insertion order.

Numeric columns materialize into the narrowest sensible typed array:
- DuckDB `BIGINT` / `UBIGINT` / `HUGEINT` / `UHUGEINT` → `BigInt64Array`
- other integer types → `Int32Array`
- `FLOAT` / `DOUBLE` / `DECIMAL` → `Float64Array`
- all other types → `unknown[]`

If any returned row carries a `NULL` value, the function falls back to
`unknown[]` regardless of declared type so that `null` is preserved (the
typed-array packed form would coerce `null` to `0`, which is ambiguous).
It falls back the same way when an integer does not fit the typed array:
a `UINTEGER` past 2^31−1, or a `UBIGINT`, `HUGEINT` or `UHUGEINT` beyond
the 64-bit range. In that `unknown[]`, an integer is a `number` when it
is exact (within ±(2^53−1)) and a `bigint` beyond, as inside nested
values.

Every value is exact:
- Integers keep every digit. `BIGINT`, `UBIGINT`, `HUGEINT` and
  `UHUGEINT` columns are read as DuckDB's text and parsed as bigints
  (Arrow's numbers for them are rounded past 2^53, or wrong).
- A `DECIMAL` is the double nearest its value.
- A nested column (`type: 'nested'`: LIST, ARRAY, STRUCT, MAP, UNION,
  VARIANT) is read as exact JSON text and returned as
  [getCellValue](#getcellvalue) returns a value: lists and arrays as arrays,
  structs as objects (an unnamed struct as an array), a MAP as a `Map`
  with typed keys in order, a UNION as `{ [tag]: value }`; integers
  inside as numbers when exact and bigints beyond, DECIMAL, FLOAT and
  DOUBLE as numbers (`NaN`, `±Infinity` and `-0` kept), and dates,
  times, UUIDs, INTERVALs, BLOBs, ENUMs and BITs as DuckDB's text.
- `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY` and `TIME WITH TIME
  ZONE` values are DuckDB's text: `'1 year 2 months 3 days'`,
  `'POINT (1 2)'`, `'03:04:05+02'`. Arrow returns them as bytes, numbers
  or `null` that do not hold them.
- Other values come as the DuckDB worker returns them: text for
  `VARCHAR`, `UUID` and `JSON`, a `Uint8Array` for a `BLOB`, epoch
  milliseconds for `DATE` and `TIMESTAMP`, microseconds since midnight
  for `TIME`.

The reserved `__rowid__` column is retrievable by name; the loaders
always cast its synthesized `row_number()` to `BIGINT` (the conditional
INTEGER/BIGINT cast described in the original spec was never wired up;
the always-BIGINT shape is kept for simplicity and consistency across
loaders). Values come back as `BigInt64Array`. For plain-number
consumption, coerce with `Number(bigint)` (lossless for rowids below
`Number.MAX_SAFE_INTEGER`).

#### Parameters

##### name

`string`

##### opts?

[`GetColumnValuesOptions`](../../index/interfaces/GetColumnValuesOptions.md) = `{}`

#### Returns

`Promise`\<`unknown`[] \| `Int32Array`\<`ArrayBufferLike`\> \| `Float64Array`\<`ArrayBufferLike`\> \| `BigInt64Array`\<`ArrayBufferLike`\>\>

#### Examples

```ts
const rowIds = await table.actions.getColumnValues('__rowid__');
// rowIds is BigInt64Array. Convert a single value: Number(rowIds[0]).
```

```ts
await table.actions.addFilter({ type: 'range', column: 'age', min: 18 });
const adultAges = await table.actions.getColumnValues('age', { scope: 'filtered' });
```

```ts
// A DECIMAL(10,2)[] column: exact numbers, NULL rows as null.
const prices = await table.actions.getColumnValues('prices', { limit: 3 });
// [[1.25, 2.5, 3.75], null, []]
```

#### Throws

`QueryError` with `code: 'COLUMN_NOT_FOUND'` when `name` is not
  in the current schema.

#### Throws

`QueryError` with `code: 'INVALID_PAGINATION'` when `limit` or
  `offset` is present but not a non-negative integer.

#### Throws

`QueryError` with `code: 'INVALID_ROWID'` when `scope: 'selected'`
  and any rowId in `state.selectedRows` is not a non-negative integer.

#### Throws

`QueryError` with `code: 'NO_TABLE'` when called before any data
  is loaded.

***

### getCompletionContext()

> **getCompletionContext**(): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [core/Actions.ts:2842](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2842)

Get completion context for expression editor autocompletion.

#### Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

***

### getFiltersSQL()

> **getFiltersSQL**(): `string`

Defined in: [core/Actions.ts:1337](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1337)

Get the complete WHERE clause SQL for all active filters.
Convenience method for downstream apps that need the raw SQL string.

#### Returns

`string`

***

### getRawSQLFilters()

> **getRawSQLFilters**(): [`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

Defined in: [core/Actions.ts:1297](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1297)

Get all active raw SQL filters. Convenience getter.

#### Returns

[`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

***

### getUndoManager()

> **getUndoManager**(): [`UndoManager`](UndoManager.md) \| `undefined`

Defined in: [core/Actions.ts:774](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L774)

Get the UndoManager instance, if one was provided

#### Returns

[`UndoManager`](UndoManager.md) \| `undefined`

***

### hideColumn()

> **hideColumn**(`column`): `void`

Defined in: [core/Actions.ts:1422](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1422)

Hide a column, recording its neighbors for intelligent restore

#### Parameters

##### column

`string`

#### Returns

`void`

***

### loadData()

> **loadData**(`source`, `options?`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:874](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L874)

Load data from a file or URL

All metadata (row count, schema) is retrieved in the worker to avoid
blocking the main thread with sequential queries.

Starts once the derived-column change running now, if any, has ended. A
change, undo, redo or reset asked for before the call does not apply:
it is for the data this replaces. An undo, redo or reset asked for while
the load is under way resolves `false`.

#### Parameters

##### source

`string` \| `File` \| `Blob` \| `ArrayBuffer`

File, Blob, URL string, or raw data (ArrayBuffer for Parquet; string for CSV/JSON)

##### options?

[`LoadDataOptions`](../interfaces/LoadDataOptions.md) = `{}`

Loading options (tableName, format)

#### Returns

`Promise`\<`void`\>

***

### loadFilterPreset()

> **loadFilterPreset**(`filters`, `sortColumns?`): `void`

Defined in: [core/Actions.ts:1196](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1196)

Load a filter preset: replace all filters (and optionally sort) in one
undo step. Uses suppressUndoCapture + batch() so Ctrl+Z restores the
entire pre-load state atomically.

Columns the preset does not carry forward have lost their filter, so they
are notified — outside the suppression window, since the callback may
legitimately want to record an undo entry of its own.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

##### sortColumns?

[`SortColumn`](../../index/interfaces/SortColumn.md)[]

#### Returns

`void`

***

### redo()

> **redo**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:616](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L616)

Redo the last undone action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.
Runs in its turn, as [undo](#undo) does.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### removeDerivedColumn()

> **removeDerivedColumn**(`name`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:2460](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2460)

Remove a derived column.
Cleans up filters, sorts, pins, then delegates to manager.

Runs in its turn, as [addDerivedColumn](#addderivedcolumn) does. Rejects with
`NOT_FOUND` when new data is loaded before the removal has landed.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### removeFilter()

> **removeFilter**(`column`, `type?`): `void`

Defined in: [core/Actions.ts:1156](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1156)

Remove filter(s) for a column

Idempotent: asking to remove a filter that is not there changes nothing,
pushes no undo entry, and notifies no subscriber. That matters beyond
tidiness — a chart clearing its brush routes back through here while the
removal that cleared it is still unwinding, and without the guard every
chip click would cost a second filter cycle and leave a dead undo step.

#### Parameters

##### column

`string`

Column name

##### type?

`"null"` \| `"range"` \| `"point"` \| `"set"` \| `"not-set"` \| `"not-null"` \| `"pattern"` \| `"raw-sql"`

Optional filter type to remove (if not specified, removes all filters for column)

#### Returns

`void`

***

### removeRawSQLFilter()

> **removeRawSQLFilter**(`id`): `void`

Defined in: [core/Actions.ts:1288](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1288)

Remove a raw SQL filter by id.
Captures undo snapshot before mutation.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### replaceDerivedColumn()

> **replaceDerivedColumn**(`name`, `newDef`): `Promise`\<\{ `info`: [`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md); `success`: `true`; \} \| \{ `error`: [`DerivedColumnError`](../../index/classes/DerivedColumnError.md); `success`: `false`; \}\>

Defined in: [core/Actions.ts:2341](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2341)

Replace a derived column at the same name with a new definition.

Same-name-only — does not support renaming (use [updateDerivedColumn](#updatederivedcolumn)
for that). Pre-flights every dependent column against the proposed new def
before touching DuckDB. On dependent incompatibility returns a structured
`DerivedColumnError` with `code: 'DEPENDENTS_INCOMPATIBLE'` whose
`details.dependentsAffected` names each dependent that would break and
`details.reasons` maps each dependent name to the DuckDB error. The
replacement is atomic: if any pre-flight check or the final VIEW recreate
fails, the column reverts to its prior definition.

#### Parameters

##### name

`string`

##### newDef

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<\{ `info`: [`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md); `success`: `true`; \} \| \{ `error`: [`DerivedColumnError`](../../index/classes/DerivedColumnError.md); `success`: `false`; \}\>

#### Example

```ts
const result = await table.actions.replaceDerivedColumn('tip_pct', {
  kind: 'expression',
  name: 'tip_pct',
  expression: 'CAST(tip_amount AS VARCHAR)', // breaks numeric dependents
});
if (!result.success && result.error.code === 'DEPENDENTS_INCOMPATIBLE') {
  const { dependentsAffected, reasons } = result.error.details!;
  console.log('affected:', dependentsAffected, 'reasons:', reasons);
}
```

***

### resetColumnWidth()

> **resetColumnWidth**(`column`): `void`

Defined in: [core/Actions.ts:1705](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1705)

Reset column width to default

#### Parameters

##### column

`string`

#### Returns

`void`

***

### resetToInitial()

> **resetToInitial**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:790](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L790)

Reset to the original state captured at data-load time.
Clears all filters, sorts, column customizations, derived columns,
and the undo/redo stacks. Returns true if state was restored.

Runs in its turn, after the derived-column changes asked for before it
(see [undo](#undo)). Resolves `false`, restoring nothing, while a load is
under way, and when new data is loaded before it has run.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### selectAll()

> **selectAll**(): `void`

Defined in: [core/Actions.ts:2928](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2928)

Select all rows

#### Returns

`void`

***

### selectRow()

> **selectRow**(`index`, `mode?`): `void`

Defined in: [core/Actions.ts:2869](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2869)

Select a row

#### Parameters

##### index

`number`

Row index to select

##### mode?

`"range"` \| `"replace"` \| `"toggle"`

Selection mode:
  - 'replace': Replace selection with this row (default, normal click)
  - 'toggle': Toggle this row in selection (Ctrl+click)
  - 'range': Select range from last selected to this row (Shift+click)

#### Returns

`void`

***

### setColumnHeaderTooltip()

> **setColumnHeaderTooltip**(`column`, `content`): `void`

Defined in: [core/Actions.ts:1753](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1753)

Set or clear an app-controlled tooltip rendered as a styled popover on
the column-header name span.

`content` may be:
- A `ColumnHeaderTooltipContent` object with optional `title`,
  `description`, and `items[]` (label/value rows; value can be a string
  or a string array for chip-style enums).
- A plain string, treated as a description-only shorthand
  (`{ description: string }`).
- `null` (or any input that normalizes to empty) to clear the override.

Every text field is rendered via `.textContent` — HTML is NOT supported
by design, eliminating the XSS surface. Malformed items (missing label,
non-string non-array value) are silently dropped.

Does not participate in undo/redo (app-authored metadata, same as
`setColumnWidth`). Persists in the session snapshot alongside
`columnWidths`. Setting an unknown column name is silently accepted;
the override takes visible effect once a header for that column renders.

#### Parameters

##### column

`string`

##### content

`string` \| [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

#### Returns

`void`

#### Example

```ts
// Plain string shorthand — renders as description-only.
table.actions.setColumnHeaderTooltip('age', 'Age in completed years');

// Structured content with title, description, and items.
table.actions.setColumnHeaderTooltip('payment_type', {
  title: 'Payment method',
  description: 'How the rider paid for the trip.',
  items: [
    { label: 'Allowed values', value: ['Credit card', 'Cash', 'No charge'] },
    { label: 'Source', value: 'TLC schema v1.0' },
  ],
});

// Clear.
table.actions.setColumnHeaderTooltip('age', null);
```

***

### setColumnOrder()

> **setColumnOrder**(`columns`): `void`

Defined in: [core/Actions.ts:1605](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1605)

Set the column order

Also reorders visible columns to match the new order, in the same
update. Preserves hidden columns in columnOrder at their relative
positions. Pinned columns stay first, in the order given: an order that
puts one after an unpinned column has it moved to the pinned block, and
`pinnedColumns` takes the block's new order, so a pinned column hidden
and shown again goes back to its place in it. A name given twice counts
once, at its first place: the table has one header and one place for
it.

#### Parameters

##### columns

`string`[]

#### Returns

`void`

***

### setColumnWidth()

> **setColumnWidth**(`column`, `width`): `void`

Defined in: [core/Actions.ts:1695](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1695)

Set column width

#### Parameters

##### column

`string`

##### width

`number`

#### Returns

`void`

***

### setFocusedCell()

> **setFocusedCell**(`cell`): `void`

Defined in: [core/Actions.ts:2965](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2965)

Set focused cell for keyboard navigation. Not undoable.

#### Parameters

##### cell

\{ `column`: `string`; `row`: `number`; \} \| `null`

#### Returns

`void`

***

### setHoveredColumn()

> **setHoveredColumn**(`column`): `void`

Defined in: [core/Actions.ts:2953](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2953)

Set hovered column

#### Parameters

##### column

`string` \| `null`

#### Returns

`void`

***

### setHoveredRow()

> **setHoveredRow**(`index`): `void`

Defined in: [core/Actions.ts:2945](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2945)

Set hovered row

#### Parameters

##### index

`number` \| `null`

#### Returns

`void`

***

### setOnDerivedChange()

> **setOnDerivedChange**(`callback`): `void`

Defined in: [core/Actions.ts:544](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L544)

Register a callback fired for each derived-column lifecycle event
(add / remove / update / replace). Used by the DataTable facade to
emit the `derivedChange` event with the right `kind` discriminator.

#### Parameters

##### callback

(`payload`) => `void`

#### Returns

`void`

***

### setOnFilterRemove()

> **setOnFilterRemove**(`callback`): `void`

Defined in: [core/Actions.ts:534](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L534)

Set a callback invoked once for each column that loses its filter.
Use this to clear state that tracks a filter but does not live in the
signals — a chart's brush or bar selection, most obviously.

There is one slot, and a table made by `createDataTable` fills it to
clear its charts' brushes and selections. Calling this on
`table.actions` replaces that handler, so a brush can outlive its
filter. To react to removed filters from a host app, listen to the
`filterChange` event instead.

Fires for every path that can drop a filter: [StateActions.removeFilter](#removefilter)
(and so the filter chips, the filter panel, and a chart clearing its own
selection), [StateActions.clearFilters](#clearfilters),
[StateActions.loadFilterPreset](#loadfilterpreset) when the preset does not carry a
column forward, [StateActions.undo](#undo) / [StateActions.redo](#redo),
[StateActions.resetToInitial](#resettoinitial), and the derived-column paths that
retype or delete a filtered column.

It does *not* fire when a filter is merely replaced —
[StateActions.addFilter](#addfilter) over an existing column, or a preset that
gives that column a different filter. The column still has a filter, so
state keyed to it is still live.

Called synchronously, after the signals have settled: reading
`state.filters` from inside the callback shows the post-removal list.
Removing a filter from inside the callback is safe — removals are
idempotent, so a callback that ends up asking for the same removal again
(a chart clearing its brush routes back through `removeFilter`) is a
no-op rather than a second undo entry and a second filter cycle.

#### Parameters

##### callback

(`column`) => `void`

#### Returns

`void`

***

### setSort()

> **setSort**(`columns`): `void`

Defined in: [core/Actions.ts:1348](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1348)

Set sort columns directly

#### Parameters

##### columns

[`SortColumn`](../../index/interfaces/SortColumn.md)[]

#### Returns

`void`

***

### showAllColumns()

> **showAllColumns**(): `void`

Defined in: [core/Actions.ts:1508](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1508)

Show all hidden columns, restoring them in columnOrder

#### Returns

`void`

***

### showColumn()

> **showColumn**(`column`): `void`

Defined in: [core/Actions.ts:1450](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1450)

Show a hidden column using neighbor-aware restore logic

#### Parameters

##### column

`string`

#### Returns

`void`

***

### toggleColumnPin()

> **toggleColumnPin**(`column`): `void`

Defined in: [core/Actions.ts:1638](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1638)

Toggle column pin status

When pinning, moves the column to the end of the pinned group (leftmost columns).
When unpinning, moves the column to the first unpinned position.
Also updates columnOrder and visibleColumns to reflect the new position.

#### Parameters

##### column

`string`

#### Returns

`void`

***

### toggleSort()

> **toggleSort**(`column`): `void`

Defined in: [core/Actions.ts:1359](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1359)

Toggle sort for a single column (cycles: none → asc → desc → none)

Replaces any existing sort with the new column.

#### Parameters

##### column

`string`

#### Returns

`void`

***

### undo()

> **undo**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:604](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L604)

Undo the last undoable action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.

Runs in its turn, after every derived-column change asked for before it
has landed and pushed its undo entry: an undo pressed while an add runs
undoes the add. Resolves `false`, restoring nothing, while another undo
or redo waits or runs, while a load is under way (it would undo the
session the load restores), and when new data is loaded before its turn.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### updateDerivedColumn()

> **updateDerivedColumn**(`oldName`, `def`): `Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:2157](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2157)

Update a derived column's expression, name, or values.
Handles rename (updates all state references) and type change (removes stale filters).

A new name is checked as [addDerivedColumn](#addderivedcolumn) checks one, against
the other columns: a rename that only changes the case of the column's
own name (`total` to `Total`) is allowed.

Runs in its turn, as [addDerivedColumn](#addderivedcolumn) does: a rename to a name an
add ahead of it takes gets `already exists`.

#### Parameters

##### oldName

`string`

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

***

### updateRawSQLFilter()

> **updateRawSQLFilter**(`id`, `sql`, `label?`): `void`

Defined in: [core/Actions.ts:1261](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1261)

Update an existing raw SQL filter's SQL and/or label.
Does NOT re-validate. Finds by id, replaces in state.filters.
Captures undo snapshot before mutation. No-op if filter not found.

#### Parameters

##### id

`string`

##### sql

`string`

##### label?

`string`

#### Returns

`void`

***

### validateExpression()

> **validateExpression**(`expression`): `Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>

Defined in: [core/Actions.ts:2826](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L2826)

Validate an expression without adding it. For UI preview.

#### Parameters

##### expression

`string`

#### Returns

`Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### validateSQLFilter()

> **validateSQLFilter**(`sql`, `signal?`): `Promise`\<\{ `error?`: `string`; `matchCount?`: `number`; `valid`: `boolean`; \}\>

Defined in: [core/Actions.ts:1306](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/core/Actions.ts#L1306)

Validate a SQL WHERE clause fragment. Runs the SQL against DuckDB
and returns validity, match count, and any error message.
Used by the SQL filter modal's Validate button (Task 8.9).

#### Parameters

##### sql

`string`

##### signal?

`AbortSignal`

#### Returns

`Promise`\<\{ `error?`: `string`; `matchCount?`: `number`; `valid`: `boolean`; \}\>
