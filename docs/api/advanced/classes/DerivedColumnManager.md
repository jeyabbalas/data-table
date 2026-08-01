[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnManager

# Class: DerivedColumnManager

Defined in: [derived/DerivedColumnManager.ts:52](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L52)

Owns derived-column lifecycle: validates SQL expressions through DuckDB
(`PREPARE`-based syntax check), maintains a wrapper VIEW
(`__dt_view_<baseTableName>__`) over the source table, generates SELECT
lists for each derived column, and re-validates dependents on rename /
replace. Composed by the facade; reachable on `/advanced` for power users.

## Constructors

### Constructor

> **new DerivedColumnManager**(`bridge`, `baseTableName`, `getTotalRows?`): `DerivedColumnManager`

Defined in: [derived/DerivedColumnManager.ts:64](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L64)

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

Defined in: [derived/DerivedColumnManager.ts:54](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L54)

VIEW name: __dt_view_<baseTableName>__

## Methods

### addColumn()

> **addColumn**(`def`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:88](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L88)

Add a derived column. Validates expression (or creates helper table for vectors),
detects type via DuckDB, recreates VIEW, returns ColumnSchema with isDerived: true.

#### Parameters

##### def

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

***

### destroy()

> **destroy**(): `Promise`\<`void`\>

Defined in: [derived/DerivedColumnManager.ts:525](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L525)

Clean up: drop VIEW, drop all helper tables

#### Returns

`Promise`\<`void`\>

***

### getColumns()

> **getColumns**(): [`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

Defined in: [derived/DerivedColumnManager.ts:80](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L80)

Returns current derived column info list (copy)

#### Returns

[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

***

### getCompletionContext()

> **getCompletionContext**(`baseSchema`): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [derived/DerivedColumnManager.ts:473](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L473)

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

Defined in: [derived/DerivedColumnManager.ts:656](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L656)

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

Defined in: [derived/DerivedColumnManager.ts:75](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L75)

Returns VIEW name if derived columns exist, base table name otherwise

#### Returns

`string`

***

### removeColumn()

> **removeColumn**(`name`): `Promise`\<`void`\>

Defined in: [derived/DerivedColumnManager.ts:402](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L402)

Remove a derived column. Drops helper table if vector.
Recreates VIEW without column, or drops VIEW entirely if last derived column.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### replaceColumn()

> **replaceColumn**(`name`, `newDef`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:242](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L242)

Replace a derived column at the same name with a new definition.

Same-name-only — does not support renaming (use [updateColumn](#updatecolumn) for that).
Pre-flights every dependent against the proposed new def before touching the
VIEW. On dependent incompatibility, throws a `DEPENDENTS_INCOMPATIBLE` error
whose `details.dependentsAffected` lists the dependent names and
`details.reasons` maps each name to the DuckDB error.

#### Parameters

##### name

`string`

##### newDef

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)

#### Returns

`Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

***

### restoreColumns()

> **restoreColumns**(`defs`): `Promise`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

Defined in: [derived/DerivedColumnManager.ts:502](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L502)

Recreate all derived columns from saved definitions (for session restore / undo).
Creates helper tables for vectors, then creates VIEW.
Skips columns that fail with a warning.

#### Parameters

##### defs

[`DerivedColumnDef`](../../index/type-aliases/DerivedColumnDef.md)[]

#### Returns

`Promise`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

***

### updateColumn()

> **updateColumn**(`oldName`, `def`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:141](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L141)

Update a derived column's expression/name/values.
Validates, recreates VIEW (and helper table if vector). Returns updated info.

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

Defined in: [derived/DerivedColumnManager.ts:444](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/derived/DerivedColumnManager.ts#L444)

Validate an expression without adding it. For UI preview/validation button.

#### Parameters

##### expression

`string`

##### alias?

`string`

#### Returns

`Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>
