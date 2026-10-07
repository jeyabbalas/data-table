[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CellRenderer

# Class: CellRenderer

Defined in: [table/Cell.ts:113](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/table/Cell.ts#L113)

CellRenderer handles formatting and rendering of cell values.

## Example

```typescript
const renderer = new CellRenderer({ classPrefix: 'dt' });

// Render a cell
renderer.render(cellElement, 1234567, { type: 'integer', name: 'count', nullable: false, originalType: 'INTEGER' });

// Just format a value
const formatted = renderer.formatValue(1234567, 'integer');
// Returns: "1,234,567"
```

## Constructors

### Constructor

> **new CellRenderer**(`options?`): `CellRenderer`

Defined in: [table/Cell.ts:117](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/table/Cell.ts#L117)

#### Parameters

##### options?

[`CellOptions`](../interfaces/CellOptions.md) = `{}`

#### Returns

`CellRenderer`

## Methods

### formatValue()

> **formatValue**(`value`, `type?`, `originalType?`): `string`

Defined in: [table/Cell.ts:192](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/table/Cell.ts#L192)

Format a value to string based on its data type.

#### Parameters

##### value

`unknown`

The value to format

##### type?

[`DataType`](../../index/type-aliases/DataType.md)

The data type (optional)

##### originalType?

`string`

The original DuckDB type (optional, used for TIMESTAMPTZ detection)

#### Returns

`string`

Formatted string representation

***

### render()

> **render**(`cellEl`, `value`, `schema?`): `void`

Defined in: [table/Cell.ts:129](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/table/Cell.ts#L129)

Render a value into a cell element with appropriate formatting and styling.

#### Parameters

##### cellEl

`HTMLElement`

The cell DOM element to update

##### value

`unknown`

The value to render

##### schema?

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Optional column schema for type-aware formatting

#### Returns

`void`

***

### setInspectable()

> **setInspectable**(`cellEl`, `inspectable`): `void`

Defined in: [table/Cell.ts:170](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/table/Cell.ts#L170)

Mark a cell as one the value inspector opens, or unmark it: the
`-cell--inspectable` class, which shows the inspect icon (drawn by the
stylesheet, no element of its own) on hover and on the cursor, and
`aria-haspopup="dialog"` with `aria-keyshortcuts="F2"`, which tell
assistive technology that the cell opens a dialog and how.

For the non-NULL values of nested and JSON columns
(`isInspectableColumn`). A cell is reused across rows and columns, so
every render says which it is now; nothing is written unless that
changes, since this runs for every cell of every render.

#### Parameters

##### cellEl

`HTMLElement`

##### inspectable

`boolean`

#### Returns

`void`

#### Example

```typescript
renderer.setInspectable(cellEl, value != null && isInspectableColumn(column));
```
