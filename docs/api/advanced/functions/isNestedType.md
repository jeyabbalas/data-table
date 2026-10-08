[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / isNestedType

# Function: isNestedType()

> **isNestedType**(`type`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:103](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L103)

Check if a column type is nested: a LIST, ARRAY, STRUCT, MAP, UNION or
VARIANT column. `ColumnSchema.originalType` says which.

Nested columns are not categorical: a registration whose `isApplicable`
accepts `'string'` does not receive them. Accept `'nested'` explicitly to
chart them; the built-in `nested-summary` registration (priority 0) gives
them `NestedSummaryVisualization` otherwise.

## Parameters

### type

[`DataType`](../../index/type-aliases/DataType.md)

## Returns

`boolean`

## Example

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';
import { isNestedType } from '@jeyabbalas/data-table/advanced';

const registry = new VisualizationRegistry();
registry.register({
  name: 'list-length',
  isApplicable: isNestedType,
  constructor: ListLengthChart,
  priority: 10,
});
```
