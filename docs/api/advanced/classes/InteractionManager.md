[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / InteractionManager

# Class: InteractionManager

Defined in: [visualizations/InteractionManager.ts:43](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L43)

## Constructors

### Constructor

> **new InteractionManager**(): `InteractionManager`

Defined in: [visualizations/InteractionManager.ts:47](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L47)

#### Returns

`InteractionManager`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [visualizations/InteractionManager.ts:128](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L128)

Get the number of active interactions

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [visualizations/InteractionManager.ts:133](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L133)

Clear all interactions from the stack (does not clear the visualizations)

#### Returns

`void`

***

### clearColumn()

> **clearColumn**(`columnName`): `void`

Defined in: [visualizations/InteractionManager.ts:87](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L87)

Clear and remove all interactions for a given column.
Unlike removeColumn(), this also calls clearBrush/clearSelection on the visualization.

#### Parameters

##### columnName

`string`

#### Returns

`void`

***

### clearLast()

> **clearLast**(): `boolean`

Defined in: [visualizations/InteractionManager.ts:107](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L107)

Clear the most recent interaction (LIFO).
Returns true if an interaction was cleared, false if the stack was empty.

#### Returns

`boolean`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/InteractionManager.ts:138](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L138)

Destroy the manager, removing the keyboard listener

#### Returns

`void`

***

### pushBrush()

> **pushBrush**(`columnName`, `viz`): `void`

Defined in: [visualizations/InteractionManager.ts:62](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L62)

Push a brush interaction onto the stack.
Removes any existing interaction for the same column first.

#### Parameters

##### columnName

`string`

##### viz

[`InteractiveVisualization`](../type-aliases/InteractiveVisualization.md)

#### Returns

`void`

***

### pushSelection()

> **pushSelection**(`columnName`, `viz`): `void`

Defined in: [visualizations/InteractionManager.ts:71](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L71)

Push a selection interaction onto the stack.
Removes any existing interaction for the same column first.

#### Parameters

##### columnName

`string`

##### viz

[`InteractiveVisualization`](../type-aliases/InteractiveVisualization.md)

#### Returns

`void`

***

### removeColumn()

> **removeColumn**(`columnName`): `void`

Defined in: [visualizations/InteractionManager.ts:79](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/visualizations/InteractionManager.ts#L79)

Remove all interactions for a given column (does not clear the visualizations).

#### Parameters

##### columnName

`string`

#### Returns

`void`
