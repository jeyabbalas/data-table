[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / FilterPresetPanel

# Class: FilterPresetPanel

Defined in: [filters/FilterPresetPanel.ts:37](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L37)

Floating panel that hosts the save / load / import / export UI for filter
presets. Composed by the facade when `presets` is enabled; reach for it
directly to embed the preset list inside a custom shell.

## Constructors

### Constructor

> **new FilterPresetPanel**(`presetManager`, `state`, `actions`, `options?`): `FilterPresetPanel`

Defined in: [filters/FilterPresetPanel.ts:57](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L57)

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

Defined in: [filters/FilterPresetPanel.ts:271](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L271)

#### Returns

`void`

***

### destroy()

> **destroy**(): `void`

Defined in: [filters/FilterPresetPanel.ts:535](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L535)

#### Returns

`void`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [filters/FilterPresetPanel.ts:527](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L527)

#### Returns

`HTMLElement`

***

### getIsOpen()

> **getIsOpen**(): `boolean`

Defined in: [filters/FilterPresetPanel.ts:531](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L531)

#### Returns

`boolean`

***

### open()

> **open**(`anchorElement`): `void`

Defined in: [filters/FilterPresetPanel.ts:249](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L249)

#### Parameters

##### anchorElement

`HTMLElement`

#### Returns

`void`

***

### toggle()

> **toggle**(`anchorElement`): `void`

Defined in: [filters/FilterPresetPanel.ts:241](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/filters/FilterPresetPanel.ts#L241)

#### Parameters

##### anchorElement

`HTMLElement`

#### Returns

`void`
