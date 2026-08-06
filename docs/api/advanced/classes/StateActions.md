[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StateActions

# Class: StateActions

Defined in: [core/Actions.ts:107](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L107)

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

Defined in: [core/Actions.ts:128](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L128)

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

Defined in: [core/Actions.ts:1305](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1305)

Add a derived column (expression or vector).
Validates name uniqueness, creates VIEW, updates state.

#### Parameters

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

***

### addFilter()

> **addFilter**(`filter`): `void`

Defined in: [core/Actions.ts:614](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L614)

Add or update a filter

If a filter for the same column exists, it will be replaced.

#### Parameters

##### filter

[`Filter`](../../index/type-aliases/Filter.md)

#### Returns

`void`

***

### addRawSQLFilter()

> **addRawSQLFilter**(`sql`, `label?`): `string`

Defined in: [core/Actions.ts:698](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L698)

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

Defined in: [core/Actions.ts:845](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L845)

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

Defined in: [core/Actions.ts:368](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L368)

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

Defined in: [core/Actions.ts:423](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L423)

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

Defined in: [core/Actions.ts:405](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L405)

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

Defined in: [core/Actions.ts:649](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L649)

Clear all filters

#### Returns

`void`

***

### clearFocusedCell()

> **clearFocusedCell**(): `void`

Defined in: [core/Actions.ts:2019](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L2019)

Clear focused cell.

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [core/Actions.ts:1965](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1965)

Clear all row selection

#### Returns

`void`

***

### clearSort()

> **clearSort**(): `void`

Defined in: [core/Actions.ts:872](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L872)

Clear all sorting

#### Returns

`void`

***

### endColumnLayoutChange()

> **endColumnLayoutChange**(): `void`

Defined in: [core/Actions.ts:386](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L386)

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

Defined in: [core/Actions.ts:434](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L434)

End a column width drag sequence.
Pushes the pre-drag snapshot to the undo stack, unless the drag was a
no-op.

#### Returns

`void`

#### Throws

`DestroyedError` if the table was destroyed.

***

### getColumnHeaderTooltip()

> **getColumnHeaderTooltip**(`column`): [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

Defined in: [core/Actions.ts:1201](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1201)

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

Defined in: [core/Actions.ts:1782](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1782)

Return the values of a single column as an in-memory array, honoring the
current effective table (base or derived-column VIEW), the requested
scope, and optional pagination.

Values are returned in stable `__rowid__` order for `scope: 'all'` and
`scope: 'filtered'`. For `scope: 'selected'` the values are returned in
positional order within the current filter/sort view (same semantics as
the export "selected rows" scope) — not strict selection insertion order.

Numeric columns materialize into the narrowest sensible typed array:
- DuckDB `BIGINT` / `HUGEINT` → `BigInt64Array`
- other integer types → `Int32Array`
- `FLOAT` / `DOUBLE` / `DECIMAL` → `Float64Array`
- all other types → `unknown[]`

If any returned row carries a `NULL` value, the function falls back to
`unknown[]` regardless of declared type so that `null` is preserved (the
typed-array packed form would coerce `null` to `0`, which is ambiguous).

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

Defined in: [core/Actions.ts:1888](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1888)

Get completion context for expression editor autocompletion.

#### Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

***

### getFiltersSQL()

> **getFiltersSQL**(): `string`

Defined in: [core/Actions.ts:800](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L800)

Get the complete WHERE clause SQL for all active filters.
Convenience method for downstream apps that need the raw SQL string.

#### Returns

`string`

***

### getRawSQLFilters()

> **getRawSQLFilters**(): [`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

Defined in: [core/Actions.ts:760](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L760)

Get all active raw SQL filters. Convenience getter.

#### Returns

[`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

***

### getUndoManager()

> **getUndoManager**(): [`UndoManager`](UndoManager.md) \| `undefined`

Defined in: [core/Actions.ts:439](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L439)

Get the UndoManager instance, if one was provided

#### Returns

[`UndoManager`](UndoManager.md) \| `undefined`

***

### hideColumn()

> **hideColumn**(`column`): `void`

Defined in: [core/Actions.ts:885](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L885)

Hide a column, recording its neighbors for intelligent restore

#### Parameters

##### column

`string`

#### Returns

`void`

***

### loadData()

> **loadData**(`source`, `options?`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:516](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L516)

Load data from a file or URL

All metadata (row count, schema) is retrieved in the worker to avoid
blocking the main thread with sequential queries.

#### Parameters

##### source

`string` \| `File` \| `ArrayBuffer`

File, URL string, or raw data (ArrayBuffer for Parquet; string for CSV/JSON)

##### options?

[`LoadDataOptions`](../interfaces/LoadDataOptions.md) = `{}`

Loading options (tableName, format)

#### Returns

`Promise`\<`void`\>

***

### loadFilterPreset()

> **loadFilterPreset**(`filters`, `sortColumns?`): `void`

Defined in: [core/Actions.ts:661](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L661)

Load a filter preset: replace all filters (and optionally sort) in one
undo step. Uses suppressUndoCapture + batch() so Ctrl+Z restores the
entire pre-load state atomically.

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

Defined in: [core/Actions.ts:303](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L303)

Redo the last undone action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### removeDerivedColumn()

> **removeDerivedColumn**(`name`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:1664](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1664)

Remove a derived column.
Cleans up filters, sorts, pins, then delegates to manager.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### removeFilter()

> **removeFilter**(`column`, `type?`): `void`

Defined in: [core/Actions.ts:636](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L636)

Remove filter(s) for a column

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

Defined in: [core/Actions.ts:751](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L751)

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

Defined in: [core/Actions.ts:1563](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1563)

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

Defined in: [core/Actions.ts:1133](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1133)

Reset column width to default

#### Parameters

##### column

`string`

#### Returns

`void`

***

### resetToInitial()

> **resetToInitial**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:451](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L451)

Reset to the original state captured at data-load time.
Clears all filters, sorts, column customizations, derived columns,
and the undo/redo stacks. Returns true if state was restored.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### selectAll()

> **selectAll**(): `void`

Defined in: [core/Actions.ts:1974](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1974)

Select all rows

#### Returns

`void`

***

### selectRow()

> **selectRow**(`index`, `mode?`): `void`

Defined in: [core/Actions.ts:1915](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1915)

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

Defined in: [core/Actions.ts:1181](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1181)

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

Defined in: [core/Actions.ts:1040](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1040)

Set the column order

Also reorders visible columns to match the new order.
Preserves hidden columns in columnOrder at their relative positions.

#### Parameters

##### columns

`string`[]

#### Returns

`void`

***

### setColumnWidth()

> **setColumnWidth**(`column`, `width`): `void`

Defined in: [core/Actions.ts:1123](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1123)

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

Defined in: [core/Actions.ts:2011](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L2011)

Set focused cell for keyboard navigation. Not undoable.

#### Parameters

##### cell

\{ `column`: `string`; `row`: `number`; \} \| `null`

#### Returns

`void`

***

### setHoveredColumn()

> **setHoveredColumn**(`column`): `void`

Defined in: [core/Actions.ts:1999](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1999)

Set hovered column

#### Parameters

##### column

`string` \| `null`

#### Returns

`void`

***

### setHoveredRow()

> **setHoveredRow**(`index`): `void`

Defined in: [core/Actions.ts:1991](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1991)

Set hovered row

#### Parameters

##### index

`number` \| `null`

#### Returns

`void`

***

### setOnDerivedChange()

> **setOnDerivedChange**(`callback`): `void`

Defined in: [core/Actions.ts:206](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L206)

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

Defined in: [core/Actions.ts:196](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L196)

Set a callback invoked for each column whose filter is removed by undo/redo.
Use this to clear visualization interaction state (brush, selection) that
lives outside the signal-driven state.

#### Parameters

##### callback

(`column`) => `void`

#### Returns

`void`

***

### setSort()

> **setSort**(`columns`): `void`

Defined in: [core/Actions.ts:811](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L811)

Set sort columns directly

#### Parameters

##### columns

[`SortColumn`](../../index/interfaces/SortColumn.md)[]

#### Returns

`void`

***

### showAllColumns()

> **showAllColumns**(): `void`

Defined in: [core/Actions.ts:949](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L949)

Show all hidden columns, restoring them in columnOrder

#### Returns

`void`

***

### showColumn()

> **showColumn**(`column`): `void`

Defined in: [core/Actions.ts:913](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L913)

Show a hidden column using neighbor-aware restore logic

#### Parameters

##### column

`string`

#### Returns

`void`

***

### toggleColumnPin()

> **toggleColumnPin**(`column`): `void`

Defined in: [core/Actions.ts:1084](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1084)

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

Defined in: [core/Actions.ts:822](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L822)

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

Defined in: [core/Actions.ts:253](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L253)

Undo the last undoable action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`DestroyedError` if the table was destroyed before or during
  the call.

***

### updateDerivedColumn()

> **updateDerivedColumn**(`oldName`, `def`): `Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:1382](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1382)

Update a derived column's expression, name, or values.
Handles rename (updates all state references) and type change (removes stale filters).

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

Defined in: [core/Actions.ts:724](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L724)

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

Defined in: [core/Actions.ts:1872](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L1872)

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

Defined in: [core/Actions.ts:769](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/core/Actions.ts#L769)

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
