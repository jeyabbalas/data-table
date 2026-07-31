[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:70](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L70)

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

Defined in: [table/ColumnHeader.ts:88](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L88)

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

### activateSort()

> **activateSort**(`addToMultiSort`): `void`

Defined in: [table/ColumnHeader.ts:810](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L810)

Toggle this column's sort, or push it onto the multi-sort stack.

The keyboard entry point for sorting. `KeyboardNavigator` calls it when
the grid cursor sits on this header and the user presses Enter or Space;
the header's own keydown listener calls it when the header cell itself is
the event target. Mirrors click (plain) and Cmd/Ctrl+click (multi).

#### Parameters

##### addToMultiSort

`boolean`

Append to the sort stack instead of replacing it.

#### Returns

`void`

#### Example

```typescript
header.activateSort(false); // sort by this column alone
header.activateSort(true);  // add as the next sort key
```

***

### destroy()

> **destroy**(): `void`

Defined in: [table/ColumnHeader.ts:908](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L908)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:872](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L872)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getControls()

> **getControls**(): `HTMLElement`[]

Defined in: [table/ColumnHeader.ts:837](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L837)

The header's interactive controls, in visual order, filtered to the ones
a user could actually operate right now.

Drives F2 controls mode: `KeyboardNavigator` focuses `[0]` on entry and
cycles the list with the arrow keys. Three kinds of element are left out:
disabled ones (the hide button on the last visible column), ones the
responsive container queries have hidden at narrow widths — focusing a
`display: none` element silently does nothing, which would strand the
cycle — and the drag handle, which is mouse-only. A focus stop whose
Enter key does nothing is worse than no stop at all; keyboard reorder
needs a designed gesture, tracked as a follow-up.

#### Returns

`HTMLElement`[]

#### Example

```typescript
header.getControls()[0]?.focus();
```

***

### getDerivedIconBtn()

> **getDerivedIconBtn**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeader.ts:901](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L901)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:865](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L865)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:894](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L894)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:887](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L887)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/ColumnHeader.ts:879](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L879)

Check if the header has been destroyed

#### Returns

`boolean`

***

### update()

> **update**(): `void`

Defined in: [table/ColumnHeader.ts:751](https://github.com/jeyabbalas/data-table/blob/16620f899e7b6dda96e2db6a94ff225dc91572f6/src/table/ColumnHeader.ts#L751)

Update the sort button visual state based on current sort state

#### Returns

`void`
