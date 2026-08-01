[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:70](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L70)

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

Defined in: [table/ColumnHeader.ts:88](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L88)

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

Defined in: [table/ColumnHeader.ts:810](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L810)

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

Defined in: [table/ColumnHeader.ts:911](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L911)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:875](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L875)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getControls()

> **getControls**(): `HTMLElement`[]

Defined in: [table/ColumnHeader.ts:840](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L840)

The header's interactive controls, in visual order, filtered to the ones
a user could actually operate right now.

Drives F2 controls mode: `KeyboardNavigator` focuses `[0]` on entry and
cycles the list with the arrow keys. Three kinds of element are left out:
disabled ones (the hide button on the last visible column), ones the
responsive container queries have hidden at narrow widths — focusing a
`display: none` element silently does nothing, which would strand the
cycle — and the drag handle, which is mouse-only. A focus stop whose
Enter key does nothing is worse than no stop at all; keyboard reorder
needs a designed gesture, tracked as
[issue #87](https://github.com/jeyabbalas/data-table/issues/87). The
column resize handle is excluded for the same reason — it is not part of
this list at all.

#### Returns

`HTMLElement`[]

#### Example

```typescript
header.getControls()[0]?.focus();
```

***

### getDerivedIconBtn()

> **getDerivedIconBtn**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeader.ts:904](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L904)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:868](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L868)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:897](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L897)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:890](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L890)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/ColumnHeader.ts:882](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L882)

Check if the header has been destroyed

#### Returns

`boolean`

***

### update()

> **update**(): `void`

Defined in: [table/ColumnHeader.ts:751](https://github.com/jeyabbalas/data-table/blob/02aaeeae0857255cd57341c45137ab5dad347776/src/table/ColumnHeader.ts#L751)

Update the sort button visual state based on current sort state

#### Returns

`void`
