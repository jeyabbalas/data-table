[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / StatsPanelRegistry

# Class: StatsPanelRegistry

Defined in: [visualizations/StatsPanelRegistry.ts:109](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L109)

Per-instance registry of stats panels. Empty by default — add
registrations only for the column types you want to override.

## Example

```ts
import {
  createDataTable,
  StatsPanelRegistry,
} from '@jeyabbalas/data-table';
import { BaseStatsPanel } from '@jeyabbalas/data-table/advanced';

class MeanStdPanel extends BaseStatsPanel {
  update(stats) { ... }
}

const registry = new StatsPanelRegistry();
registry.register({
  name: 'mean-std',
  isApplicable: (type) => type === 'float' || type === 'integer',
  constructor: MeanStdPanel,
  priority: 10,
});

await createDataTable({ container, source, statsPanelRegistry: registry });
```

## Constructors

### Constructor

> **new StatsPanelRegistry**(): `StatsPanelRegistry`

#### Returns

`StatsPanelRegistry`

## Methods

### create()

> **create**(`container`, `column`, `options`): [`BaseStatsPanel`](../../advanced/classes/BaseStatsPanel.md) \| `null`

Defined in: [visualizations/StatsPanelRegistry.ts:144](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L144)

Create the appropriate stats panel for a column. Iterates the registry
by descending priority and returns the first match, or null when no
registration applies (the facade then falls back to the library's
built-in HTML formatter).

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

##### options

[`StatsPanelOptions`](../../advanced/interfaces/StatsPanelOptions.md)

#### Returns

[`BaseStatsPanel`](../../advanced/classes/BaseStatsPanel.md) \| `null`

***

### getRegisteredTypes()

> **getRegisteredTypes**(): `string`[]

Defined in: [visualizations/StatsPanelRegistry.ts:168](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L168)

List all registered panel names.

#### Returns

`string`[]

***

### isApplicable()

> **isApplicable**(`column`): `boolean`

Defined in: [visualizations/StatsPanelRegistry.ts:163](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L163)

Check whether any registered panel matches the column's type. Useful
for callers that want to short-circuit before constructing
[StatsPanelOptions](../../advanced/interfaces/StatsPanelOptions.md).

#### Parameters

##### column

[`ColumnSchema`](../interfaces/ColumnSchema.md)

#### Returns

`boolean`

***

### register()

> **register**(`registration`): `void`

Defined in: [visualizations/StatsPanelRegistry.ts:116](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L116)

Register a stats panel type. Replaces any existing registration with
the same name.

#### Parameters

##### registration

[`StatsPanelRegistration`](../interfaces/StatsPanelRegistration.md)

#### Returns

`void`

***

### resetToDefaults()

> **resetToDefaults**(): `void`

Defined in: [visualizations/StatsPanelRegistry.ts:177](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L177)

Empty the registry. Mirror of [VisualizationRegistry.resetToDefaults](VisualizationRegistry.md#resettodefaults)
— there are no library built-ins for stats panels, so this just clears
everything that was registered.

#### Returns

`void`

***

### unregister()

> **unregister**(`name`): `boolean`

Defined in: [visualizations/StatsPanelRegistry.ts:129](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/visualizations/StatsPanelRegistry.ts#L129)

Unregister a stats panel type by name.

#### Parameters

##### name

`string`

#### Returns

`boolean`

true if a registration was removed
