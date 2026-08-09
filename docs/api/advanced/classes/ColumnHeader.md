[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:82](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L82)

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

Defined in: [table/ColumnHeader.ts:100](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L100)

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

Defined in: [table/ColumnHeader.ts:847](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L847)

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

Defined in: [table/ColumnHeader.ts:1046](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1046)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:1010](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1010)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getControls()

> **getControls**(): `HTMLElement`[]

Defined in: [table/ColumnHeader.ts:975](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L975)

The header's interactive controls, in visual order, filtered to the ones
a user could actually operate right now.

Drives F2 controls mode: `KeyboardNavigator` focuses `[0]` on entry and
cycles the list with the arrow keys. Three kinds of element are left out:
disabled ones (the hide button on the last visible column), ones the
responsive container queries have hidden at narrow widths — focusing a
`display: none` element silently does nothing, which would strand the
cycle — and the two layout affordances, the drag handle and the resize
separator.

Those two stay out by design rather than by omission. They are operated
from the header cursor with `Shift+F2` (column layout mode), a modal
gesture that costs no tab stop and no focus stop — see
[ColumnHeader.resizeBy](#resizeby) and `KeyboardNavigator`. Adding them here
instead would make the separator a focusable widget, which ARIA then
requires to carry `aria-valuenow` / `min` / `max`.

#### Returns

`HTMLElement`[]

#### Example

```typescript
header.getControls()[0]?.focus();
```

***

### getDerivedIconBtn()

> **getDerivedIconBtn**(): `HTMLElement` \| `null`

Defined in: [table/ColumnHeader.ts:1039](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1039)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1003](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1003)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1032](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1032)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1025](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1025)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### getWidth()

> **getWidth**(): `number`

Defined in: [table/ColumnHeader.ts:886](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L886)

The current width of this column, in pixels.

Reads `columnWidths` rather than the element, so it reports the state the
next resize step will build on even before layout has flushed. Resolved
through the renderer's own helper, so an unsized column reports the
default the renderer will draw and a width the renderer refuses
(non-finite, non-positive) does not become the base of the next step —
`Math.max(min, Math.min(max, NaN))` is `NaN`, which would make every
subsequent resize a no-op.

#### Returns

`number`

***

### getWidthBounds()

> **getWidthBounds**(): `object`

Defined in: [table/ColumnHeader.ts:903](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L903)

The clamp bounds a width change is held to — the resizer's own
`minWidth` / `maxWidth` (50 / 500 by default).

Exposed so a caller can tell "the step was applied" from "the step was
refused because we are already at the edge" without duplicating the
bounds.

#### Returns

`object`

##### max

> **max**: `number`

##### min

> **min**: `number`

#### Example

```typescript
const { min, max } = header.getWidthBounds(); // { min: 50, max: 500 }
```

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [table/ColumnHeader.ts:1017](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L1017)

Check if the header has been destroyed

#### Returns

`boolean`

***

### resizeBy()

> **resizeBy**(`deltaPx`): `number`

Defined in: [table/ColumnHeader.ts:946](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L946)

Grow or shrink this column by `deltaPx`, clamped to
[ColumnHeader.getWidthBounds](#getwidthbounds).

The keyboard entry point for the arrow keys in column layout mode.

#### Parameters

##### deltaPx

`number`

Signed pixel delta; negative shrinks.

#### Returns

`number`

The width actually applied.

#### Example

```typescript
header.resizeBy(-16); // one Left-arrow step
```

***

### setLayoutMode()

> **setLayoutMode**(`active`): `void`

Defined in: [table/ColumnHeader.ts:869](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L869)

Show or hide this header's column-layout-mode affordance.

Column layout mode (`Shift+F2` from the header cursor) moves no DOM focus,
so nothing in the default rendering would tell a sighted keyboard user
which column the arrow keys are about to resize or move. This puts a
dashed outline on the header and lights the resize handle.

#### Parameters

##### active

`boolean`

#### Returns

`void`

#### Example

```typescript
header.setLayoutMode(true);
```

***

### setWidth()

> **setWidth**(`px`): `number`

Defined in: [table/ColumnHeader.ts:924](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L924)

Set this column's width, clamped to [ColumnHeader.getWidthBounds](#getwidthbounds).

The keyboard entry point for `Home` / `End` in column layout mode, and the
counterpart to [ColumnHeader.activateSort](#activatesort) for sizing.
`KeyboardNavigator` goes through here rather than calling
`actions.setColumnWidth` directly so the clamp stays in exactly one place
— the mouse drag applies the same bounds from the same resizer instance.

#### Parameters

##### px

`number`

Desired width in pixels, before clamping.

#### Returns

`number`

The width actually applied.

#### Example

```typescript
header.setWidth(9999); // → 500, the maximum
```

***

### update()

> **update**(): `void`

Defined in: [table/ColumnHeader.ts:788](https://github.com/jeyabbalas/data-table/blob/d7dc14d5255107ca0d96911117f7760d89b45432/src/table/ColumnHeader.ts#L788)

Update the sort button visual state based on current sort state

#### Returns

`void`
