# Filters

Every filter in `@jeyabbalas/data-table` is a plain JavaScript object matching
one of seven discriminated-union shapes. The filter panel uses this shape; so
does session persistence, filter presets, and the `actions.addFilter()` API.
Learn the shapes once and every other surface falls out.

## You'll learn how to

- Build each of the seven filter types programmatically
- Match list, struct and map values exactly, by their text
- Apply, update, remove, and clear filters via `table.actions`
- Attach a raw-SQL `WHERE` fragment
- Serialize filters to JSON and round-trip them back

## Prerequisites

- Read: [API reference — Filter types](../api-reference.md#filter-types), [API reference — `StateActions`](../api-reference.md#actions-methods)
- Runnable example: [`examples/03-programmatic-filters`](../../examples/03-programmatic-filters/)

## Minimal example

```ts
import { createDataTable } from '@jeyabbalas/data-table';

const table = await createDataTable({ container, source: '/data.csv' });

table.actions.addFilter({
  type: 'range',
  column: 'age',
  min: 18,
  max: 65,
  maxInclusive: true,
});
```

`addFilter` replaces any existing filter for the same column, so the table
never holds two filters of the same column at once — with one exception for
raw-SQL filters, which use synthetic column keys (see below).

## The seven filter types

Every filter has a `type` discriminator and a `column` field; the rest varies.

### 1. `range` — numeric or date ranges

```ts
{ type: 'range', column: 'price', min: 0, max: 100 }
{ type: 'range', column: 'price', min: 0, max: 100, maxInclusive: true }
{ type: 'range', column: 'price', min: 0, max: 100, minExclusive: true }
{ type: 'range', column: 'started_at', min: new Date('2024-01-01'), max: new Date('2025-01-01') }
{ type: 'range', column: 'duration', min: '1 day', max: '7 days', valueType: 'interval' }
```

- `min`/`max` accept `number | string | Date`. Pass `Date` for date/timestamp columns and `string` for intervals (with `valueType: 'interval'`).
- `maxInclusive` (default `false`) switches the upper bound from `<` to `<=`. Histogram brushes set this for the last bin.
- `minExclusive` (default `false`) switches the lower bound from `>=` to `>`.

### 2. `point` — exact match

```ts
{ type: 'point', column: 'status', value: 'active' }
{ type: 'point', column: 'count', value: 42 }
{ type: 'point', column: 'flag', value: true }
{ type: 'point', column: 'created_at', value: new Date('2024-06-01') }
{ type: 'point', column: 'owner', value: null }   // matches IS NULL
{ type: 'point', column: 'tags', value: '[red, green]', valueType: 'text' } // a list, by its text
```

- `valueType: 'text'` compares the column's text instead of its value; see
  [Matching nested values](#matching-nested-values).

### 3. `set` — value-in list

```ts
{ type: 'set', column: 'country', values: ['US', 'CA', 'MX'] }
{ type: 'set', column: 'country', values: ['US', 'CA'], includeNull: true }
```

- Generates `col IN (...)`. With `includeNull: true`, becomes `col IN (...) OR col IS NULL`.
- With `valueType: 'text'`, generates `CAST(col AS VARCHAR) IN (...)`.

### 4. `not-set` — value-not-in list

```ts
{ type: 'not-set', column: 'country', values: ['US'] }
{ type: 'not-set', column: 'country', values: ['US'], includeNull: true }
```

- Generates `col NOT IN (...)`. With `includeNull: true`, becomes `col NOT IN (...) OR col IS NULL` (includes NULL rows).
- With `valueType: 'text'`, generates `CAST(col AS VARCHAR) NOT IN (...)`.

### 5. `null` / `not-null` — presence check

```ts
{ type: 'null', column: 'email' }
{ type: 'not-null', column: 'email' }
```

### 6. `pattern` — string matching

```ts
{ type: 'pattern', column: 'name', pattern: 'Ana',    mode: 'contains' }
{ type: 'pattern', column: 'name', pattern: 'Dr. ',   mode: 'starts' }
{ type: 'pattern', column: 'email', pattern: '.gov',  mode: 'ends' }
{ type: 'pattern', column: 'id',   pattern: '^X[0-9]+$', mode: 'regex' }
```

- `contains` / `starts` / `ends` translate to `ILIKE` with escaped wildcards, so they ignore case.
- `regex` runs DuckDB's `regexp_matches` — full POSIX syntax minus backreferences and lookarounds.
- Every mode matches the column's text, `CAST(col AS VARCHAR)`, so a pattern works on numbers, dates and nested columns too.

### 7. `raw-sql` — custom WHERE fragment

Use `addRawSQLFilter` rather than constructing this by hand:

```ts
const id = table.actions.addRawSQLFilter(
  `price > 100 AND category IN ('A', 'B')`,
  'Expensive in A/B', // optional chip label
);
// Later:
table.actions.updateRawSQLFilter(id, `price > 200`, 'Very expensive');
table.actions.removeRawSQLFilter(id);
```

Each raw-SQL filter gets a UUID and a synthetic column key (`__raw_sql_<id>__`)
so multiple raw-SQL fragments can coexist without clobbering each other the
way same-column filters do.

Validate a fragment before applying it:

```ts
const { valid, matchCount, error } = await table.actions.validateSQLFilter(`price > 100`);
if (valid) {
  console.log(`${matchCount} rows would match`);
}
```

## Matching nested values

A nested column (`type: 'nested'`: a LIST, ARRAY, STRUCT, MAP, UNION or
VARIANT) is matched by its text, the text its cell shows. Point, set and
not-set filters take `valueType: 'text'` for this: it compares
`CAST(col AS VARCHAR)`, DuckDB's text for the value, with each value written
as a VARCHAR literal (`src/filters/FilterSQL.ts`). The filter panel's
"exact" mode sets it on nested columns and on JSON columns, and the pattern
modes always compare text.

```ts
// tags: VARCHAR[], a cell that reads [red, green]
table.actions.addFilter({
  type: 'point',
  column: 'tags',
  value: '[red, green]',
  valueType: 'text',
});

// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR), either of two values
table.actions.addFilter({
  type: 'set',
  column: 'point',
  values: ["{'x': 1.25, 'y': 0.58, 'tier': bronze}", "{'x': 2.0, 'y': 1.5, 'tier': gold}"],
  valueType: 'text',
});
```

Without it, DuckDB casts the text to the column's type. That works for a
list, struct or map while the text reads as one, and fails otherwise:

- Text that does not read as a list, struct or map is a Conversion Error,
  and every query of the grid fails with it until the filter is removed.
- A UNION matches only the member the text reads as: `'0'` finds the text
  `0`, not the integer `0`, though both cells show `0`.
- A VARIANT fails on a value of any other type, with an error such as
  `Can't compare values of type INTEGER (42) and type VARCHAR (42)`.

A JSON column is `'string'`, but compared as a value its text is read as
JSON, since DuckDB's json extension loads with any table that holds JSON:
any text that is not JSON (`abc`) is a Conversion Error (`Malformed JSON`),
which breaks the grid's queries the same way, and valid JSON matches only
its exact text (`{"a": 1}` does not match `{"a":1}`). So give an exact
filter on a JSON column `valueType: 'text'` too, as the filter panel does.
A filter saved before 0.9 has none: a session restore, in its filters and
its undo and redo entries, and `loadFilterPreset`, imported presets
included, give a point, set or not-set filter on a JSON column
`valueType: 'text'` when it has no `valueType` (`jsonFiltersAsText`,
`src/filters/jsonFilters.ts`). Compared as text, a JSON value matches the
rows it matched as JSON. `addFilter` changes nothing, a filter on a nested
column without `valueType` keeps comparing by value, and a derived JSON
column's restored filters stay as saved, since its type is known only once
its VIEW is rebuilt.

The text must match the cell's text exactly, spaces and quotes included:
DuckDB quotes a string inside only when it has to (`[a, b]` is two strings,
`['a, b']` one), and writes a map as `{key=value}`. A long cell shows only
its first items in the grid, `[1, 2, …, 32, … +968]`; the filter compares
the whole text. `null` (and `includeNull`) still tests `col IS NULL`.

`valueType` is kept by `serializeFilter`, sessions, presets and undo, which
tells a text filter from a value filter. On preset import, a range, point, set
or not-set filter whose `valueType` is not the one its type reads
(`'interval'` for a range, `'text'` for the others) is dropped, like a filter
of an unknown type, and the rest of the preset imports (a preset left with
no valid filter is skipped); a `valueType` on any other filter type is
ignored (`src/filters/FilterPresets.ts`).

A text comparison has DuckDB format every row's whole value in each query
the filter is in, which is every row block, the row count and every chart;
on a column of long lists or embeddings that is seconds a query (see
[Performance → Nested columns](../performance.md#nested-columns)). To filter
a field of a struct by its value, as a number or a date, add it as a column,
`table.actions.addNestedFieldColumn('point', ['x'])`, and filter that: it
gets a histogram and range filters of its own (see
[Derived columns → Nested columns](./derived-columns.md#nested-columns)).

## Applying, removing, clearing

`table.actions` exposes the write path:

```ts
table.actions.addFilter(filter); // add or replace same-column filter
table.actions.removeFilter('age'); // remove all filters on column
table.actions.removeFilter('age', 'range'); // remove only range filter on column
table.actions.clearFilters(); // remove all
```

Each call updates the `filters` signal, recomputes filtered row count, emits
`filterChange`, and captures an undo snapshot.

### Load multiple filters atomically

Use `loadFilterPreset` to replace everything in one undo step:

```ts
table.actions.loadFilterPreset(
  [
    { type: 'range', column: 'age', min: 18, max: 65 },
    { type: 'set', column: 'country', values: ['US', 'CA'] },
  ],
  [{ column: 'signup_date', direction: 'desc' }], // optional sort
);
```

Ctrl/Cmd-Z then restores the entire pre-load state atomically — not filter by
filter.

## Reading the current filter state

```ts
// Snapshot
const filters = table.state.filters.get();

// Computed WHERE clause as SQL (without the `WHERE` keyword)
const whereClause = table.actions.getFiltersSQL();

// Subscribe to changes
const unsub = table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(filters.length, 'filters →', filteredRowCount, 'rows');
});
```

While filters are active, every column header's stats line shows the same
`filtered / total rows` fraction, and columns whose own filter has a chart
representation additionally show what that filter alone matches — see
[Reading the column stats](./visualizations.md#reading-the-column-stats)
for the exact semantics.

## Serialization

Filters persist to IndexedDB (session restore) and to JSON (filter-preset
export). Dates round-trip as `{ __date__: ISO8601 }`:

```ts
// { type: 'range', column: 'started_at', min: new Date('2024-01-01'), max: new Date('2025-01-01') }
// serializes to:
// { type: 'range', column: 'started_at',
//   min: { __date__: '2024-01-01T00:00:00.000Z' },
//   max: { __date__: '2025-01-01T00:00:00.000Z' } }
```

If you roll your own storage, use the `serializeFilter` / `deserializeFilter`
helpers from `@jeyabbalas/data-table`. Don't `JSON.stringify` a
Date-containing filter directly — `Date` values survive but lose their type on
parse, and `includeNull` round-trips but the `__date__` marker is what
identifies dates.

## Recipes

### Apply multiple filters as one undo step

`addFilter` captures one undo snapshot per call, so two `addFilter` calls
produce two undo steps. To apply a whole set of filters in a single undo
step, use `loadFilterPreset` — it accepts a plain `Filter[]` and replaces
the current filters atomically:

```ts
table.actions.loadFilterPreset([
  { type: 'range', column: 'age', min: 18, max: 65 },
  { type: 'set', column: 'country', values: ['US'] },
]);
// One `filterChange` event, one undo step.
```

The same path is used internally when a named preset is loaded (see the
[filter presets guide](./filter-presets.md)). Pass an optional second
argument to replace the sort at the same time:
`loadFilterPreset(filters, sortColumns)`.

### Drive an external component from filter state

```ts
table.on('filterChange', ({ filters, filteredRowCount, totalRowCount }) => {
  document.getElementById('counter')!.textContent =
    `${filteredRowCount.toLocaleString()} of ${totalRowCount.toLocaleString()}`;
});
```

### Filter from a URL query string

```ts
const params = new URLSearchParams(location.search);
if (params.has('country')) {
  table.actions.addFilter({
    type: 'set',
    column: 'country',
    values: params.getAll('country'),
  });
}
```

## Gotchas

- **`addFilter` replaces per column.** Two `range` filters on `age` can't coexist — the second one wins. Use `raw-sql` if you need an `AND` across the same column.
- **`includeNull: true` adds `OR col IS NULL` to `not-set` filters.** That makes the filter _looser_, not tighter. Read it as "anything except these values, OR a NULL."
- **Regex patterns don't support backreferences or lookarounds.** DuckDB uses RE2-style semantics.
- **Date matching is exact.** `{ type: 'point', column: 'created_at', value: new Date(...) }` matches the exact timestamp including milliseconds. Use a `range` filter for day-granularity matching.
- **Raw-SQL filters aren't auto-validated.** The library will happily let you add a syntactically broken fragment; queries will then fail with `QueryError`. Call `validateSQLFilter()` first.
- **Clearing filters doesn't clear selection.** Selected rows persist across filter changes — they just get hidden when out of the filtered set.
- **Chips cut long values.** A filter chip shows each value, and a pattern, up to 60 characters, cut between graphemes with `…`; the chip's title holds each value whole. A set filter's chip and title both list its first three values and "N more", and an unlabeled raw-SQL filter's SQL is cut at 40 characters in both (`src/filters/FilterChip.ts`).
- **An exact filter on a nested or JSON column compares text.** Without `valueType: 'text'`, a point or set filter on a list, struct or map, or on a JSON column, can fail every grid query with a Conversion Error. The filter panel sets it for you; set it yourself in `addFilter`. See [Matching nested values](#matching-nested-values).

## Related

- Events: [Events guide — `filterChange`](./events.md)
- Filter presets: [Filter presets guide](./filter-presets.md) for save/load/export/import of named filter sets
- API reference: [Filter types](../api-reference.md#filter-types), [State actions](../api-reference.md#actions-methods)
- Source: `src/filters/FilterTypes.ts:8-179`, `src/core/Actions.ts` (`addFilter` … `getFiltersSQL`), `src/filters/FilterSQL.ts`
