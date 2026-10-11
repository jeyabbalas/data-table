[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / AnnotatedFilter

# Interface: AnnotatedFilter

Defined in: [filters/FilterTypes.ts:224](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L224)

Keeps the rows that have annotations: the rows with a row-scope or a
cell-scope annotation in `table.annotations`, of the severities
[AnnotatedFilter.severities](#severities) names. A column-scope annotation singles
out no row, so it keeps none.

`actions.showAnnotatedRows()` adds one and `actions.hideAnnotatedRows()`
removes it. There is at most one, as every annotated filter has the same
synthetic column key, `'__annotated__'`. The rows it keeps follow the
annotations: adding or removing one while the filter is on updates the
view in place, keeping its scroll position and the cursor on its row, and
fires `filterChange` with the same filters and the new count. A change
that keeps the same rows, such as an edited message or another severity
on a row already kept, leaves the view as it is. The severity filter
(`annotations.setSeverityFilter`) changes which tints show, not which
rows this keeps.

It reads a DuckDB table of the annotated rows that the table keeps for
it, named from [AnnotatedFilter.table](#table): `filtersToWhereClause`
writes it as `"__rowid__" IN (SELECT "__rowid__" FROM …)`, which works on
the base table and on its derived-column view alike.

## Example

```ts
table.actions.showAnnotatedRows({ severities: ['error', 'warning'] });
table.state.filters.get();
// [{ type: 'annotated', column: '__annotated__', severities: ['error', 'warning'], table: 'orders' }]
```

## Properties

### column

> **column**: `"__annotated__"`

Defined in: [filters/FilterTypes.ts:227](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L227)

Synthetic key, the same for every annotated filter: it filters no column.

***

### severities?

> `optional` **severities?**: [`AnnotationSeverity`](../type-aliases/AnnotationSeverity.md)[]

Defined in: [filters/FilterTypes.ts:232](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L232)

The severities whose annotations keep a row. Left out or empty, an
annotation of any severity does.

***

### table?

> `optional` **table?**: `string`

Defined in: [filters/FilterTypes.ts:240](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L240)

The base table whose annotated rows the filter keeps: the DuckDB table
the data loaded into, not a derived-column view. `actions.addFilter`
sets it to the table's own, and so do a session restore and a preset
load, so a filter written by hand can leave it out. Without it the
filter keeps no row.

***

### type

> **type**: `"annotated"`

Defined in: [filters/FilterTypes.ts:225](https://github.com/jeyabbalas/data-table/blob/f341ce9574a9180901176a8c58861b6a8be8af5e/src/filters/FilterTypes.ts#L225)
