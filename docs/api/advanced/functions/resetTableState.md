[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / resetTableState

# Function: resetTableState()

> **resetTableState**(`state`): `void`

Defined in: [core/State.ts:155](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/core/State.ts#L155)

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
