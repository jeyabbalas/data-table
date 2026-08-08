[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / CellRenderer

# Class: CellRenderer

Defined in: [table/Cell.ts:66](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/Cell.ts#L66)

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

Defined in: [table/Cell.ts:70](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/Cell.ts#L70)

#### Parameters

##### options?

[`CellOptions`](../interfaces/CellOptions.md) = `{}`

#### Returns

`CellRenderer`

## Methods

### formatValue()

> **formatValue**(`value`, `type?`, `originalType?`): `string`

Defined in: [table/Cell.ts:114](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/Cell.ts#L114)

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

Defined in: [table/Cell.ts:82](https://github.com/jeyabbalas/data-table/blob/202bb18cfb6d02428199c4d678c7470f96aafbb7/src/table/Cell.ts#L82)

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
