# Migration: v0.8 → v0.9

> `0.9` reads lists, arrays, structs, maps, unions and VARIANT columns as
> nested values rather than as text. They get a column type of their own, a
> summary chart, a value inspector, an extract-to-column panel, exact reads
> and JSON exports. Most integrations upgrade with a version bump. Code that
> registers charts or stats panels by column type, reads values with
> `getColumnValues`, reads dates from CSV or JSON exports, serves the worker
> script itself, or still calls `VisualizationFactory` needs a look.

**Released:** with `0.9.0` — see the [CHANGELOG](../../CHANGELOG.md) for the date.
**Affected versions:** from `v0.8.*`
**Migration difficulty:** mechanical for most projects; manual review where
code reads MAP or UNION values or exported dates, or where the worker script
or DuckDB's extensions are served from your own host.

## Summary

In `0.8` a nested column fell through to `type: 'string'`. The grid showed
`[object Object]` for a struct, a list column left rows loading for good, and
the charts grouped lists and structs by their text. `0.9` gives these columns
`type: 'nested'` and reads their values exactly.

These changes can break an integration:

1. A custom visualization or stats panel registered for `'string'` no longer
   receives nested columns, nor `TIME_NS` columns, which are now `'time'`.
2. `getColumnValues` returns MAP, UNION, `TIME WITH TIME ZONE` and `TIME_NS`
   values in new forms.
3. A self-hosted copy of the worker script must be replaced, and an offline
   deployment with nested data must serve DuckDB's `json` extension.
4. CSV, JSON and clipboard exports write dates and times as ISO 8601 text,
   not epoch numbers.
5. `VisualizationFactory`, deprecated since `0.3.1`, is removed from
   `/advanced`.

