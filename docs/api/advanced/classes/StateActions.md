[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / StateActions

# Class: StateActions

Defined in: [core/Actions.ts:109](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L109)

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

Defined in: [core/Actions.ts:126](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L126)

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

Defined in: [core/Actions.ts:1141](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1141)

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

Defined in: [core/Actions.ts:461](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L461)

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

Defined in: [core/Actions.ts:533](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L533)

Add a raw SQL filter. Does NOT re-validate — caller is responsible
for validation (see validateSQLFilter). Creates a RawSQLFilter with
a unique id and synthetic column key, appends to state.filters.
Captures undo snapshot before mutation.

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

Defined in: [core/Actions.ts:670](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L670)

Add column to multi-sort (Shift+click behavior)

If column is already in sort, toggles its direction or removes it.

#### Parameters

##### column

`string`

#### Returns

`void`

***

### beginColumnWidthChange()

> **beginColumnWidthChange**(): `void`

Defined in: [core/Actions.ts:286](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L286)

Begin a column width drag sequence.
Captures state once at drag start for undo.

#### Returns

`void`

***

### clearFilters()

> **clearFilters**(): `void`

Defined in: [core/Actions.ts:496](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L496)

Clear all filters

#### Returns

`void`

***

### clearFocusedCell()

> **clearFocusedCell**(): `void`

Defined in: [core/Actions.ts:1794](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1794)

Clear focused cell.

#### Returns

`void`

***

### clearSelection()

> **clearSelection**(): `void`

Defined in: [core/Actions.ts:1745](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1745)

Clear all row selection

#### Returns

`void`

***

### clearSort()

> **clearSort**(): `void`

Defined in: [core/Actions.ts:695](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L695)

Clear all sorting

#### Returns

`void`

***

### endColumnWidthChange()

> **endColumnWidthChange**(): `void`

Defined in: [core/Actions.ts:295](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L295)

End a column width drag sequence.
Pushes the pre-drag snapshot to the undo stack.

#### Returns

`void`

***

### getColumnHeaderTooltip()

> **getColumnHeaderTooltip**(`column`): [`ColumnHeaderTooltipContent`](../../index/interfaces/ColumnHeaderTooltipContent.md) \| `null`

Defined in: [core/Actions.ts:1024](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1024)

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

Defined in: [core/Actions.ts:1582](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1582)

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

The reserved `__rowid__` column is retrievable by name; its values are
BIGINT-backed and return as `BigInt64Array`. For plain-number
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

`QueryError` with `code: 'NO_TABLE'` when called before any data
  is loaded.

***

### getCompletionContext()

> **getCompletionContext**(): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [core/Actions.ts:1666](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1666)

Get completion context for expression editor autocompletion.

#### Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

***

### getFiltersSQL()

> **getFiltersSQL**(): `string`

Defined in: [core/Actions.ts:627](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L627)

Get the complete WHERE clause SQL for all active filters.
Convenience method for downstream apps that need the raw SQL string.

#### Returns

`string`

***

### getRawSQLFilters()

> **getRawSQLFilters**(): [`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

Defined in: [core/Actions.ts:592](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L592)

Get all active raw SQL filters. Convenience getter.

#### Returns

[`RawSQLFilter`](../../index/interfaces/RawSQLFilter.md)[]

***

### getUndoManager()

> **getUndoManager**(): [`UndoManager`](UndoManager.md) \| `undefined`

Defined in: [core/Actions.ts:302](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L302)

Get the UndoManager instance, if one was provided

#### Returns

[`UndoManager`](UndoManager.md) \| `undefined`

***

### hideColumn()

> **hideColumn**(`column`): `void`

Defined in: [core/Actions.ts:707](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L707)

Hide a column, recording its neighbors for intelligent restore

#### Parameters

##### column

`string`

#### Returns

`void`

***

### loadData()

> **loadData**(`source`, `options?`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:374](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L374)

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

Defined in: [core/Actions.ts:507](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L507)

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

Defined in: [core/Actions.ts:244](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L244)

Redo the last undone action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.

#### Returns

`Promise`\<`boolean`\>

***

### removeDerivedColumn()

> **removeDerivedColumn**(`name`): `Promise`\<`void`\>

Defined in: [core/Actions.ts:1461](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1461)

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

Defined in: [core/Actions.ts:484](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L484)

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

Defined in: [core/Actions.ts:584](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L584)

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

Defined in: [core/Actions.ts:1372](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1372)

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

Defined in: [core/Actions.ts:958](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L958)

Reset column width to default

#### Parameters

##### column

`string`

#### Returns

`void`

***

### resetToInitial()

> **resetToInitial**(): `Promise`\<`boolean`\>

Defined in: [core/Actions.ts:311](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L311)

Reset to the original state captured at data-load time.
Clears all filters, sorts, column customizations, derived columns,
and the undo/redo stacks. Returns true if state was restored.

#### Returns

`Promise`\<`boolean`\>

***

### selectAll()

> **selectAll**(): `void`

Defined in: [core/Actions.ts:1753](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1753)

Select all rows

#### Returns

`void`

***

### selectRow()

> **selectRow**(`index`, `mode?`): `void`

Defined in: [core/Actions.ts:1693](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1693)

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

Defined in: [core/Actions.ts:1005](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1005)

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

Defined in: [core/Actions.ts:868](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L868)

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

Defined in: [core/Actions.ts:949](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L949)

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

Defined in: [core/Actions.ts:1787](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1787)

Set focused cell for keyboard navigation. Not undoable.

#### Parameters

##### cell

\{ `column`: `string`; `row`: `number`; \} \| `null`

#### Returns

`void`

***

### setHoveredColumn()

> **setHoveredColumn**(`column`): `void`

Defined in: [core/Actions.ts:1776](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1776)

Set hovered column

#### Parameters

##### column

`string` \| `null`

#### Returns

`void`

***

### setHoveredRow()

> **setHoveredRow**(`index`): `void`

Defined in: [core/Actions.ts:1769](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1769)

Set hovered row

#### Parameters

##### index

`number` \| `null`

#### Returns

`void`

***

### setOnDerivedChange()

> **setOnDerivedChange**(`callback`): `void`

Defined in: [core/Actions.ts:161](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L161)

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

Defined in: [core/Actions.ts:152](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L152)

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

Defined in: [core/Actions.ts:638](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L638)

Set sort columns directly

#### Parameters

##### columns

[`SortColumn`](../../index/interfaces/SortColumn.md)[]

#### Returns

`void`

***

### showAllColumns()

> **showAllColumns**(): `void`

Defined in: [core/Actions.ts:769](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L769)

Show all hidden columns, restoring them in columnOrder

#### Returns

`void`

***

### showColumn()

> **showColumn**(`column`): `void`

Defined in: [core/Actions.ts:734](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L734)

Show a hidden column using neighbor-aware restore logic

#### Parameters

##### column

`string`

#### Returns

`void`

***

### toggleColumnPin()

> **toggleColumnPin**(`column`): `void`

Defined in: [core/Actions.ts:911](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L911)

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

Defined in: [core/Actions.ts:648](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L648)

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

Defined in: [core/Actions.ts:199](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L199)

Undo the last undoable action. Returns true if state was restored.
Async because derived column changes require DuckDB VIEW reconciliation.

#### Returns

`Promise`\<`boolean`\>

***

### updateDerivedColumn()

> **updateDerivedColumn**(`oldName`, `def`): `Promise`\<\{ `error?`: `string`; `success`: `boolean`; \}\>

Defined in: [core/Actions.ts:1203](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1203)

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

Defined in: [core/Actions.ts:558](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L558)

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

Defined in: [core/Actions.ts:1653](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L1653)

Validate an expression without adding it. For UI preview.

#### Parameters

##### expression

`string`

#### Returns

`Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>

***

### validateSQLFilter()

> **validateSQLFilter**(`sql`, `signal?`): `Promise`\<\{ `error?`: `string`; `matchCount?`: `number`; `valid`: `boolean`; \}\>

Defined in: [core/Actions.ts:603](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/Actions.ts#L603)

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
