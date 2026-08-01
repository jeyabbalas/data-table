[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / initializeColumnsFromSchema

# Function: initializeColumnsFromSchema()

> **initializeColumnsFromSchema**(`state`, `schema`): `void`

Defined in: [core/State.ts:188](https://github.com/jeyabbalas/data-table/blob/e107b8ba1fceb43ab96cbfcbd2c0a926830d3cb4/src/core/State.ts#L188)

Initialize column-related state from a schema

Sets up the schema, visibleColumns, and columnOrder based on the provided
column schema. This should be called after loading data.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

The TableState to initialize

### schema

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)[]

The column schema from the loaded data

## Returns

`void`

## Example

```typescript
const schema = await detectSchema(tableName, bridge);
initializeColumnsFromSchema(state, schema);
```
