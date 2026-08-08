[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationFactory

# ~~Class: VisualizationFactory~~

Defined in: [visualizations/VisualizationFactory.ts:55](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L55)

Legacy static wrapper that forwards every method to the shared
`defaultVisualizationRegistry` (exported from the root entry). Kept
reachable on `/advanced` only for source-compatibility while consumers
migrate.

## Deprecated

Construct a `VisualizationRegistry` per table and pass it via
`createDataTable({ visualizationRegistry })`, or register on
`defaultVisualizationRegistry` directly. The static wrapper will be
removed in a future minor.

## Constructors

### Constructor

> **new VisualizationFactory**(): `VisualizationFactory`

#### Returns

`VisualizationFactory`

## Methods

### ~~create()~~

> `static` **create**(`container`, `column`, `options`): [`BaseVisualization`](BaseVisualization.md) \| `null`

Defined in: [visualizations/VisualizationFactory.ts:69](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L69)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`VisualizationOptions`](../interfaces/VisualizationOptions.md)

#### Returns

[`BaseVisualization`](BaseVisualization.md) \| `null`

#### Deprecated

Use `VisualizationRegistry#create` on an instance.

***

### ~~getRegisteredTypes()~~

> `static` **getRegisteredTypes**(): `string`[]

Defined in: [visualizations/VisualizationFactory.ts:85](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L85)

#### Returns

`string`[]

#### Deprecated

Use `VisualizationRegistry#getRegisteredTypes` on an instance.

***

### ~~isApplicable()~~

> `static` **isApplicable**(`column`): `boolean`

Defined in: [visualizations/VisualizationFactory.ts:79](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L79)

#### Parameters

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

#### Returns

`boolean`

#### Deprecated

Use `VisualizationRegistry#isApplicable` on an instance.

***

### ~~register()~~

> `static` **register**(`registration`): `void`

Defined in: [visualizations/VisualizationFactory.ts:57](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L57)

#### Parameters

##### registration

[`VisualizationRegistration`](../../index/interfaces/VisualizationRegistration.md)

#### Returns

`void`

#### Deprecated

Use `VisualizationRegistry#register` on an instance.

***

### ~~resetToDefaults()~~

> `static` **resetToDefaults**(): `void`

Defined in: [visualizations/VisualizationFactory.ts:91](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L91)

#### Returns

`void`

#### Deprecated

Use `VisualizationRegistry#resetToDefaults` on an instance.

***

### ~~unregister()~~

> `static` **unregister**(`name`): `boolean`

Defined in: [visualizations/VisualizationFactory.ts:63](https://github.com/jeyabbalas/data-table/blob/0b73c558cde923c255ac5cae38ca0055d95b560c/src/visualizations/VisualizationFactory.ts#L63)

#### Parameters

##### name

`string`

#### Returns

`boolean`

#### Deprecated

Use `VisualizationRegistry#unregister` on an instance.
