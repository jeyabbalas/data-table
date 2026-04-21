[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / resetTableState

# Function: resetTableState()

> **resetTableState**(`state`): `void`

Defined in: [core/State.ts:152](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/core/State.ts#L152)

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
