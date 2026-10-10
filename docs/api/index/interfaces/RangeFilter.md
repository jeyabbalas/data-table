[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / RangeFilter

# Interface: RangeFilter

Defined in: [filters/FilterTypes.ts:14](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L14)

Range (`min` ≤ x ≤ `max` by default) filter on a numeric, date, time or
interval column. Bounds may be widened to strict comparisons via `maxInclusive` /
`minExclusive`. Constructed by histogram brushing or explicit
`actions.addFilter({ type: 'range', … })` calls.

## Properties

### column

> **column**: `string`

Defined in: [filters/FilterTypes.ts:16](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L16)

***

### max

> **max**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:18](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L18)

***

### maxInclusive?

> `optional` **maxInclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:20](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L20)

When true, upper bound uses <= instead of <. Used for last histogram bin.

***

### min

> **min**: `string` \| `number` \| `Date`

Defined in: [filters/FilterTypes.ts:17](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L17)

***

### minExclusive?

> `optional` **minExclusive?**: `boolean`

Defined in: [filters/FilterTypes.ts:22](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L22)

When true, lower bound uses > instead of >=. Used for strict greater-than filters.

***

### type

> **type**: `"range"`

Defined in: [filters/FilterTypes.ts:15](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L15)

***

### valueType?

> `optional` **valueType?**: `"time"` \| `"interval"`

Defined in: [filters/FilterTypes.ts:49](https://github.com/jeyabbalas/data-table/blob/ac5bb533331dd55455eabfbe6b04bd3e445a1049/src/filters/FilterTypes.ts#L49)

How the bounds are compared. Left out, they are compared with the
column's value: `"col" >= '…'`.

`'interval'` writes them as INTERVAL literals: `"col" >= INTERVAL '1 day'`.

`'time'` compares the column's time of day, `CAST("col" AS TIME)`, with
the bounds as text (`'01:30:00'`). This is how a TIME WITH TIME ZONE
column is compared by its time as written, `01:30:00+05:30` as 01:30, the
way its chart places it. Compared as TIME WITH TIME ZONE, a bound takes
the offset of DuckDB's session time zone and rows compare by instant, so
a range can miss rows whose time of day lies inside it. The chart's brush
and the filter panel set it on TIME WITH TIME ZONE columns. Do not set it
on a TIME_NS column: the cast rounds to microseconds, so
`23:59:59.9999999` becomes `24:00:00`.

#### Example

```ts
// A TIME WITH TIME ZONE column, from 01:30 up to 06:00 as written
table.actions.addFilter({
  type: 'range',
  column: 'pickup_time',
  min: '01:30:00',
  max: '06:00:00',
  valueType: 'time',
});
```
