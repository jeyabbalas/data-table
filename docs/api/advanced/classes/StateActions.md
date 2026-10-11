[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StateActions

# Class: StateActions

Defined in: [core/Actions.ts:261](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L261)

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

Defined in: [core/Actions.ts:320](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L320)

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

Defined in: [core/Actions.ts:2267](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2267)

Add a derived column (expression or vector), last in the column order.
Validates name uniqueness, creates VIEW, updates state.

Names are compared as DuckDB compares them, ignoring the case of ASCII
letters: `LABEL` beside a column `label` gets `already exists`, since
DuckDB would read `label`'s values for it. `__rowid__` is reserved, in
any case.

An expression must give one value for each row. One that returns
several rows for a row, or none, such as `unnest(tags)`, is refused, and
so is an aggregate without a window, such as `sum(price)` (write
`sum(price) OVER ()`): each with a message that says what to write
instead. A failed add changes nothing.

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

Defined in: [core/Actions.ts:1312](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1312)

Add or update a filter

If a filter for the same column exists, it will be replaced. An
annotated filter is made to keep the annotated rows of this table (its
`table` is set to the base table's name), and replaces the annotated
filter in force: see [StateActions.showAnnotatedRows](#showannotatedrows).

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md)

#### Returns

`void`

***

### addNestedFieldColumn()

> **addNestedFieldColumn**(`column`, `path`, `options?`): `Promise`\<\{ `error?`: `string`; `name?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:2439](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2439)

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

Defined in: [core/Actions.ts:1568](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1568)

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

Defined in: [core/Actions.ts:1722](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1722)

Add column to multi-sort (Cmd/Ctrl+click on a sort button, Shift+Enter on a header)

If column is already in sort, toggles its direction or removes it.

#### Parameters

##### column

`string`

#### Returns

`void`

***

### beginColumnLayoutChange()

> **beginColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:841](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L841)

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

Defined in: [core/Actions.ts:896](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L896)

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

Defined in: [core/Actions.ts:878](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L878)

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

Defined in: [core/Actions.ts:1361](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1361)

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

Defined in: [core/Actions.ts:3419](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3419)

Clear focused cell.

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [core/Actions.ts:3348](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3348)

Clear all row selection, and forget the row a `'range'` selection runs
from.

#### Returns

`void`

***

### clearSort()

> **clearSort**(): `void`

Defined in: [core/Actions.ts:1749](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1749)

Clear all sorting

#### Returns

`void`

***

### endColumnLayoutChange()

> **endColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:859](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L859)

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

Defined in: [core/Actions.ts:907](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L907)

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

Defined in: [core/Actions.ts:3201](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3201)

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
epoch milliseconds for `DATE` and `TIMESTAMP`, `Infinity` and
`-Infinity` for DuckDB's `infinity` and `-infinity`; DuckDB's text for `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY`,
`TIME WITH TIME ZONE` and `TIME_NS`; a `JSON` column's text; a
`Uint8Array` for a `BLOB`. SQL NULL, at the top or anywhere inside, is
`null`.

One query by `__rowid__`. It skips the query cache and runs ahead of
queued chart and stats queries, though not of the grid's row fetches
(`priority: 'elevated'`): a loop of reads leaves scrolling alone.

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
  in the current schema, which is empty until data is loaded.

#### Throws

`QueryError` with `code: 'INVALID_ROWID'` and `details: { rowId }`
  when `rowId` is not a non-negative integer (a safe integer, or a bigint
  within the BIGINT range), or when no row has it.

#### Throws

`QueryError` with `code: 'NO_TABLE'` when no table is loaded
  while the schema still names the column, which a table built by
  `createDataTable` never leaves.

#### Throws

`QueryError` with `code: 'QUERY_ABORTED'` when `options.signal`
  aborts the read.

#### Throws

`DestroyedError` if the table was destroyed before or during the
  call.

***

### getColumnHeaderTooltip()

> **getColumnHeaderTooltip**(`column`): [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

Defined in: [core/Actions.ts:2113](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2113)

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

Defined in: [core/Actions.ts:3002](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3002)

Return the values of a single column as an in-memory array, honoring the
current effective table (base or derived-column VIEW), the requested
scope, and optional pagination.

Values are returned in stable `__rowid__` order for `scope: 'all'` and
`scope: 'filtered'`. For `scope: 'selected'` the values are returned in
positional order within the current filter/sort view (same semantics as
the export "selected rows" scope) — not strict selection insertion order.
With an annotated filter in force ([StateActions.showAnnotatedRows](#showannotatedrows)),
a `'filtered'` read keeps the rows the annotations in the store single
out, even in the moment before the view catches up with a change to
them. A `'selected'` read takes the rows at the selected positions in
the view as it shows them, which that catching up could change.

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
- `INTERVAL`, `ENUM`, `BIT`, `BIGNUM`, `GEOMETRY`, `TIME WITH TIME
  ZONE` and `TIME_NS` values are DuckDB's text: `'1 year 2 months 3
  days'`, `'POINT (1 2)'`, `'03:04:05+02'`, `'03:04:05.123456789'`.
  Arrow returns them as bytes, numbers or `null` that do not hold them.
- Other values come as the DuckDB worker returns them: text for
  `VARCHAR`, `UUID` and `JSON`, a `Uint8Array` for a `BLOB`, epoch
  milliseconds for `DATE` and `TIMESTAMP` (DuckDB's `infinity` and
  `-infinity` as `Infinity` and `-Infinity`; past ±2^53 ms, after year
  287396 or before 283458 BC, the nearest number), microseconds since
  midnight for `TIME`.

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
  in the current schema, which is empty until data is loaded.

#### Throws

`QueryError` with `code: 'INVALID_PAGINATION'` when `limit` or
  `offset` is present but not a non-negative integer.

#### Throws

`QueryError` with `code: 'INVALID_ROWID'` when `scope: 'selected'`
  and any rowId in `state.selectedRows` is not a non-negative integer.

#### Throws

`QueryError` with `code: 'NO_TABLE'` when no table is loaded
  while the schema still names the column, which a table built by
  `createDataTable` never leaves.

***

### getCompletionContext()

> **getCompletionContext**(): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [core/Actions.ts:3265](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3265)

Get completion context for expression editor autocompletion.

#### Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

***

### getFiltersSQL()

> **getFiltersSQL**(): `string`

Defined in: [core/Actions.ts:1677](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1677)

Get the complete WHERE clause SQL for all active filters.
Convenience method for downstream apps that need the raw SQL string.

An annotated filter's SQL ([StateActions.showAnnotatedRows](#showannotatedrows))
reads an internal temporary table of the annotated rows, which the
table keeps current lazily: it can trail the annotations in the store
by a moment, does not exist until the table first needs it, and lives
only on the table's own DuckDB connection. Run elsewhere, or before
then, the clause fails or keeps the rows of annotations since changed.

#### Returns

`string`

***

### getRawSQLFilters()

> **getRawSQLFilters**(): [`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

Defined in: [core/Actions.ts:1630](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1630)

Get all active raw SQL filters. Convenience getter.

#### Returns

[`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

***

### getUndoManager()

> **getUndoManager**(): [`UndoManager`](UndoManager.md) \| `undefined`

Defined in: [core/Actions.ts:912](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L912)

Get the UndoManager instance, if one was provided

#### Returns

[`UndoManager`](UndoManager.md) \| `undefined`

***

### hideAnnotatedRows()

> **hideAnnotatedRows**(): `void`

Defined in: [core/Actions.ts:1498](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1498)

Stop showing only the annotated rows: remove the annotated filter that
[StateActions.showAnnotatedRows](#showannotatedrows) added, as one undo entry. With
none in force, it changes nothing.

#### Returns

`void`

#### Example

```ts
table.actions.showAnnotatedRows();
// …
table.actions.hideAnnotatedRows();
```

#### Throws

`DestroyedError` if the table was destroyed.

***

### hideColumn()

> **hideColumn**(`column`): `void`

Defined in: [core/Actions.ts:1762](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1762)

Hide a column, recording its neighbors for intelligent restore

#### Parameters

##### column

`string`

#### Returns

`void`

***

### loadData()

> **loadData**(`source`, `options?`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:1015](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1015)

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

Defined in: [core/Actions.ts:1393](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1393)

Load a filter preset: replace all filters (and optionally sort) in one
undo step. Uses suppressUndoCapture + batch() so Ctrl+Z restores the
entire pre-load state atomically.

The filters get the `valueType` they need on this table, as a session
restore gives them (`normalizeRestoredFilters`). A point, set or not-set
filter on a JSON column without one is given `valueType: 'text'`:
compared as JSON, text that is not JSON would fail every query, and a
preset saved before 0.9, or imported, may hold such a filter. A range
filter on a TIME WITH TIME ZONE column whose bounds have no offset is
given `valueType: 'time'`, so that it compares the time of day its
column's chart shows rather than the instant; and a range filter's
`valueType: 'time'` on a column that is not TIME or TIME WITH TIME ZONE,
where the cast would fail every query, goes. An annotated filter keeps
the annotated rows of this table, whichever table it was saved on.

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

### nextAnnotation()

> **nextAnnotation**(`options?`): `Promise`\<[`AnnotationNavigationResult`](../../index/interfaces/AnnotationNavigationResult.md) \| `null`\>

Defined in: [core/Actions.ts:3484](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3484)

Move the cursor to the next annotation in the view, as filtered and
sorted, and scroll it into view: the next annotated cell of the
cursor's row, then the next row with row or cell annotations, on its
first annotated visible cell (pinned columns first). A row whose
annotations are its own, or in hidden columns, keeps the cursor's
column. Column annotations single out no rows, and are not visited.
Without a cursor, it goes to the first annotation. The live region
says where it landed and what is there, as `F8` does.

One navigation runs at a time: a newer call, a move of the cursor, or a
change of the filters, the sort or the table aborts it. It waits for a
filter change still counting its rows, and, under an annotated filter
([StateActions.showAnnotatedRows](#showannotatedrows)), for the view to catch up with
the annotations: right after the issue under the cursor is resolved, it
goes to the row that slid into its place. Far from the cursor in a large
sorted view, finding the row is a DuckDB query, some hundreds of
milliseconds on ten million rows.

#### Parameters

##### options?

[`AnnotationNavigationOptions`](../../index/interfaces/AnnotationNavigationOptions.md)

Which severities to visit (default: those the severity
  filter shows), whether to go round the end (default: `true`), and an
  `AbortSignal`.

#### Returns

`Promise`\<[`AnnotationNavigationResult`](../../index/interfaces/AnnotationNavigationResult.md) \| `null`\>

where the cursor went, with the annotations there; `null` when
  no annotation of those severities is in the view (or, with
  `wrap: false`, past the cursor).

#### Examples

```ts
const landed = await table.actions.nextAnnotation();
if (landed) console.log(landed.row, landed.column, landed.annotations[0]?.message);
```

```ts
// Errors only, stopping at the last one.
await table.actions.nextAnnotation({ severities: ['error'], wrap: false });
```

#### Throws

`QueryError` with `code: 'QUERY_ABORTED'` when a newer
  navigation, a cursor move, a view change or `options.signal` aborts
  it; `code: 'NO_TABLE'` when no table is loaded, or the table has no UI.

#### Throws

`ConfigurationError` with `code: 'OPTIONS_INVALID'` for a
  severity that is not `'error'`, `'warning'` or `'info'`, or a `wrap`
  that is not a boolean.

#### Throws

`DestroyedError` if the table was destroyed before the call.

***

### previousAnnotation()

> **previousAnnotation**(`options?`): `Promise`\<[`AnnotationNavigationResult`](../../index/interfaces/AnnotationNavigationResult.md) \| `null`\>

Defined in: [core/Actions.ts:3502](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3502)

Move the cursor to the previous annotation in the view: the previous
annotated cell of the cursor's row, then the previous row with row or
cell annotations, on its last annotated visible cell. Without a cursor,
it goes to the last annotation. Otherwise as [nextAnnotation](#nextannotation),
which `Shift+F8` is to `F8`.

#### Parameters

##### options?

[`AnnotationNavigationOptions`](../../index/interfaces/AnnotationNavigationOptions.md)

#### Returns

`Promise`\<[`AnnotationNavigationResult`](../../index/interfaces/AnnotationNavigationResult.md) \| `null`\>

#### Example

```ts
const landed = await table.actions.previousAnnotation({ severities: ['error', 'warning'] });
```

#### Throws

As [nextAnnotation](#nextannotation).

***

### redo()

> **redo**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:750](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L750)

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

Defined in: [core/Actions.ts:2841](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2841)

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

Defined in: [core/Actions.ts:1341](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1341)

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

`"null"` \| `"range"` \| `"point"` \| `"set"` \| `"not-set"` \| `"not-null"` \| `"pattern"` \| `"raw-sql"` \| `"annotated"`

Optional filter type to remove (if not specified, removes all filters for column)

#### Returns

`void`

***

### removeRawSQLFilter()

> **removeRawSQLFilter**(`id`): `void`

Defined in: [core/Actions.ts:1621](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1621)

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

Defined in: [core/Actions.ts:2722](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2722)

Replace a derived column at the same name with a new definition.

Same-name-only — does not support renaming (use [updateDerivedColumn](#updatederivedcolumn)
for that). Pre-flights every dependent column against the proposed new def
before touching DuckDB. On dependent incompatibility returns a structured
`DerivedColumnError` with `code: 'DEPENDENTS_INCOMPATIBLE'` whose
`details.dependentsAffected` names each dependent that would break and
`details.reasons` maps each dependent name to the DuckDB error. The
replacement is atomic: if any pre-flight check or the final VIEW recreate
fails, the column reverts to its prior definition.

The new expression is checked as [addDerivedColumn](#addderivedcolumn) checks one,
and the filters on the column are dropped as [updateDerivedColumn](#updatederivedcolumn)
drops them, when its DuckDB type changes.

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

Defined in: [core/Actions.ts:2045](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2045)

Reset column width to default

#### Parameters

##### column

`string`

#### Returns

`void`

***

### resetToInitial()

> **resetToInitial**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:931](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L931)

Reset to the state the table had once its data loaded. Without a saved
session that is no filters, no sort, and the columns as loaded; after a
session restore, it is the restored session's filters, sort and column
layout. Either way it removes every derived column, the restored ones
too, with the filters, sort and layout entries that name them, and
clears the undo/redo stacks. Returns true if state was restored.

Runs in its turn, after the derived-column changes asked for before it
(see [undo](#undo)). Resolves `false`, restoring nothing, while a load is
under way, and when new data is loaded before it has run.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### revealRow()

> **revealRow**(`rowId`, `column?`, `options?`): `Promise`\<[`RevealRowResult`](../../index/interfaces/RevealRowResult.md) \| `null`\>

Defined in: [core/Actions.ts:3544](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3544)

Scroll the row whose `__rowid__` is `rowId` into view in the view as
filtered and sorted, and, with `focus` (the default), put the cursor on
it: in `column`, else the cursor's column, else the first visible one,
which comes into view too. For a list of issues that takes the user to
each, where `rowId` is the annotation's or a value of `__rowid__`.

It waits for a filter change still counting its rows, and runs as one
navigation (see [nextAnnotation](#nextannotation)): a newer one, a cursor move or
a view change aborts it.

#### Parameters

##### rowId

`number` \| `bigint`

A non-negative integer, as a number or a bigint.

##### column?

`string`

A column of the table; a hidden one leaves the cursor's.

##### options?

[`RevealRowOptions`](../../index/interfaces/RevealRowOptions.md)

Where the row goes in the view (`align`, default
  `'center'`), whether the cursor moves (`focus`, default `true`), and
  an `AbortSignal`.

#### Returns

`Promise`\<[`RevealRowResult`](../../index/interfaces/RevealRowResult.md) \| `null`\>

the row's position and the column shown; `null` when the
  filters hide the row.

#### Examples

```ts
// From an issue list: the cell a cell annotation is on.
const shown = await table.actions.revealRow(issue.rowId, issue.column);
if (shown === null) console.log('The filters hide that row');
```

```ts
// Scroll a row to the top, leaving the cursor where it is.
await table.actions.revealRow(42n, undefined, { align: 'start', focus: false });
```

#### Throws

`QueryError` with `code: 'INVALID_ROWID'` when `rowId` is not a
  non-negative integer, or no row has it; `code: 'COLUMN_NOT_FOUND'`
  when `column` is not in the schema; `code: 'NO_TABLE'` when no table
  is loaded; `code: 'QUERY_ABORTED'` when it is aborted.

#### Throws

`ConfigurationError` with `code: 'OPTIONS_INVALID'` for an
  `align` or `focus` it does not take.

#### Throws

`DestroyedError` if the table was destroyed before the call.

***

### selectAll()

> **selectAll**(): `void`

Defined in: [core/Actions.ts:3374](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3374)

Select the rows of the current view: positions `0 … n−1`, where `n` is
`state.filteredRows` while a filter is active and `state.totalRows`
otherwise.

`filteredRows` is a `COUNT(*)` that DuckDB runs after each filter
change, so call this once `filterChange` has fired for the latest one:
called in the same tick as `addFilter`, it selects as many rows as the
filters before matched. Outside `createDataTable()`, `filteredRows`
follows the filters only while a `CrossfilterCoordinator` watches the
state. The selection holds positions, which a later filter or sort
change does not adjust. The row a `'range'` selection runs from is kept.

#### Returns

`void`

#### Example

```ts
const off = table.on('filterChange', () => {
  off();
  table.actions.selectAll();
});
table.actions.addFilter({ type: 'set', column: 'country', values: ['US', 'CA'] });
```

***

### selectRow()

> **selectRow**(`index`, `mode?`): `void`

Defined in: [core/Actions.ts:3293](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3293)

Select a row

#### Parameters

##### index

`number`

0-based position of the row in the filtered, sorted view

##### mode?

`"range"` \| `"replace"` \| `"toggle"`

Selection mode:
  - 'replace': Replace selection with this row (default, normal click)
  - 'toggle': Toggle this row in selection (Ctrl+click)
  - 'range': Select range from last selected to this row (Shift+click),
    or this row alone when there is none or it is past the end of the view

#### Returns

`void`

***

### setColumnHeaderTooltip()

> **setColumnHeaderTooltip**(`column`, `content`): `void`

Defined in: [core/Actions.ts:2093](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2093)

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

Defined in: [core/Actions.ts:1945](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1945)

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

Defined in: [core/Actions.ts:2035](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2035)

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

Defined in: [core/Actions.ts:3411](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3411)

Set focused cell for keyboard navigation. Not undoable.

#### Parameters

##### cell

\{ `column`: `string`; `row`: `number`; \} \| `null`

#### Returns

`void`

***

### setHoveredColumn()

> **setHoveredColumn**(`column`): `void`

Defined in: [core/Actions.ts:3399](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3399)

Set hovered column

#### Parameters

##### column

`string` \| `null`

#### Returns

`void`

***

### setHoveredRow()

> **setHoveredRow**(`index`): `void`

Defined in: [core/Actions.ts:3391](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3391)

Set hovered row

#### Parameters

##### index

`number` \| `null`

#### Returns

`void`

***

### setOnDerivedChange()

> **setOnDerivedChange**(`callback`): `void`

Defined in: [core/Actions.ts:678](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L678)

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

Defined in: [core/Actions.ts:668](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L668)

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

Defined in: [core/Actions.ts:1688](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1688)

Set sort columns directly

#### Parameters

##### columns

[`SortColumn`](../../index/interfaces/SortColumn.md)[]

#### Returns

`void`

***

### showAllColumns()

> **showAllColumns**(): `void`

Defined in: [core/Actions.ts:1848](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1848)

Show all hidden columns, restoring them in columnOrder

#### Returns

`void`

***

### showAnnotatedRows()

> **showAnnotatedRows**(`options?`): `void`

Defined in: [core/Actions.ts:1455](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1455)

Show only the rows that have annotations: the rows with a row-scope or a
cell-scope annotation in `table.annotations`, of the severities given,
or of any severity. Adds an annotated filter ([AnnotatedFilter](../../index/interfaces/AnnotatedFilter.md)),
which replaces the one in force, as one undo entry; asked for again with
the same severities, it changes nothing. Its chip reads "Annotated rows"
and "any severity", or the severities' names.

The view follows the annotations: adding or removing one while the
filter is on updates the view in place, keeping its scroll position and
the cursor on its row, and fires `filterChange` with the same filters
and the new count. When the cursor's row leaves the view, the cursor
stays where it was, on the row that slid into its place, which
[StateActions.nextAnnotation](#nextannotation) (`F8`) goes to next. A column-scope
annotation singles out no row. The severity filter
(`annotations.setSeverityFilter`) changes which tints show, not which
rows this shows.

Synchronous, like `addFilter`. The rows, the count and the charts follow
as they do for any filter change, once DuckDB holds the table's annotated
rows, which takes a fraction of a second at a million of them.

#### Parameters

##### options?

###### severities?

[`AnnotationSeverity`](../../index/type-aliases/AnnotationSeverity.md)[]

Show the rows with annotations of these
  severities. Left out or empty, the rows with annotations of any
  severity.

#### Returns

`void`

#### Examples

```ts
table.actions.showAnnotatedRows();
```

```ts
// Only the rows with an error or a warning, and how many there are
table.on('filterChange', ({ filteredRowCount }) => console.log(filteredRowCount));
table.actions.showAnnotatedRows({ severities: ['error', 'warning'] });
```

#### Throws

`ConfigurationError` with `code: 'OPTIONS_INVALID'` when
  `severities` is not a list of `'error'`, `'warning'` and `'info'`.

#### Throws

`DestroyedError` if the table was destroyed.

***

### showColumn()

> **showColumn**(`column`): `void`

Defined in: [core/Actions.ts:1790](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1790)

Show a hidden column using neighbor-aware restore logic

#### Parameters

##### column

`string`

#### Returns

`void`

***

### toggleColumnPin()

> **toggleColumnPin**(`column`): `void`

Defined in: [core/Actions.ts:1978](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1978)

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

Defined in: [core/Actions.ts:1699](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1699)

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

Defined in: [core/Actions.ts:738](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L738)

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

Defined in: [core/Actions.ts:2531](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L2531)

Update a derived column's expression, name, or values.
Handles rename (updates all state references) and type change (removes stale filters).

A new name is checked as [addDerivedColumn](#addderivedcolumn) checks one, against
the other columns: a rename that only changes the case of the column's
own name (`total` to `Total`) is allowed. A new expression is checked as
it checks one too. A failed update changes nothing.

The filters on the column are dropped when its DuckDB type changes
(`ColumnSchema.originalType`), since DuckDB casts their values to it: a
VARCHAR made JSON would read a filter's `'active'` as malformed JSON.
An integer of another width, or a DECIMAL of another precision or scale,
keeps them: DuckDB compares numbers with those by value.

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

Defined in: [core/Actions.ts:1594](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1594)

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

Defined in: [core/Actions.ts:3249](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L3249)

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

Defined in: [core/Actions.ts:1639](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/core/Actions.ts#L1639)

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
