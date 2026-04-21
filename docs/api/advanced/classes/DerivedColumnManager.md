[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / DerivedColumnManager

# Class: DerivedColumnManager

Defined in: [derived/DerivedColumnManager.ts:45](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L45)

## Constructors

### Constructor

> **new DerivedColumnManager**(`bridge`, `baseTableName`): `DerivedColumnManager`

Defined in: [derived/DerivedColumnManager.ts:57](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L57)

#### Parameters

##### bridge

[`WorkerBridge`](../../index/classes/WorkerBridge.md)

##### baseTableName

`string`

#### Returns

`DerivedColumnManager`

## Properties

### viewName

> `readonly` **viewName**: `string`

Defined in: [derived/DerivedColumnManager.ts:47](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L47)

VIEW name: __dt_view_<baseTableName>__

## Methods

### addColumn()

> **addColumn**(`def`): `Promise`\<[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)\>

Defined in: [derived/DerivedColumnManager.ts:80](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L80)

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

Defined in: [derived/DerivedColumnManager.ts:347](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L347)

Clean up: drop VIEW, drop all helper tables

#### Returns

`Promise`\<`void`\>

***

### getColumns()

> **getColumns**(): [`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

Defined in: [derived/DerivedColumnManager.ts:72](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L72)

Returns current derived column info list (copy)

#### Returns

[`DerivedColumnInfo`](../interfaces/DerivedColumnInfo.md)[]

***

### getCompletionContext()

> **getCompletionContext**(`baseSchema`): [`CompletionContext`](../../index/interfaces/CompletionContext.md)

Defined in: [derived/DerivedColumnManager.ts:295](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L295)

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

Defined in: [derived/DerivedColumnManager.ts:478](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L478)

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

Defined in: [derived/DerivedColumnManager.ts:67](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L67)

Returns VIEW name if derived columns exist, base table name otherwise

#### Returns

`string`

***

### removeColumn()

> **removeColumn**(`name`): `Promise`\<`void`\>

Defined in: [derived/DerivedColumnManager.ts:227](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L227)

Remove a derived column. Drops helper table if vector.
Recreates VIEW without column, or drops VIEW entirely if last derived column.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### restoreColumns()

> **restoreColumns**(`defs`): `Promise`\<[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]\>

Defined in: [derived/DerivedColumnManager.ts:324](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L324)

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

Defined in: [derived/DerivedColumnManager.ts:132](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L132)

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

Defined in: [derived/DerivedColumnManager.ts:269](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/derived/DerivedColumnManager.ts#L269)

Validate an expression without adding it. For UI preview/validation button.

#### Parameters

##### expression

`string`

##### alias?

`string`

#### Returns

`Promise`\<\{ `error?`: `string`; `originalType?`: `string`; `type?`: [`DataType`](../../index/type-aliases/DataType.md); `valid`: `boolean`; \}\>
