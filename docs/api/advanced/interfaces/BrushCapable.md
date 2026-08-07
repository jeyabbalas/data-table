[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BrushCapable

# Interface: BrushCapable

Defined in: [visualizations/InteractionManager.ts:27](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/InteractionManager.ts#L27)

Capability marker — visualizations that expose `clearBrush()` for
brush-style range selection. Combined with [SelectionCapable](SelectionCapable.md) into
[InteractiveVisualization](../type-aliases/InteractiveVisualization.md); subclass implementers picking one or both
capabilities should reference this from their `implements` clause.

## Methods

### clearBrush()

> **clearBrush**(): `void`

Defined in: [visualizations/InteractionManager.ts:28](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/InteractionManager.ts#L28)

#### Returns

`void`
