[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / VisualizationRegistry

# Class: VisualizationRegistry

Defined in: [visualizations/VisualizationRegistry.ts:147](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L147)

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

Defined in: [visualizations/VisualizationRegistry.ts:150](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L150)

#### Returns

`VisualizationRegistry`

## Methods

### create()

> **create**(`container`, `column`, `options`): [`BaseVisualization`](../../advanced/classes/BaseVisualization.md) \| `null`

Defined in: [visualizations/VisualizationRegistry.ts:184](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L184)

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

Defined in: [visualizations/VisualizationRegistry.ts:208](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L208)

List all registered visualization type names.

#### Returns

`string`[]

***

### isApplicable()

> **isApplicable**(`column`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:201](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L201)

Check if any registered visualization matches the column's type.

#### Parameters

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

#### Returns

`boolean`

***

### register()

> **register**(`registration`): `void`

Defined in: [visualizations/VisualizationRegistry.ts:158](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L158)

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

Defined in: [visualizations/VisualizationRegistry.ts:215](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L215)

Clear the registry and re-register all built-in visualization types.

#### Returns

`void`

***

### unregister()

> **unregister**(`name`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:171](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/visualizations/VisualizationRegistry.ts#L171)

Unregister a visualization type by name.

#### Parameters

##### name

`string`

#### Returns

`boolean`

true if a registration was removed
