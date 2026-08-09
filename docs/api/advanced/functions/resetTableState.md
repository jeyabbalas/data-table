[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / resetTableState

# Function: resetTableState()

> **resetTableState**(`state`): `void`

Defined in: [core/State.ts:152](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/core/State.ts#L152)

Reset table state to initial values

Useful when loading new data or clearing the table.
All signals are reset to their default empty/null values.

## Parameters

### state

[`TableState`](../interfaces/TableState.md)

The TableState to reset

## Returns

`void`

## Example

```typescript
resetTableState(state);
// Now load new data...
```
