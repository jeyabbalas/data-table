[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:107](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L107)

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

Defined in: [table/ColumnHeader.ts:125](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L125)

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

Defined in: [table/ColumnHeader.ts:875](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L875)

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

Defined in: [table/ColumnHeader.ts:1155](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1155)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:1119](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1119)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getControls()

> **getControls**(): `HTMLElement`[]

Defined in: [table/ColumnHeader.ts:1084](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1084)

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

Defined in: [table/ColumnHeader.ts:1148](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1148)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1112](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1112)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1141](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1141)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1134](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1134)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### getWidth()

> **getWidth**(): `number`

Defined in: [table/ColumnHeader.ts:995](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L995)

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

Defined in: [table/ColumnHeader.ts:1012](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1012)

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

Defined in: [table/ColumnHeader.ts:1126](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1126)

Check if the header has been destroyed

#### Returns

`boolean`

***

### refreshAnnotations()

> **refreshAnnotations**(): `void`

Defined in: [table/ColumnHeader.ts:944](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L944)

Re-apply this column's annotation classes from the shared store.

#### Returns

`void`

***

### refreshFilterIndicator()

> **refreshFilterIndicator**(): `void`

Defined in: [table/ColumnHeader.ts:929](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L929)

Re-read `filtersByColumn` into the filter indicator.

#### Returns

`void`

***

### refreshHideButtonState()

> **refreshHideButtonState**(`visibleColumns`): `void`

Defined in: [table/ColumnHeader.ts:938](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L938)

Re-read the visible set into the hide button, which is disabled while it
would take the last visible column away.

#### Parameters

##### visibleColumns

`string`[]

#### Returns

`void`

***

### refreshPinState()

> **refreshPinState**(): `void`

Defined in: [table/ColumnHeader.ts:923](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L923)

Re-read `pinnedColumns` into the pin button.

#### Returns

`void`

***

### refreshStatsLine()

> **refreshStatsLine**(`totalRows`): `void`

Defined in: [table/ColumnHeader.ts:917](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L917)

Re-read `totalRows` into the stats line. See [update](#update) for sort.

#### Parameters

##### totalRows

`number`

#### Returns

`void`

***

### refreshTooltip()

> **refreshTooltip**(): `void`

Defined in: [table/ColumnHeader.ts:950](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L950)

Re-apply the app-set column-header tooltip override.

#### Returns

`void`

***

### resizeBy()

> **resizeBy**(`deltaPx`): `number`

Defined in: [table/ColumnHeader.ts:1055](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1055)

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

### setCellIdentity()

> **setCellIdentity**(`cellId`, `colIndex?`): `void`

Defined in: [table/ColumnHeader.ts:977](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L977)

Re-key the header's cell identity after the column set or order changed.

Both values are positions, not properties of the column: `cellId` encodes
the column's index in `visibleColumns`, which is what
`aria-activedescendant` is published against, and `colIndex` is its
position in the presented table. Hiding, showing or moving *another*
column shifts both without this column changing at all.

Exists because the header row is reconciled rather than rebuilt. A
surviving header keeps its element — and with it its chart, its listeners
and any popover anchored inside it — so the two positional attributes have
to be patched on the node instead of arriving with a new one.

#### Parameters

##### cellId

`string`

the element `id`, from `TableContainer`'s id scheme.

##### colIndex?

`number`

1-based `aria-colindex`; omit to remove the attribute.

#### Returns

`void`

#### Example

```typescript
header.setCellIdentity('dt-t1-a1b2-colheader-4', 7);
```

***

### setLayoutMode()

> **setLayoutMode**(`active`): `void`

Defined in: [table/ColumnHeader.ts:897](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L897)

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

Defined in: [table/ColumnHeader.ts:1033](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L1033)

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

Defined in: [table/ColumnHeader.ts:816](https://github.com/jeyabbalas/data-table/blob/133b3883f711821391a3bdfe7775ae1fecbf59c3/src/table/ColumnHeader.ts#L816)

Update the sort button visual state based on current sort state

#### Returns

`void`