An integration that does none of these upgrades with a version bump. The
rest of the release, the value inspector and `getCellValue` among it, is new
API; see the [CHANGELOG](../../CHANGELOG.md) and the
[loading guide](../guides/loading-data.md#nested-and-json-columns).

## Breaking changes

### 1. Nested and `TIME_NS` columns have types of their own

**What changed.** `DataType` gains `'nested'`. A LIST (`INTEGER[]`), a
fixed-size ARRAY (`FLOAT[768]`), a STRUCT, a MAP, a UNION or a VARIANT column
loads with `ColumnSchema.type` `'nested'`; `0.8` gave it `'string'`.
`ColumnSchema.originalType` still holds the DuckDB type. A `JSON` column stays
`'string'`. A `TIME_NS` column loads as `'time'`; `0.8` gave it `'string'`
too. No other type moves.

What the table picks by type follows:

- A nested column's chart is `NestedSummaryVisualization` (the default
  registry's `nested-summary` entry, priority 0), a bar of its non-null and
  null shares; `0.8` drew `ValueCounts`. A `TIME_NS` column gets the time
  histogram.
- `isCategoricalType` (from `/advanced`) is `false` for a nested column, and
  `isNestedType` is `true`.
- A nested column's chart reports `NestedColumnStats` (`kind: 'nested'`), a
  new member of `ColumnStatsData`; `statsKindForDataType('nested')` is
  `'nested'`.

**Who is affected.**

- A custom visualization or stats panel whose `isApplicable` accepts
  `'string'`, or is `isCategoricalType`. It no longer receives these columns.
  If it was meant for text, there is nothing to do: nested columns get the
  built-in summary. If it handled lists or structs too, accept `'nested'`.
- Code that reads `ColumnSchema.type` to choose a renderer, a formatter or a
  filter, and expected `'string'` for these columns.
- TypeScript code that switches over `DataType`, or over a stats panel's
  `stats.kind`, with an exhaustive `never` check: it does not compile until it
  has a `'nested'` case.

**Why.** Every nested type mapped to `'string'` by accident, and `TIME_NS` the
same way, so lists and structs were filtered, charted and summarized as text.
The value counts grouped a 200,000-row `FLOAT[768]` column by its text for
18 to 21 s, with the worker, and so the grid, frozen meanwhile.

**Before**

```ts
import { VisualizationRegistry } from '@jeyabbalas/data-table';

const registry = new VisualizationRegistry();
// In 0.8 this also received every list, struct and map column.
registry.register({
  name: 'word-cloud',
  isApplicable: (type) => type === 'string',
  constructor: WordCloud,
  priority: 10,
});
```

**After**

```ts
import { VisualizationRegistry, type ColumnSchema } from '@jeyabbalas/data-table';
import { isNestedType, parseDuckDBType } from '@jeyabbalas/data-table/advanced';

const registry = new VisualizationRegistry();
// Text only: leave it as it was. Nested columns too:
registry.register({
  name: 'word-cloud',
  isApplicable: (type) => type === 'string' || isNestedType(type),
  constructor: WordCloud,
  priority: 10,
});

// In the chart, tell the kinds apart by the DuckDB type:
function nestedKind(column: ColumnSchema) {
  return parseDuckDBType(column.originalType).kind; // 'list', 'struct', 'map', 'variant', …
}
```

The same goes for a `StatsPanelRegistry` registration; see
[Visualizations → Nested columns](../guides/visualizations.md#nested-columns)
and [Stats panels → Nested columns](../guides/stats-panels.md#nested-columns).
At a priority above 0, a registration that accepts `'nested'` replaces the
built-in summary: a chart that groups values, as `ValueCounts` does, is slow
on wide values such as embeddings.

**Automated migration.** `N/A — manual review required because only you know
whether a 'string' registration meant text, or anything that is not a number
or a date.` Grep for `isApplicable`, `isCategoricalType` and `.type ===
'string'`.

### 2. `getColumnValues` returns MAP, UNION and time values in new forms

**What changed.** `actions.getColumnValues` reads every value exactly: a
nested column as exact JSON text, which it turns into JS values by the
column's type, the way the new `actions.getCellValue` does. Several types
come back in a new form:

| Column, or value                                                 | `0.8`                                              | `0.9`                                 |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `MAP`                                                            | a plain object, `{ k1: 1 }`                        | a `Map`, keys typed and in order      |
| `UNION`                                                          | the member's value, `5`                            | `{ [tag]: value }`, `{ num: 5 }`      |
| `TIME WITH TIME ZONE`                                            | microseconds since midnight, offset dropped        | DuckDB's text, `'14:05:06+05:30'`     |
| `TIME_NS`                                                        | nanoseconds since midnight                         | DuckDB's text, `'03:04:05.123456789'` |
| an integer inside a nested value, past ±(2^53 − 1)               | a number, rounded                                  | a `bigint`                            |
| `UINTEGER` past 2^31 − 1                                         | an `Int32Array`, the value negative                | an `unknown[]` of numbers             |
| `UBIGINT`, `HUGEINT`, `UHUGEINT` outside the signed 64-bit range | a `BigInt64Array`, the value rounded, then wrapped | an `unknown[]` of numbers and bigints |

`BIGINT` values keep every digit in their `BigInt64Array`, a `DECIMAL` is the
double nearest its value, and `ENUM`, `INTERVAL`, `BIT`, `BIGNUM` and
`GEOMETRY` values are DuckDB's text. A list column, which hung in `0.8`, comes
back as arrays.

CSV, JSON and clipboard exports change in the same way for a UNION, which
they write as `{"tag": value}`, and for `TIME WITH TIME ZONE` and `TIME_NS`,
which they write as DuckDB's text; dates and times change too, see
[§4](#4-exports-write-dates-and-times-as-iso-8601-text). A file a downstream
job reads may change for those columns; see
[Loading data → Exporting](../guides/loading-data.md#exporting).

**Who is affected.** Code that reads a MAP, UNION, `TIME WITH TIME ZONE` or
`TIME_NS` column with `getColumnValues`; code that passes values from a nested
column to `JSON.stringify`, which writes a `Map` as `{}` and throws on a
`bigint`; and code that assumes a `BIGINT`-family column always comes back as
a `BigInt64Array`.

**Why.** `0.8` returned values as Arrow carries them, and Arrow gets many of
them wrong: a `DECIMAL` inside a struct read as `6.2e-322` for `1.25`, `ENUM`
values as `null`, a `BIGINT` past 2^53 rounded, and a VARIANT column failed
the query. A MAP lost its key types and a UNION its tag. Each type is now read
in a form that crosses exactly.

**Before**

```ts
// attrs: MAP(VARCHAR, INTEGER); u: UNION(num INTEGER, str VARCHAR)
const attrs = await table.actions.getColumnValues('attrs');
(attrs[0] as Record<string, number>).k1; // 1

const u = await table.actions.getColumnValues('u');
u[0]; // 5
```

**After**

```ts
const attrs = (await table.actions.getColumnValues('attrs')) as (Map<string, number> | null)[];
attrs[0]?.get('k1'); // 1
JSON.stringify(attrs.map((m) => (m ? Object.fromEntries(m) : null))); // a Map alone writes {}

const u = (await table.actions.getColumnValues('u')) as (Record<string, unknown> | null)[];
u[0]; // { num: 5 }
const member = u[0] ? Object.values(u[0])[0] : null; // 5
```

See [Loading data → Reading values](../guides/loading-data.md#reading-values)
and the
[API reference](../api-reference.md#column-values-read-only-export).

**Automated migration.** `N/A — manual review required because the change
depends on the column's DuckDB type, which only the data says.` Grep for
`getColumnValues(` and check the type of each column it reads.

### 3. Self-hosted workers and offline deployments

**What changed.** Two things a deployment serves have changed.

- **The worker script.** The main thread now posts a Parquet `File` or `Blob`
  to the worker as it is, which a `0.8` worker file cannot read: every Parquet
  load from a `File`, a `Blob` or a URL fails. The fixes to `bridge.query`
  results (list values, which hung, STRUCT and MAP values, ENUMs, a column
  named `__proto__`) are in the worker too, and so is the load of DuckDB's
  `json` extension with a Parquet source that holds JSON.
- **DuckDB's `json` extension.** `getCellValue` and `getColumnValues` on a
  nested column, the value inspector, and CSV, JSON and clipboard exports
  that include a nested column read its values as JSON, through the `json`
  extension. DuckDB-WASM fetches it from its extension repository
  (`extensions.duckdb.org`) the first time a query needs it. `0.8` read those
  values as Arrow carries them, without the extension.

**Who is affected.**

- An app that serves the worker script from a copy of its own, through
  `bridgeOptions.workerUrl` or `bridgeOptions.workerFactory`. An app that
  lets its bundler emit the worker from the package, the default, gets the
  new one with the upgrade.
- An app whose data has nested columns and whose page cannot reach DuckDB's
  extension repository: a CSP whose `connect-src` leaves it out, an intranet,
  or an offline or packaged app. There those reads and exports fail with
  DuckDB's error.

**Why.** The worker file is part of the version: it holds the Parquet loader
and the code that turns DuckDB's results into rows. Reading nested values as
JSON is what makes them exact, and `to_json` lives in the `json` extension.

**Before / After.** Copy the worker file of the version you install, and
mirror the extension where the page cannot fetch it:

```ts
import { WorkerBridge, createDataTable } from '@jeyabbalas/data-table';

const bridge = new WorkerBridge({
  // Copy node_modules/@jeyabbalas/data-table/dist/assets/worker-*.js here on every upgrade.
  workerUrl: '/static/data-table-worker.js',
  duckdbBundles,
});
await bridge.initialize();
// Offline or under a strict CSP: the json and parquet extensions, mirrored.
await bridge.query(
  "SET custom_extension_repository = 'https://intranet.example/duckdb-extensions'",
);
const table = await createDataTable({ container, source, bridge });
```

See
[CSP and offline → DuckDB extensions](../guides/csp-and-offline.md#duckdb-extensions-parquet-and-json).

**Automated migration.** `None — copy the worker file in the build or deploy
step, from the installed package, so that it changes with every upgrade.`

### 4. Exports write dates and times as ISO 8601 text

**What changed.** CSV, JSON and clipboard exports write `DATE`, `TIME`,
`TIMESTAMP` and `TIMESTAMP WITH TIME ZONE` columns as text, every digit kept
and trailing zeros dropped. JSON puts `T` between date and time; CSV and the
clipboard put a space, so a `DATE` or `TIMESTAMP` is in the form spreadsheets
read.

| Column                     | `0.8`                                                                | `0.9` JSON                        | `0.9` CSV and clipboard                      |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| `DATE`                     | `1704153600000`                                                      | `"2024-01-02"`                    | `2024-01-02`                                 |
| `TIME`                     | `11045500000` (µs since midnight)                                    | `"03:04:05.5"`                    | `03:04:05.5`                                 |
| `TIMESTAMP`                | `1704164645123.456`                                                  | `"2024-01-02T03:04:05.123456"`    | `2024-01-02 03:04:05.123456`                 |
| `TIMESTAMP_NS`             | `1704164645123.4568`, nanoseconds lost                               | `"2024-01-02T03:04:05.123456789"` | `2024-01-02 03:04:05.123456789`              |
| `TIMESTAMP WITH TIME ZONE` | `1704164645500`                                                      | `"2024-01-02T03:04:05.5Z"`        | `2024-01-02 03:04:05.5Z`                     |
| `infinity`                 | `185542587100800000` for a `DATE`; most timestamps failed the export | `"infinity"`, `"-infinity"`       | `infinity`, `'-infinity` (the formula guard) |
| a date before year 1       | a negative number, `-63517824000000`                                 | `"0044-03-15 (BC)"`               | `0044-03-15 (BC)`                            |

A `TIMESTAMP WITH TIME ZONE` is written in UTC, whatever time zone the table
was loaded in, and keeps its `Z`, which some spreadsheets show as text; a
`TIMESTAMP` has no zone and is written without one. Dates inside a nested
value were DuckDB's text already, and still are. Parquet
export still writes dates natively, and `getColumnValues`, `getCellValue` and
`bridge.query` still read a date or timestamp as epoch milliseconds.

**Who is affected.** Code and pipelines that read a CSV or JSON export, or
pasted rows, and treat a date column as a number: `new Date(row.created_at)`
on a number, `pd.to_datetime(df.created_at, unit='ms')`, a downstream column
typed `BIGINT`.

**Why.** Epoch numbers showed as meaningless numbers in a spreadsheet,
rounded a `TIMESTAMP_NS` value's nanoseconds away, and could not tell a
`TIMESTAMP` from a `TIMESTAMP WITH TIME ZONE`. Most timestamps holding
`infinity` failed the whole export.

**Before**

```ts
const [row] = JSON.parse(await exportToJSON(name, { scope: 'all' }, context));
new Date(row.created_at); // TIMESTAMP: epoch milliseconds
```

**After**

```ts
const [row] = JSON.parse(await exportToJSON(name, { scope: 'all' }, context));
// A TIMESTAMP has no zone, and JavaScript reads a date and time without one
// as local time. Append 'Z' to read it as UTC, as 0.8's numbers were:
new Date(`${row.created_at}Z`);
new Date(row.seen_at); // a TIMESTAMP WITH TIME ZONE ends in 'Z' already
```

JavaScript's `Date` gives an Invalid Date for `infinity` and for a year past
9999, and misreads a BC date: `new Date('0044-03-15 (BC) 10:00:00Z')` is
2044-03-15. Check for `infinity` and `(BC)` before parsing where a column may
hold them. For ordinary values, pandas reads the CSV with
`pd.read_csv(path, parse_dates=['created_at'])`, and DuckDB's `read_csv` and
`read_json` read them as dates and times. A column holding `infinity`,
`'-infinity` (CSV's formula guard), a BC date or a five-digit year may load
as text or another type, and `read_json` can read `infinity` as
`1900-01-01`.

**Automated migration.** `N/A — manual review required because only you know
which readers of the files expect numbers.` Grep for `exportToCSV`,
`exportToJSON`, `exportFromState`, `exportJSONFromState`,
`copyRowsToClipboard` and `unit='ms'`.

### 5. `VisualizationFactory` is removed

**What changed.** `@jeyabbalas/data-table/advanced` no longer exports the
static `VisualizationFactory` class, and nothing logs its deprecation warning.
Deprecated since `0.3.1`, it forwarded each call to
`defaultVisualizationRegistry`, a root export with every one of its methods:
`register`, `unregister`, `create`, `isApplicable`, `getRegisteredTypes` and
`resetToDefaults`. The type predicates (`isNumericType`, `isDateType`, …,
`needsVisualization`) stay on `/advanced`.

**Who is affected.** Code that imports `VisualizationFactory`. TypeScript and
bundlers report the missing export; a browser that loads the module natively,
from a CDN for example, stops with a `SyntaxError`.

**Why.** The wrapper added nothing: each call went to
`defaultVisualizationRegistry`, which code can call directly, and a
`VisualizationRegistry` of a table's own keeps a custom chart off the page's
other tables.

**Before**

```ts
import { VisualizationFactory, isNumericType } from '@jeyabbalas/data-table/advanced';

VisualizationFactory.register({
  name: 'box-plot',
  isApplicable: isNumericType,
  constructor: BoxPlot,
  priority: 10,
});
```

**After**

A registry of your own scopes the chart to the tables you pass it to:

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { isNumericType } from '@jeyabbalas/data-table/advanced';

const visualizationRegistry = new VisualizationRegistry();
visualizationRegistry.register({
  name: 'box-plot',
  isApplicable: isNumericType,
  constructor: BoxPlot,
  priority: 10,
});
await createDataTable({ container, source, visualizationRegistry });
```

`defaultVisualizationRegistry`, a root export, is the drop-in equivalent of
the factory:

```ts
import { defaultVisualizationRegistry } from '@jeyabbalas/data-table';
import { isNumericType } from '@jeyabbalas/data-table/advanced';

defaultVisualizationRegistry.register({
  name: 'box-plot',
  isApplicable: isNumericType,
  constructor: BoxPlot,
  priority: 10,
});
```

A registration on the default registry reaches every table on the page that
has no registry of its own, as the factory's did. See
[Visualizations → Per-instance registry](../guides/visualizations.md#per-instance-registry).

**Automated migration.** Replace `VisualizationFactory.` with
`defaultVisualizationRegistry.`, which keeps the factory's page-wide
behaviour, then import `defaultVisualizationRegistry` from
`@jeyabbalas/data-table` where `VisualizationFactory` came from `/advanced`;
TypeScript flags each import left. In the command, `src` stands for wherever
the app's source lives: `.` would also rewrite `node_modules`.

```sh
grep -rlw --null VisualizationFactory src | xargs -0 perl -pi -e 's/\bVisualizationFactory\./defaultVisualizationRegistry./g'
```

## Non-breaking but recommended

- **Give exact filters you add in code on nested or JSON columns
  `valueType: 'text'`.** Without it, DuckDB casts the value to the column's
  type, and text that does not read as one (`'[red'` for a `VARCHAR[]`, text
  that is not JSON for a `JSON` column) is a Conversion Error that fails every
  grid query until the filter goes. The filter panel sets it, and a filter on
  a JSON column restored from a session or loaded from a preset gets it. See
  [Filters → Matching nested values](../guides/filters.md#matching-nested-values).
- **Translate the new strings.** `messages.values` is new: the nested type
  names, the value inspector, the extract panel and `panelLoadFailed`.
  `messages.statistics` gains `nonNullCategory`, `chartFailed` and `noData`.
  Left out, they are English; code that builds a complete `Strings` object
  must add them to compile. See
  [i18n → Nested column types](../guides/i18n.md#nested-column-types).
- **Check derived column names that differ only in letter case.** Adding,
  renaming and extracting refuse a derived column named as another column in
  any letter case, `LABEL` beside `label`, since DuckDB reads `"LABEL"` as
  `label`, and so do a session restore, an undo and a redo. A `0.8` session
  that holds one loses that column on restore, with a console warning coded
  `DUPLICATE_NAME`, and its filters, sort and layout go with it.
- **Expect `unnest` and bare aggregates to be refused.** A derived column
  must give one value per row, so `addDerivedColumn` resolves
  `{ success: false, error }` for `unnest(tags)` or `sum(price)`, and the
  error says what to write instead: a list function such as `list_transform`,
  or a window, `sum(price) OVER ()`. See
  [Derived columns → Validation](../guides/derived-columns.md#validation).
- **Look up header buttons, body cells, charts and stats panels near the
  view only.** On a wide table a column's sort, filter, pin and hide buttons
  (`ColumnHeader.getControls()` included), its body cells, its chart and its
  custom stats panel exist while the column is near the view, and a custom
  chart or panel is destroyed when its column moves away. `getStatsElement()`
  and `getVizContainer()` still answer for every column.
- **Don't assume an unsized column is 150 px wide.** A nested or JSON column
  without a width of its own is 168 px wide, so at the default 16 px root font
  its six header controls fit with room between them; every other column stays
  150 px. Widths set by resizing, by `setColumnWidth` or in a saved session
  are kept. Code that places columns by multiples of 150 px, or screenshot
  tests of tables with nested or JSON columns, need updating; read a column's
  width from its header element.
- **Give range filters you add in code on `TIME WITH TIME ZONE` columns
  `valueType: 'time'`.** The column's chart now draws, each value at its time
  of day as written, and its brush and filter panel compare
  `CAST(col AS TIME)` the same way. Without it, a range compares instants,
  its bounds in DuckDB's session time zone, and can miss rows its bars count:
  in a UTC session `01:30:00+05:30` is not between `'01:30:00'` and
  `'06:00:00'`. A session restore or a preset load gives such a filter
  `valueType: 'time'` when it has none, so a saved one now matches by time of
  day. See [Filters → `range`](../guides/filters.md#1-range--numeric-or-date-ranges).

## Verification checklist

- [ ] `npm install @jeyabbalas/data-table@0.9` in the target project.
- [ ] Every `isApplicable` that accepts `'string'` or is `isCategoricalType`
      checked: text only, or nested columns too.
- [ ] Every switch over `DataType` or `stats.kind` has a `'nested'` case.
- [ ] Every `getColumnValues` call on a MAP, UNION, `TIME WITH TIME ZONE` or
      `TIME_NS` column updated.
- [ ] A self-hosted worker file replaced with the new version's; offline or
      under a strict CSP, the `json` extension mirrored.
- [ ] Every reader of a CSV or JSON export, or of copied rows, reads date
      and time columns as ISO 8601 text, not numbers.
- [ ] No `VisualizationFactory` left: its calls go to
      `defaultVisualizationRegistry` or a `VisualizationRegistry` of your own.
- [ ] `npm run build` passes.
- [ ] Manual smoke test: load a file with list, struct and map columns; check
      their headers, charts and filters; open the value inspector with `F2`;
      export to CSV and JSON; load a Parquet `File`.

## See also

- [Loading data → Nested and JSON columns](../guides/loading-data.md#nested-and-json-columns)
  — the grid, the value inspector, filtering, reading values and exporting.
- [Derived columns → Nested columns](../guides/derived-columns.md#nested-columns)
  — extracting a field as a column.
- [CHANGELOG entry for v0.9](../../CHANGELOG.md)
- [Migration guides index](./README.md)
