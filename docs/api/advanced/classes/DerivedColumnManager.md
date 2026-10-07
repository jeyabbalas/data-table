[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnManager

# Class: DerivedColumnManager

Defined in: [derived/DerivedColumnManager.ts:101](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L101)

Owns derived-column lifecycle: validates SQL expressions through DuckDB
(binding, without reading a row, the column each would be in the VIEW),
maintains a wrapper VIEW (`__dt_view_<baseTableName>__`) over the source
table, generates SELECT lists for each derived column, and re-validates
dependents on rename / replace. Every change is all or nothing: when one
fails, the derived columns and the VIEW are as they were. Composed by the
facade; reachable on `/advanced` for power users.

## Constructors

### Constructor

> **new DerivedColumnManager**(`bridge`, `baseTableName`, `getTotalRows?`): `DerivedColumnManager`

Defined in: [derived/DerivedColumnManager.ts:121](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L121)

#### Parameters

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### baseTableName

`string`

##### getTotalRows?

() => `number`

#### Returns

`DerivedColumnManager`

## Properties

### viewName

> `readonly` **viewName**: `string`

Defined in: [derived/DerivedColumnManager.ts:103](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L103)

VIEW name: __dt_view_<baseTableName>__

## Methods

### addColumn()

> **addColumn**(`def`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:149](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L149)

Add a derived column. Validates expression (or creates helper table for vectors),
detects type via DuckDB, recreates VIEW, returns its info. All or nothing: when
any step fails, the derived columns and the VIEW are as they were.

#### Parameters

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

***

### destroy()

> **destroy**(): `Promise`\<`void`\>

Defined in: [derived/DerivedColumnManager.ts:481](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L481)

Clean up: drop VIEW, drop all helper tables

#### Returns

`Promise`\<`void`\>

***

### getColumns()

> **getColumns**(): [`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

Defined in: [derived/DerivedColumnManager.ts:140](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L140)

Returns current derived column info list (copy)

#### Returns

[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

***

### getCompletionContext()

> **getCompletionContext**(`baseSchema`): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [derived/DerivedColumnManager.ts:409](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L409)

Build completion context for editor autocompletion.
Lists all base + derived column names with types.

#### Parameters

##### baseSchema

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]

#### Returns

[`CompletionContext`](../../index/interfaces/CompletionContext.md)

***

### getDependents()

> **getDependents**(`columnName`): `string`[]

Defined in: [derived/DerivedColumnManager.ts:611](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L611)

Return names of expression columns that directly reference the given column.
Used for deletion protection and rename blocking.

#### Parameters

##### columnName

`string`

#### Returns

`string`[]

***

### getEffectiveTableName()

> **getEffectiveTableName**(): `string`

Defined in: [derived/DerivedColumnManager.ts:135](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L135)

Returns VIEW name if derived columns exist, base table name otherwise

#### Returns

`string`

***

### removeColumn()

> **removeColumn**(`name`): `Promise`\<`void`\>

Defined in: [derived/DerivedColumnManager.ts:352](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L352)

Remove a derived column. Drops helper table if vector.
Recreates VIEW without column, or drops VIEW entirely if last derived column.
All or nothing: when the VIEW cannot be rebuilt or dropped, the column stays,
with its helper table.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### replaceColumn()

> **replaceColumn**(`name`, `newDef`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:260](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L260)

Replace a derived column at the same name with a new definition.

Same-name-only — does not support renaming (use [updateColumn](#updatecolumn) for that).
Pre-flights every dependent against the proposed new def before touching the
VIEW. On dependent incompatibility, throws a `DEPENDENTS_INCOMPATIBLE` error
whose `details.dependentsAffected` lists the dependent names and
`details.reasons` maps each name to the DuckDB error. All or nothing, as
[updateColumn](#updatecolumn) is.

#### Parameters

##### name

`string`

##### newDef

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

***

### restoreColumns()

> **restoreColumns**(`defs`, `columnNames?`): `Promise`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

Defined in: [derived/DerivedColumnManager.ts:445](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L445)

Recreate all derived columns from saved definitions (for session restore / undo).
Creates helper tables for vectors, then creates VIEW.
Skips columns that fail with a warning: one whose expression no longer
binds, and one named as a column of `columnNames` or one restored before
it, ignoring the case of ASCII letters as DuckDB does (`Total` beside
`total`, which the VIEW would rename `Total_1`, so that reads of "Total"
returned `total`'s values), or `__rowid__` in any case.

#### Parameters

##### defs

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

##### columnNames?

readonly `string`[] = `[]`

The names of the columns of the table itself, which
  the derived columns are restored beside.

#### Returns

`Promise`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

***

### updateColumn()

> **updateColumn**(`oldName`, `def`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:191](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L191)

Update a derived column's expression/name/values.
Validates, recreates VIEW (and helper table if vector). Returns updated info.
All or nothing: when any step fails, the column keeps its definition, and a
vector column its helper table.

#### Parameters

##### oldName

`string`

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

***

### validateExpression()

> **validateExpression**(`expression`, `alias?`): `Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>

Defined in: [derived/DerivedColumnManager.ts:380](https://github.com/jeyabbalas/data-table/blob/f0a74064947b08a567448b3a07c08ba71d58898e/src/derived/DerivedColumnManager.ts#L380)

Validate an expression without adding it. For UI preview/validation button.

#### Parameters

##### expression

`string`

##### alias?

`string`

#### Returns

`Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>
