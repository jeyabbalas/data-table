[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPresetPanel

# Class: FilterPresetPanel

Defined in: [filters/FilterPresetPanel.ts:29](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L29)

Floating panel that hosts the save / load / import / export UI for filter
presets. Composed by the facade when `presets` is enabled; reach for it
directly to embed the preset list inside a custom shell.

## Constructors

### Constructor

> **new FilterPresetPanel**(`presetManager`, `state`, `actions`, `options?`): `FilterPresetPanel`

Defined in: [filters/FilterPresetPanel.ts:47](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L47)

#### Parameters

##### presetManager

[`FilterPresetManager`](../../index/classes/FilterPresetManager.md)

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`FilterPresetPanelOptions`](../interfaces/FilterPresetPanelOptions.md)

#### Returns

`FilterPresetPanel`

## Methods

### close()

> **close**(): `void`

Defined in: [filters/FilterPresetPanel.ts:258](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L258)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPresetPanel.ts:503](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L503)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPresetPanel.ts:495](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L495)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPresetPanel.ts:499](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L499)

#### Returns

`boolean`

***

### open()

> **open**(`anchorElement`): `void`

Defined in: [filters/FilterPresetPanel.ts:237](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L237)

#### Parameters

##### anchorElement

`HTMLElement`

#### Returns

`void`

***

### toggle()

> **toggle**(`anchorElement`): `void`

Defined in: [filters/FilterPresetPanel.ts:229](https://github.com/jeyabbalas/data-table/blob/cda2ebc222197533721ff593dcca15e2f024dfae/src/filters/FilterPresetPanel.ts#L229)

#### Parameters

##### anchorElement

`HTMLElement`

#### Returns

`void`
