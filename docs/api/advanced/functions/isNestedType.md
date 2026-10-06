[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / isNestedType

# Function: isNestedType()

> **isNestedType**(`type`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:121](https://github.com/jeyabbalas/data-table/blob/142ebbe33bc5756781de7efccf3b3506b1ae3965/src/visualizations/VisualizationRegistry.ts#L121)

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
