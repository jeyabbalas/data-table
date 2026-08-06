[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / VisualizationRegistration

# Interface: VisualizationRegistration

Defined in: [visualizations/VisualizationRegistry.ts:56](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/visualizations/VisualizationRegistry.ts#L56)

Registration entry for a visualization type.

## Properties

### constructor

> **constructor**: [`VisualizationConstructor`](../type-aliases/VisualizationConstructor.md)

Defined in: [visualizations/VisualizationRegistry.ts:59](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/visualizations/VisualizationRegistry.ts#L59)

***

### isApplicable

> **isApplicable**: (`type`) => `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:58](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/visualizations/VisualizationRegistry.ts#L58)

#### Parameters

##### type

[`DataType`](../type-aliases/DataType.md)

#### Returns

`boolean`

***

### name

> **name**: `string`

Defined in: [visualizations/VisualizationRegistry.ts:57](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/visualizations/VisualizationRegistry.ts#L57)

***

### priority

> **priority**: `number`

Defined in: [visualizations/VisualizationRegistry.ts:61](https://github.com/jeyabbalas/data-table/blob/6ab877c1ea07585d4f49019b8ce012ecb2e0d015/src/visualizations/VisualizationRegistry.ts#L61)

Higher priority wins when multiple registrations match; built-ins use 0.
