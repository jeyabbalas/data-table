[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / initializeColumnsFromSchema

# Function: initializeColumnsFromSchema()

> **initializeColumnsFromSchema**(`state`, `schema`): `void`

Defined in: [core/State.ts:235](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/State.ts#L235)

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
