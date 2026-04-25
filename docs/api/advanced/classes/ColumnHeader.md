[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:60](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L60)

ColumnHeader component renders an interactive column header.

## Example

```typescript
const header = new ColumnHeader(column, state, actions);
container.appendChild(header.getElement());

// Later, clean up
header.destroy();
```

## Constructors

### Constructor

> **new ColumnHeader**(`column`, `state`, `actions`, `options?`): `ColumnHeader`

Defined in: [table/ColumnHeader.ts:78](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L78)

#### Parameters

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### state

[`TableState`](../interfaces/TableState.md)

##### actions

[`StateActions`](StateActions.md)

##### options?

[`ColumnHeaderOptions`](../interfaces/ColumnHeaderOptions.md) = `{}`

#### Returns

`ColumnHeader`

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnHeader.ts:826](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L826)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:790](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L790)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getDerivedIconBtn()

> **getDerivedIconBtn**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeader.ts:819](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L819)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:783](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L783)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:812](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L812)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:805](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L805)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/ColumnHeader.ts:797](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L797)

Check if the header has been destroyed

#### Returns

`boolean`

***

### update()

> **update**(): `void`

Defined in: [table/ColumnHeader.ts:738](https://github.com/jeyabbalas/data-table/blob/c5d52215a48c74afb80aea408ab8f07a3a1f5538/src/table/ColumnHeader.ts#L738)

Update the sort button visual state based on current sort state

#### Returns

`void`
