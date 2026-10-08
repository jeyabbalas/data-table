[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / createTableState

# Function: createTableState()

> **createTableState**(): [`TableState`](../interfaces/TableState.md)

Defined in: [core/State.ts:92](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/State.ts#L92)

Create a new TableState with default values

All signals are initialized to empty/null states. Use initializeColumnsFromSchema()
after loading data to set up column-related state.

## Returns

[`TableState`](../interfaces/TableState.md)

A new TableState instance with all signals initialized

## Example

```typescript
const state = createTableState();
state.tableName.subscribe(name => console.log('Table:', name));
state.tableName.set('my_data');
```
