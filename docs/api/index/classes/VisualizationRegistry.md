[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / VisualizationRegistry

# Class: VisualizationRegistry

Defined in: [visualizations/VisualizationRegistry.ts:131](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L131)

Per-instance registry of visualization types. Built-ins are seeded at
construction and on `resetToDefaults()`.

## Example

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization, isNumericType } from '@jeyabbalas/data-table/advanced';

class MyBoxPlot extends BaseVisualization {
  // ...a constructor that starts the first fetch, fetchData(), render(), and the six
  // handlers: handleMouseMove(), handleClick(), handleMouseLeave(), handleMouseDown(),
  // handleMouseUp(), handleKeyDown(). See BaseVisualization.
}

const registry = new VisualizationRegistry();
registry.register({
  name: 'box-plot',
  isApplicable: isNumericType, // integer, float and decimal
  constructor: MyBoxPlot,
  priority: 10, // higher than built-ins (0) — wins for numeric columns
});

const table = await createDataTable({ container, source, visualizationRegistry: registry });
```

## Constructors

### Constructor

> **new VisualizationRegistry**(): `VisualizationRegistry`

Defined in: [visualizations/VisualizationRegistry.ts:134](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L134)

#### Returns

`VisualizationRegistry`

## Methods

### create()

> **create**(`container`, `column`, `options`): [`BaseVisualization`](../../advanced/classes/BaseVisualization.md) \| `null`

Defined in: [visualizations/VisualizationRegistry.ts:168](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L168)

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

Defined in: [visualizations/VisualizationRegistry.ts:192](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L192)

List all registered visualization type names.

#### Returns

`string`[]

***

### isApplicable()

> **isApplicable**(`column`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:185](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L185)

Check if any registered visualization matches the column's type.

#### Parameters

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

#### Returns

`boolean`

***

### register()

> **register**(`registration`): `void`

Defined in: [visualizations/VisualizationRegistry.ts:142](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L142)

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

Defined in: [visualizations/VisualizationRegistry.ts:199](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L199)

Clear the registry and re-register all built-in visualization types.

#### Returns

`void`

***

### unregister()

> **unregister**(`name`): `boolean`

Defined in: [visualizations/VisualizationRegistry.ts:155](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/visualizations/VisualizationRegistry.ts#L155)

Unregister a visualization type by name.

#### Parameters

##### name

`string`

#### Returns

`boolean`

true if a registration was removed
