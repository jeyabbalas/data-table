[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / createTableState

# Function: createTableState()

> **createTableState**(): [`TableState`](../interfaces/TableState.md)

Defined in: [core/State.ts:94](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/core/State.ts#L94)

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
