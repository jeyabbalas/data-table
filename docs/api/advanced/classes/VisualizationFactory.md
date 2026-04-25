[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / VisualizationFactory

# ~~Class: VisualizationFactory~~

Defined in: [visualizations/VisualizationFactory.ts:48](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L48)

## Deprecated

Static wrapper that forwards to `defaultVisualizationRegistry`.
Prefer constructing a `VisualizationRegistry` instance per table.

## Constructors

### Constructor

> **new VisualizationFactory**(): `VisualizationFactory`

#### Returns

`VisualizationFactory`

## Methods

### ~~create()~~

> `static` **create**(`container`, `column`, `options`): [`BaseVisualization`](BaseVisualization.md) \| `null`

Defined in: [visualizations/VisualizationFactory.ts:62](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L62)

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

Defined in: [visualizations/VisualizationFactory.ts:78](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L78)

#### Returns

`string`[]

#### Deprecated

Use `VisualizationRegistry#getRegisteredTypes` on an instance.

***

### ~~isApplicable()~~

> `static` **isApplicable**(`column`): `boolean`

Defined in: [visualizations/VisualizationFactory.ts:72](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L72)

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

Defined in: [visualizations/VisualizationFactory.ts:50](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L50)

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

Defined in: [visualizations/VisualizationFactory.ts:84](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L84)

#### Returns

`void`

#### Deprecated

Use `VisualizationRegistry#resetToDefaults` on an instance.

***

### ~~unregister()~~

> `static` **unregister**(`name`): `boolean`

Defined in: [visualizations/VisualizationFactory.ts:56](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/visualizations/VisualizationFactory.ts#L56)

#### Parameters

##### name

`string`

#### Returns

`boolean`

#### Deprecated

Use `VisualizationRegistry#unregister` on an instance.
