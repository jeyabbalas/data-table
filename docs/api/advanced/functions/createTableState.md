[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / createTableState

# Function: createTableState()

> **createTableState**(): [`TableState`](../interfaces/TableState.md)

Defined in: [core/State.ts:89](https://github.com/jeyabbalas/data-table/blob/ef3610328726322e284745dad11202d058a5f69f/src/core/State.ts#L89)

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
