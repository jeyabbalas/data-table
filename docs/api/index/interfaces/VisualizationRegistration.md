[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / VisualizationRegistration

# Interface: VisualizationRegistration

Defined in: [visualizations/VisualizationRegistry.ts:39](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L39)

Registration entry for a visualization type.

## Properties

### constructor

> **constructor**: [`VisualizationConstructor`](../type-aliases/VisualizationConstructor.md)

Defined in: [visualizations/VisualizationRegistry.ts:42](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L42)

***

### isApplicable

> **isApplicable**: (`type`) => `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:41](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L41)

#### Parameters

##### type

[`DataType`](../type-aliases/DataType.md)

#### Returns

`boolean`

***

### name

> **name**: `string`

Defined in: [visualizations/VisualizationRegistry.ts:40](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L40)

***

### priority

> **priority**: `number`

Defined in: [visualizations/VisualizationRegistry.ts:44](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/visualizations/VisualizationRegistry.ts#L44)

Higher priority wins when multiple registrations match; built-ins use 0.
