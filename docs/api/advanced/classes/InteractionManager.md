[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / InteractionManager

# Class: InteractionManager

Defined in: [visualizations/InteractionManager.ts:57](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L57)

LIFO interaction stack for per-column brush / selection state across all
mounted visualizations. Owns a global `keydown` listener so pressing
Escape clears the most recent interaction. Composed by the facade; reach
for it directly only when wiring custom visualization shells.

## Constructors

### Constructor

> **new InteractionManager**(): `InteractionManager`

Defined in: [visualizations/InteractionManager.ts:61](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L61)

#### Returns

`InteractionManager`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [visualizations/InteractionManager.ts:142](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L142)

Get the number of active interactions

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [visualizations/InteractionManager.ts:147](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L147)

Clear all interactions from the stack (does not clear the visualizations)

#### Returns

`void`

***

### clearColumn()

> **clearColumn**(`columnName`): `void`

Defined in: [visualizations/InteractionManager.ts:101](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L101)

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

Defined in: [visualizations/InteractionManager.ts:121](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L121)

Clear the most recent interaction (LIFO).
Returns true if an interaction was cleared, false if the stack was empty.

#### Returns

`boolean`

***

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/InteractionManager.ts:152](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L152)

Destroy the manager, removing the keyboard listener

#### Returns

`void`

***

### pushBrush()

> **pushBrush**(`columnName`, `viz`): `void`

Defined in: [visualizations/InteractionManager.ts:76](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L76)

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

Defined in: [visualizations/InteractionManager.ts:85](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L85)

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

Defined in: [visualizations/InteractionManager.ts:93](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/visualizations/InteractionManager.ts#L93)

Remove all interactions for a given column (does not clear the visualizations).

#### Parameters

##### columnName

`string`

#### Returns

`void`
