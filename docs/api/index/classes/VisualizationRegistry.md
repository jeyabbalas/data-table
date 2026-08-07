[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / VisualizationRegistry

# Class: VisualizationRegistry

Defined in: [visualizations/VisualizationRegistry.ts:121](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L121)

Per-instance registry of visualization types. Built-ins are seeded at
construction and on `resetToDefaults()`.

## Example

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class MyBoxPlot extends BaseVisualization {
  // ...fetchData(), render(), handleMouseMove(), handleClick(), handleMouseLeave()
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'box-plot',
  isApplicable: (type) => type === 'float' || type === 'integer',
  constructor: MyBoxPlot,
  priority: 10, // higher than built-ins (0) — wins for numeric columns
});

const table = await createDataTable({ container, source, visualizationRegistry: registry });
```

## Constructors

### Constructor

> **new VisualizationRegistry**(): `VisualizationRegistry`

Defined in: [visualizations/VisualizationRegistry.ts:124](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L124)

#### Returns

`VisualizationRegistry`

## Methods

### create()

> **create**(`container`, `column`, `options`): [`BaseVisualization`](../../advanced/classes/BaseVisualization.md) \| `null`

Defined in: [visualizations/VisualizationRegistry.ts:158](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L158)

Create the appropriate visualization for a column. Iterates the
registry by descending priority and returns the first match or null.

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../../advanced/interfaces/VisualizationOptions.md)

#### Returns

[`BaseVisualization`](../../advanced/classes/BaseVisualization.md) \| `null`

***

### getRegisteredTypes()

> **getRegisteredTypes**(): `string`[]

Defined in: [visualizations/VisualizationRegistry.ts:182](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L182)

List all registered visualization type names.

#### Returns

`string`[]

***

### isApplicable()

> **isApplicable**(`column`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:175](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L175)

Check if any registered visualization matches the column's type.

#### Parameters

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

#### Returns

`boolean`

***

### register()

> **register**(`registration`): `void`

Defined in: [visualizations/VisualizationRegistry.ts:132](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L132)

Register a visualization type. Replaces any existing registration
with the same name.

#### Parameters

##### registration

[`VisualizationRegistration`](../interfaces/VisualizationRegistration.md)

#### Returns

`void`

***

### resetToDefaults()

> **resetToDefaults**(): `void`

Defined in: [visualizations/VisualizationRegistry.ts:189](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L189)

Clear the registry and re-register all built-in visualization types.

#### Returns

`void`

***

### unregister()

> **unregister**(`name`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:145](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/visualizations/VisualizationRegistry.ts#L145)

Unregister a visualization type by name.

#### Parameters

##### name

`string`

#### Returns

`boolean`

true if a registration was removed
