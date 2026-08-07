[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / StatsPanelRegistration

# Interface: StatsPanelRegistration

Defined in: [visualizations/StatsPanelRegistry.ts:66](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/StatsPanelRegistry.ts#L66)

Registration entry for a stats panel.

## Properties

### constructor

> **constructor**: [`StatsPanelConstructor`](../type-aliases/StatsPanelConstructor.md)

Defined in: [visualizations/StatsPanelRegistry.ts:72](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/StatsPanelRegistry.ts#L72)

The panel class to instantiate when [isApplicable](#isapplicable) returns true.

***

### isApplicable

> **isApplicable**: (`type`) => `boolean`

Defined in: [visualizations/StatsPanelRegistry.ts:70](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/StatsPanelRegistry.ts#L70)

Predicate: should this panel handle a column of the given type?

#### Parameters

##### type

[`DataType`](../type-aliases/DataType.md)

#### Returns

`boolean`

***

### name

> **name**: `string`

Defined in: [visualizations/StatsPanelRegistry.ts:68](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/StatsPanelRegistry.ts#L68)

Stable identifier; same-name re-register replaces the existing entry.

***

### priority

> **priority**: `number`

Defined in: [visualizations/StatsPanelRegistry.ts:79](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/StatsPanelRegistry.ts#L79)

Higher priority wins when multiple registrations match. There are no
library built-ins (the default HTML formatter is the implicit
fallback), so any positive number is enough to take effect; use
higher numbers to layer overrides.
