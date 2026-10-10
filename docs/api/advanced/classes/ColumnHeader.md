[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / ColumnHeader

# Class: ColumnHeader

Defined in: [table/ColumnHeader.ts:130](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L130)

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

Defined in: [table/ColumnHeader.ts:148](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L148)

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

Defined in: [table/ColumnHeader.ts:974](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L974)

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

Defined in: [table/ColumnHeader.ts:1228](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1228)

Destroy the column header and clean up resources

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [table/ColumnHeader.ts:1192](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1192)

Get the column schema

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### getControls()

> **getControls**(): `HTMLElement`[]

Defined in: [table/ColumnHeader.ts:1155](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1155)

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

Defined in: [table/ColumnHeader.ts:1221](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1221)

Get the derived column icon button (null for non-derived columns).

#### Returns

`HTMLElement` \| `null`

***

### getElement()

> **getElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1185](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1185)

Get the DOM element

#### Returns

`HTMLElement`

***

### getStatsElement()

> **getStatsElement**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1214](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1214)

Get the stats element for external updates (e.g., histogram hover).

#### Returns

`HTMLElement`

***

### getVizContainer()

> **getVizContainer**(): `HTMLElement`

Defined in: [table/ColumnHeader.ts:1207](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1207)

Get the visualization container element.
This is where Phase 4 visualizations will be rendered.

#### Returns

`HTMLElement`

***

### getWidth()

> **getWidth**(): `number`

Defined in: [table/ColumnHeader.ts:1066](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1066)

The current width of this column, in pixels: the width the table lays it
out at.

Reads `columnWidths` rather than the element, so it reports the state the
next resize step will build on even before layout has flushed. Resolved
by the table's column layout, as the renderer resolves it: rounded to a
whole pixel, and the column's default width when it has never been sized
or its stored width is not a finite, non-negative number. The default
follows the column's entry in the table's `schema`: 168px for a nested or
JSON column, 150px for any other, and for a column the schema does not
have.

#### Returns

`number`

#### Example

```typescript
header.getWidth(); // → 168 for an unsized `VARCHAR[]` column
```

***

### getWidthBounds()

> **getWidthBounds**(): `object`

Defined in: [table/ColumnHeader.ts:1083](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1083)

The clamp bounds a width change is held to: 50 / 500, the range the
resize handle drags within.

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

Defined in: [table/ColumnHeader.ts:1199](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1199)

Check if the header has been destroyed

#### Returns

`boolean`

***

### resizeBy()

> **resizeBy**(`deltaPx`): `number`

Defined in: [table/ColumnHeader.ts:1126](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1126)

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

Defined in: [table/ColumnHeader.ts:996](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L996)

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

Defined in: [table/ColumnHeader.ts:1104](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L1104)

Set this column's width, clamped to [ColumnHeader.getWidthBounds](#getwidthbounds).

The keyboard entry point for `Home` / `End` in column layout mode, and the
counterpart to [ColumnHeader.activateSort](#activatesort) for sizing.
`KeyboardNavigator` goes through here rather than calling
`actions.setColumnWidth` directly so the clamp stays in one place: the
bounds are the ones the resize handle drags within.

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

Defined in: [table/ColumnHeader.ts:911](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/table/ColumnHeader.ts#L911)

Update the sort button visual state based on current sort state

#### Returns

`void`
