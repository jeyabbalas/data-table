# Loading data

Load CSV, JSON, or Parquet into the table from a `File`, a URL, a `Blob`, or
an `ArrayBuffer`. The library detects the format, hands the bytes off to the
DuckDB-in-WASM worker, and emits progress events you can use to render a bar
or a spinner.

## You'll learn how to

- Load data from each supported source (File, URL, Blob, ArrayBuffer)
- Override format detection when the extension lies (or there isn't one)
- Tell the reader what detection would guess: a CSV delimiter, header or null
  values, a JSON layout, the Parquet columns to load
- Show a progress bar from `loadStart` / `loadProgress` / `loadComplete`
- Recover from a load failure and retry
- Know when text columns of dates load as dates
- Know what list, struct, map and JSON columns become, and how to read their values
- Replace the current dataset without destroying the table

## Prerequisites

- Read: [Quick start](../../README.md#quick-start), [API: `createDataTable`](../api-reference.md#createdatatable), [API: `loadData`](../api-reference.md#datatable-interface)
- Runnable examples: [`examples/01-minimal`](../../examples/01-minimal/), [`examples/02-load-from-url`](../../examples/02-load-from-url/)

## Minimal example

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container: document.getElementById('my-table')!,
  source: 'https://example.com/data/trips.csv',
});
```

`source` accepts `File | string | ArrayBuffer | Blob`. A string that looks
like a URL or a path is fetched; multi-line text, or text starting with `[` or
`{`, is loaded as inline data; any other string is rejected (see
[Raw `string`](#raw-string)).

## Source types

### `File`

Comes from an `<input type="file">`, a drag-and-drop event, or the File
System Access API.

- **Parquet** — handed to DuckDB unread. DuckDB reads the file from disk as
  it loads, so the file is never held in memory next to the table. This is
  the way to load large files; see [Large Parquet files](#large-parquet-files).
- **CSV / JSON** — read with `file.text()`.

### URL or path (`string`)

A string is a URL when it starts with a scheme (`https:`, `http:`, `file:`,
`data:`, `blob:`, …), `//`, `/`, `./` or `../`. Relative ones resolve against
`window.location.href`, so a `<base href>` on the page does not apply to them.
A bare file name such as `'data.csv'` is not a URL; write `'./data.csv'`.

Fetched with the platform `fetch()` — cross-origin URLs must send the
appropriate CORS headers. A non-2xx response throws `LoadError` with
`code: 'FETCH_FAILED'` and the status in `details`. A Parquet response is
read as a `Blob`, which the browser may keep on disk, and then loaded like
a `File`.

### `ArrayBuffer`

Treated as binary (Parquet) unless you set `sourceFormat` explicitly. The
whole buffer is copied into DuckDB's memory before the table is built, so a
Parquet `ArrayBuffer` needs room for the file and the table at once. Prefer
a `File` or `Blob` for large files.

### `Blob`

A Parquet `Blob` is read from disk like a `File`. Without `sourceFormat`, a
`Blob` is assumed to be Parquet, as an `ArrayBuffer` is.

### Raw `string`

A string that is not a URL is loaded as inline data when it spans more than
one line, or when its first non-whitespace character is `[` or `{`. That
character also picks the format: `[` or `{` means JSON, anything else CSV.
Any other string, a single line such as `'sample.csv'` or `'a,b'`, rejects
with `LoadError` code `SOURCE_AMBIGUOUS` instead of being parsed as a
one-line CSV.

## Format detection

Detection order:

| Source                       | Signal used                                               |
| ---------------------------- | --------------------------------------------------------- |
| `File`                       | File extension (`.csv` / `.json` / `.parquet`)            |
| URL                          | `URL(source).pathname` extension                          |
| `ArrayBuffer`, `Blob`        | Assumed Parquet                                           |
| Inline string (raw `string`) | First non-whitespace character — `[`/`{` → JSON, else CSV |

An unknown extension falls back to CSV. Override detection with `sourceFormat`
in `createDataTable`, or the `format` option in `loadData`:

```ts
await table.loadData(blob, { sourceFormat: 'json' });
```

### When detection misfires

- URL without an extension (e.g., an S3 presigned URL) → CSV is assumed; set
  `sourceFormat`
- File named `.txt` containing JSON → set `sourceFormat: 'json'`
- `ArrayBuffer` containing CSV text (unusual) → set `sourceFormat: 'csv'`

## How a source is read

`sourceOptions` tells the reader what it would otherwise detect, per format.
Pass it to `createDataTable` with `source`, or as an option of `loadData`:

```ts
const table = await createDataTable({
  container,
  source: '/exports/orders.csv',
  sourceOptions: { csv: { delimiter: ';', nullValues: ['', 'NA'] } },
});

await table.loadData(file, {
  sourceOptions: { parquet: { columns: ['pickup_at', 'fare', 'tip'] } },
});
```

A load reads the entry for its source's format and ignores the others, so
one object can go with sources of any format.

| Option            | Default      | What it does                                                                                                                          |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `csv.delimiter`   | detected     | The one character between fields; not a line break or NUL.                                                                            |
| `csv.header`      | detected     | Whether the first row names the columns. Without one, they are `column0`, `column1`, …, or `column00`, `column01`, … from 10 columns. |
| `csv.skip`        | `0`          | Lines to skip before the header, such as a title line.                                                                                |
| `csv.nullValues`  | `['']`       | Field values read as `null`. They replace the default: include `''` to keep empty fields `null`.                                      |
| `csv.sampleSize`  | 20,480       | Rows DuckDB reads to detect the dialect and the column types; `-1` reads every row.                                                   |
| `json.format`     | detected     | `'array'` for a JSON array of objects, `'ndjson'` for one object per line.                                                            |
| `json.sampleSize` | 20,480       | Objects DuckDB reads to detect the column types; `-1` reads every one.                                                                |
| `json.maxDepth`   | no limit     | Levels of nested objects that get types of their own. Deeper values load as JSON text.                                                |
| `parquet.columns` | every column | The columns to load, by their names in the file (case-sensitive), in this order.                                                      |
| `timezone`        | `'UTC'`      | The time zone DuckDB works in. See below.                                                                                             |

A value of the wrong type or out of range, or a key the reader does not
know, rejects the load before the source is read, with `LoadError` code
`LOAD_INVALID_OPTIONS` and the option in `error.details.option`, such as
`'csv.delimiter'`. The table keeps the data it had: its rows, filters and
annotations stay as they were. A Parquet column the file lacks rejects the
same way once the file is opened, with the names in
`error.details.missing`; the message gives the file's own spelling when only
the case differs.

- **Types come from a sample.** DuckDB types CSV and JSON columns from the
  first 20,480 rows it reads. A later value that does not fit, text in a
  number column, fails the load with `Could not convert string …`. Set
  `sampleSize: -1` to type from every row, which reads the file once more,
  or list the placeholder in `nullValues` if it stands for a missing value.
  See [Troubleshooting §31](../troubleshooting.md#31-a-csv-or-json-load-fails-with-could-not-convert-string--to-bigint).
- **Loading some Parquet columns.** The columns left out are never read, and
  the memory check before the load counts only those listed, so a file too
  large to load whole may load in part. See [Large Parquet files](#large-parquet-files).
- **The time zone.** SQL on `TIMESTAMP WITH TIME ZONE` values uses it: date
  parts, truncation, and casts to `DATE` or text, as in derived columns, SQL
  filters and the bins of a date histogram. In the text columns the loader
  converts to dates and times, timestamps that carry the zone's own offset
  load as plain timestamps, the local time as written, and other offsets
  make the column `TIMESTAMP WITH TIME ZONE` (see
  [Dates and times stored as text](#dates-and-times-stored-as-text)). Cells
  show `TIMESTAMP WITH TIME ZONE` values in UTC either way. It is a setting
  of the worker's DuckDB connection, so it holds for every table sharing a
  `WorkerBridge`, and every load sets it, to UTC unless given. A name DuckDB
  does not know rejects the load with `LOAD_INVALID_TIMEZONE`, listing the
  zones it suggests.

## Progress reporting

The `loadProgress` event carries a `ProgressInfo`:

```ts
type ProgressStage = 'reading' | 'parsing' | 'indexing' | 'analyzing';

interface ProgressInfo {
  stage: ProgressStage;
  percent: number; // 0–100
  loaded?: number; // bytes or rows seen so far
  total?: number; // expected bytes or rows (may be undefined for streams)
  estimatedRemaining?: number; // ms
  cancelable: boolean;
}
```

Wire it up like a typical progress bar:

```ts
const progressEl = document.getElementById('progress')!;

table.on('loadStart', () => {
  progressEl.style.display = 'block';
});

table.on('loadProgress', ({ percent, stage }) => {
  progressEl.textContent = `${stage} — ${Math.round(percent)}%`;
});

table.on('loadComplete', ({ rowCount }) => {
  progressEl.style.display = 'none';
  console.log(`Loaded ${rowCount.toLocaleString()} rows`);
});

table.on('loadError', ({ error }) => {
  progressEl.textContent = `Failed: ${error.message}`;
});
```

The worker reports three stages for every source: `reading` at 0%, `parsing`
at 25% and `indexing` at 90%; `loadComplete` marks the end. `percent` runs
0–100 and is always set. The `analyzing` stage is never reported, and the
optional `loaded`, `total` and `estimatedRemaining` fields are left out.

## Replacing the dataset

Call `loadData()` again on the same table:

```ts
await table.loadData(newSource, { sourceFormat: 'parquet' });
```

The library reuses the existing worker and clears query-cache entries
invalidated by the new schema. Filters and derived columns tied to column
names that don't exist in the new data are dropped on session restore.

The previous DuckDB base table is reclaimed automatically:

- If the new load uses a **different** `tableName`, the previous base
  table is dropped from the worker after the new load resolves. A
  failed load leaves the previous data queryable as a fallback.
- If the new load reuses the **same** `tableName`, the loader's
  `CREATE OR REPLACE TABLE` swaps the contents atomically — no
  separate drop is needed.

For very large dataset swaps where peak main-thread memory matters
(loading a 200 MB source on top of an existing 200 MB table),
`destroy()` + recreate releases the previous buffers earlier than
`loadData()`:

```ts
await table.destroy();
table = await createDataTable({ container, source: newSource });
```

## Large Parquet files

DuckDB-WASM holds the whole table in WebAssembly memory, which browsers cap
at 4 GiB; DuckDB's own `memory_limit` is 3.1 GiB by default. A loaded table
takes roughly 5–20 bytes per value, plus the length of its text: 200,000
rows × 1,000 mostly numeric columns come to about 2.2 GiB.

A [nested column](#nested-and-json-columns) takes what its items take, plus
8 bytes a row for a list: a 768-float embedding is about 3 KB a row.

To load files near that size, pass the Parquet file as a `File`, `Blob`, or
URL. DuckDB then reads it from disk as it builds the table. Before loading,
the loader estimates the table's size from the file's footer and a sample
of its text columns and list lengths, and picks how to read the file:

- When there is room, DuckDB reads a whole row group at a time, which is
  as fast as loading from memory.
- Near the limit, it reads one column chunk at a time, two to four times
  slower but with the smallest peak. A 1.5 GB file of 200,000 rows × 1,000
  columns of random doubles loads this way in about 35 seconds.

Loading only the columns you use, with `sourceOptions.parquet.columns`,
shrinks the table and the estimate alike: the columns left out are never
read. A load that will not fit rejects with `LoadError` code
`LOAD_MEMORY_EXCEEDED` before anything is loaded. The message names the
limit it hit — the table's share of DuckDB's free memory, or the load's peak
against the 4 GiB — with the numbers compared, which `error.details` also
carries as `check`, `neededBytes`, and `availableBytes`. If DuckDB runs out
partway through anyway, the error has `details.stage === 'load'` and
DuckDB's own message in `details.duckdbMessage`. Either way the table
loaded before stays in DuckDB until the next successful load replaces it:

```ts
table.on('loadError', ({ error }) => {
  if (error instanceof LoadError && error.code === 'LOAD_MEMORY_EXCEEDED') {
    // error.message says which limit the load hit; error.details has the numbers.
    showMessage(error.message);
  }
});
```

See [Troubleshooting §27](../troubleshooting.md#27-loaderror-with-code-load_memory_exceeded)
for what to do about it.

## Dates and times stored as text

Text columns of ISO 8601 dates (`2024-03-15`), timestamps
(`2024-03-15 14:30:00`, `2024-03-15T14:30:00.250Z`), or 24-hour times
(`14:30:00`) load as `date`, `timestamp`, or `time` columns, so they sort,
filter, and chart as dates. DuckDB's CSV and JSON readers type most such
columns themselves. The loader converts the text columns they leave, and
the text columns of a Parquet file.

A column converts only if every value in it converts unchanged:

- The loader guesses from each column's first 2,048 rows, then checks every
  value. If one value would not convert (`N/A`, or an impossible date such
  as `2024-02-30`), the whole column stays text, so no value turns into
  `null`.
- A value converts only in its exact ISO form. DuckDB would keep the date in
  `2024-03-15 (approx)` or `2024-03-15 14:30:00` and drop the rest, read
  `02:30:00 PM` as `02:30:00`, and cut fractional seconds past six digits,
  so any such value keeps its column as text.
- Blank values (empty or only spaces) count as missing and become `null`,
  as they do in a CSV file.
- Timestamps with a UTC offset (`+05:30`) load as `TIMESTAMP WITH TIME ZONE`
  and display in UTC, so the offset is not dropped. The loader works in UTC
  unless `sourceOptions.timezone` names another zone, and in the columns it
  converts, timestamps with that zone's own offset (`Z` and `+00:00` in UTC)
  load as plain timestamps.
  DuckDB's CSV reader types a column with `Z` or an offset as
  `TIMESTAMP WITH TIME ZONE` itself.
- A column that is blank for its first 2,048 rows stays text.

Parquet columns convert as the file is read, so the table is built once, at
its final size. CSV and JSON columns convert in place after loading, one
column at a time.

To use a column that stayed text as dates, fix its values upstream, or add a
[derived column](./derived-columns.md) such as `TRY_CAST(due AS DATE)`, which
turns the values that do not convert into `null` deliberately. See
[Troubleshooting §28](../troubleshooting.md#28-a-column-of-dates-loaded-as-text).

## Nested and JSON columns

A column of one of DuckDB's container types loads with `type: 'nested'`: a
LIST (`INTEGER[]`), a fixed-size ARRAY (`FLOAT[768]`), a STRUCT, a MAP, a
UNION or a VARIANT. `ColumnSchema.originalType` holds the full type as
`DESCRIBE` prints it, `STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)`, and
`parseDuckDBType` from `/advanced` reads it into a tree of fields, elements,
keys and members (`src/core/duckdbType.ts`). A `JSON` column keeps
`type: 'string'`: it sorts and charts as text, and its cell shows the whole
JSON text on one line, cut off at the column's edge. Its exact filter
compares that text too; see [Filtering](#filtering).

Where they come from:

- **Parquet** files hold lists, structs, maps and JSON, which load as they
  are, and a VARIANT column from a file DuckDB wrote. A fixed-size list
  loads as a LIST.
- **JSON** files: DuckDB types nested objects as STRUCTs, arrays as LISTs,
  objects whose keys vary from row to row as MAPs, and a field whose type
  changes from row to row as JSON. Deeper than `sourceOptions.json.maxDepth`,
  values load as JSON. A list of integers of both signs loads as
  `HUGEINT[]`: DuckDB reads non-negative integers as unsigned.
- **CSV** never: DuckDB's CSV reader infers no nested type, so a nested
  column exported to CSV loads back as its JSON text.
- **SQL**: an ARRAY or a UNION arises only from a derived column's
  expression, as does a VARIANT that did not come from Parquet.

### In the grid

A nested cell shows DuckDB's own text for the value, as
`CAST(value AS VARCHAR)` writes it: `[56, 3, 91]`, `{'x': 1.25, 'y': 0.58, 'tier': bronze}` for a
struct, `{k1=1, k2=2}` for a map. The text is bounded, and so is what DuckDB
formats to make it, so a cell costs about a screenful of text whatever its
value holds (`gridValueSQL`, `src/data/valueSql.ts`):

- A list, a map, or an array of more than 32 items shows its first 32, then
  how many more there are: `[1, 2, …, 32, … +968]`, `{k1=1, … +568}`. A
  list, array or map inside the value is formatted only as far as its first
  1,001 items, more than the text cap can show, so the cell reads as the
  whole value's text would. A few parts are still formatted whole; see
  [Performance → Nested columns](../performance.md#nested-columns).
- Text past 1,000 graphemes is cut and ends `…`, only when something was
  cut, and never inside an emoji made of several code points.
- A BLOB shows its first 256 bytes as DuckDB writes them, then `… +N` for
  the bytes left. DuckDB writes a byte that is not printable ASCII as four
  characters (`\x89`), so that text can pass 1,000 characters; the cell then
  shows the whole bytes that fit, 250 to 256 of them, and `…`, without the
  count. BIT, GEOMETRY, BIGNUM and ENUM cells, and VARIANT ones, show
  DuckDB's text too.
- A `TIME_NS` column is a `time` column, and its cell shows DuckDB's text
  with every digit: `03:04:05.123456789`, `23:59:59.123456`. A
  `TIME WITH TIME ZONE` cell shows DuckDB's text with its offset:
  `14:05:06+05:30`, `14:05:06.5-08`. A `TIME` cell shows the time to the
  millisecond.
- A NULL value keeps the grid's null style; a NULL inside a value reads
  `NULL`.

This text is for reading, not parsing: a string inside is quoted only when it
has to be (`[a, b]` is two strings, `['a, b']` one), a map is written
`{key=value}`, and a UNION as its member's value, without its tag. Read the
value itself with [`getCellValue`](#reading-values).

### The value inspector

To see a whole value, open the value inspector on its cell: `F2` on the
keyboard cursor, a double click, or a click on the inspect icon that shows at
the cell's end on hover and on the cursor's cell. It opens on any cell of a
nested or JSON column that holds a value, NULLs aside, in a panel beside the
cell (`src/table/ValueInspector.ts`):

- **The exact value**, read by the row's `__rowid__` as JSON and parsed
  without losing a digit, as a keyboard tree: keys, values, each container's
  type outline, count and a 60-character preview. Map entries show as
  `key → value`; list, array and map positions count from 1, JSON array
  positions from 0. The root opens expanded, and its children too when they
  fit in 50 rows.
- **Values as their type writes them**: text quoted, and cut at 2,000
  characters with "N more characters"; numbers exact (a FLOAT at float32
  precision, a HUGEINT with all its digits); `NaN`, `±Infinity`, `true` and
  `false` as keywords; `null` muted; dates, times, UUIDs and BLOBs as
  DuckDB's text.
- **Buckets** for a container too big to list at once: 100 items a bucket
  (`[1 … 100]`, `[101 … 200]`, …), and buckets of buckets past 10,000.
- **Copy JSON** copies the whole value as standard JSON (`NaN` and
  `±Infinity` as `null`); `Ctrl/Cmd+C` copies the active item's. A value
  nested too deep to write as JSON says "Copy failed".
- **Limits**: the panel shows the first 2,097,152 characters of a value's
  JSON text (2 Mi, counted in code points) and says when a value is longer.
  Copy JSON then reads the value again, up to 8,388,608 characters, and so
  does `Ctrl/Cmd+C` on an item the cut runs through (the root, its last
  item, that item's last item, and so on down), which copies the item from
  the whole value; past that each says "Too large to copy", and an export of
  the column is the way to get it. Every other item is copied from what the
  panel shows. A copy that reads first starts its clipboard write inside the
  click or key press, which Safari requires.

The panel closes on `Escape`, a press outside it, or any filter, sort,
selection or data change, and focus goes back to the grid with its cursor
where it was. Its keys and screen-reader behaviour are in the
[accessibility guide](./accessibility.md#value-inspector-f2-on-a-nested-cell).
It loads as a chunk of its own the first time a table opens it, so a table
that never does never downloads it. Call
`table.container.openValueInspector({ row, column })` to open it from your
own code, with the row's 0-based position in the sorted, filtered view. It
opens only on a row the grid has rendered, in or near the view, and returns
`false` for any other row, a NULL or a column that is neither nested nor
JSON. It opens a microtask later, and the first time once its chunk has
loaded. An open still waiting is dropped when the user goes on meanwhile: a
cursor move, another panel, a filter, sort, selection or table change, or,
when focus was in the table, focus leaving it. So `true` can still open
nothing, and from code a cursor move in the same task drops the open. `F2`
on a row still loading waits for the row: when it lands, the panel opens
only if the cursor is still on the cell, focus on the grid and no other
panel open, and not at all once the row has left the rows rendered. A chunk
that fails to download is said in the live region and reported as an
`error` event coded `CHUNK_LOAD_FAILED`.

With `derivedColumns` on, the default, the panel's footer can also add the
active node as a column of its own: "Add as column", "Add length as column"
(a list, an array or a JSON array), "Add size as column" (a map) and "Add tag
as column" (a union), a row's "+" on hover, or `Ctrl/Cmd+Enter`. See
[Derived columns → Nested columns](./derived-columns.md#nested-columns).

Sorting a nested column orders rows by value, as DuckDB compares them, not
by their text. A sort by a wide value, such as an embedding, is the slowest
kind: see [Performance → Nested columns](../performance.md#nested-columns).

### Header, chart and stats

- **Type.** The header's type line is a short outline of the DuckDB type:
  `[integer]`, `struct(3)`, `{varchar → integer}`, `float[768]`, `union(2)`,
  `json`, `variant` (`src/nested/typeOutline.ts`). It is cut with `…` when
  the column is narrow, between graphemes, and its title holds the full
  type. The header's accessible name says the type in words, "tags, list of
  integer", from [`messages.values`](./i18n.md#nested-column-types). The
  filter panel's type badge shows the same outline. JSON columns show
  `json`.
- **Chart.** `NestedSummaryVisualization` draws a bar of the column's
  non-null and null shares, the type outline under it (`{x, y, tier}`), and
  with filters on, the share of each passing them. It reads ungrouped
  `COUNT(*), COUNT(c)` scans, one of every row and, with filters on, one of
  the rows passing them, so an embedding column costs what an integer column
  does. Hovering a segment shows its counts; clicking does nothing, since
  the bar has nothing to filter by beyond what the null toggle does. JSON
  columns keep the value counts. See
  [Visualizations](./visualizations.md#built-in-visualizations).
- **Stats.** Line 1 is the row count, as on every column. Line 2 is the type
  summary: `x double · y double · tier varchar` for a struct, `[integer]` for
  a list.

### Filtering

The filter panel gives a nested column, and a JSON one, the text controls:

- **Contains / starts with / ends with / regex** match the cell's text,
  `CAST(col AS VARCHAR)`; the first three ignore case.
- **Exact** matches the whole text: `[red, green]`. The filter it makes
  carries `valueType: 'text'`, which compares `CAST(col AS VARCHAR)` with the
  value as text. An exact filter added in code needs `valueType: 'text'`
  too: compared as a value, text that does not read as the column's type is
  a Conversion Error, `Malformed JSON` on a JSON column (see
  [Filters → Matching nested values](./filters.md#matching-nested-values)).
- **Is null / is not null** keeps only the rows whose value is NULL, or
  only those whose value is not.

To filter on a field's value as a number or a date, add it as a column of
its own: from the column header's extract button, or in code with
`table.actions.addNestedFieldColumn('point', ['x'])`, which reads it with the
expression `"point"['x']` and puts the column right after `point`. It gets a
histogram, stats and range filters of its own. See
[Derived columns → Nested columns](./derived-columns.md#nested-columns).

### Reading values

[`actions.getCellValue(rowId, column)`](../api-reference.md#getcellvalue)
reads one value exactly, by the row's `__rowid__`, and
[`actions.getColumnValues(column)`](../api-reference.md#column-values-read-only-export)
reads a column's values the same way. Both read a nested value as exact JSON
text from DuckDB and turn it into JS values by its type:

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.getCellValue(10, 'point'); // { x: 1.5, y: -0.5, tier: 'gold' }

// attrs: MAP(VARCHAR, INTEGER): a Map, keys in order
const attrs = (await table.actions.getCellValue(11, 'attrs')) as Map<string, number>;

// big_ints: BIGINT[]: numbers when exact, bigints beyond 2^53
await table.actions.getCellValue(3, 'big_ints');
// [9007199254740991, 9007199254740993n, -9223372036854775808n, 9223372036854775807n]
```

Lists and arrays become arrays, structs objects (an unnamed struct, an
array; a field named with the empty string, which a JSON or Parquet file can
hold, under the key `''`), a MAP a `Map`, a UNION `{ [tag]: value }`; a
DECIMAL inside is the number nearest its digits; dates, times, UUIDs,
intervals and BLOBs inside are DuckDB's text. `JSON.stringify` writes a
`Map` as `{}`: convert it with `Object.fromEntries(map)` first, or export
the column as JSON. To look at a value rather than compute with it, open the
[value inspector](#the-value-inspector) on its cell.

A raw `bridge.query` reads values as Arrow carries them, which loses
`DECIMAL`, `HUGEINT` and `INTERVAL` values inside a nested value and cannot
carry a VARIANT, or a value holding one, at all. Select a nested column as
`CAST(to_json(c) AS VARCHAR)`, which is exact for every type but those with
a VARIANT: select a VARIANT as `CAST(c AS JSON)`, and a type holding one
(`VARIANT[]`, `STRUCT(v VARIANT)`) as `CAST(CAST(c AS VARIANT) AS JSON)`. See
[API reference → Data layer](../api-reference.md#data-layer).

### Exporting

- **CSV and the clipboard** write a nested value as standard JSON:
  `[56,3,91]`, `{"x":1.25,"tier":"bronze"}`, a MAP as an object in key
  order, a UNION as `{"tag":value}`. Every digit is kept, and `NaN` and
  `±Infinity`, which JSON cannot hold, are `null`.
- **JSON export** writes real arrays and objects: a MAP as an object keyed
  by each key's text, an unnamed struct as an array, an integer inside past
  2^53 as a string of its digits. A JS object lists integer-like keys first,
  so a struct or map with keys `2`, `1`, `10` comes out as `1`, `2`, `10`.
  A `BIGINT`-family column of its own is exported, by both, as numbers:
  rounded past 2^53, and a `HUGEINT` or `UHUGEINT` with the wrong sign at its
  extremes. Read it with `getColumnValues`, or export to Parquet, when its
  digits matter.
- **Both** write `INTERVAL`, `BLOB`, `BIT`, `GEOMETRY`, `BIGNUM`, `ENUM`,
  `TIME WITH TIME ZONE` and `TIME_NS` values as DuckDB's text
  (`14:05:06+05:30`, `03:04:05.123456789`), a `DECIMAL` as the double nearest
  its value (`0.35`, not `0.35000000000000003`), and a JSON column's value as
  its text. A `DATE`, `TIMESTAMP` or `TIMESTAMP WITH TIME ZONE` column is
  written as epoch milliseconds, and a `TIME` column as microseconds since
  midnight; dates and times inside a nested value are DuckDB's text
  (`["2024-01-02"]`).
- **Parquet** writes every column natively. A few types come back in part:
  an ARRAY loads back as a LIST, a `HUGEINT` or `UHUGEINT` as a `DOUBLE`, an
  `INTERVAL` to the millisecond, and an `ENUM` inside a struct or a `BIT`
  inside a list as `VARCHAR`; a UNION or unnamed STRUCT column exports but
  its file does not load again, and a VARIANT inside a list or struct does
  not export.
- **A type that holds a VARIANT** (`VARIANT[]`, `STRUCT(v VARIANT)`) is read
  through VARIANT, in every export and value read: a UNION inside it loses
  its tag and is its member's value, read as its JSON holds it, and CSV and
  the clipboard write a MAP inside it as a list of `{"key": …, "value": …}`
  objects.

A CSV or JSON export is built as one string. A `FLOAT[768]` value is some
15,000 characters of JSON, so a few tens of thousands of rows of one can pass
the browser's limit on a string's length: export large nested columns to
Parquet. See
[Troubleshooting §34](../troubleshooting.md#34-exporting-an-embedding-column-to-csv-or-json-fails).

### Try it

The demo's **Nested types (Parquet)** example (`npm run dev`) loads
`tests/fixtures/datasets/parquet/nested-stress-tests.parquet`: 1,000 rows of
36 columns of lists, structs, maps and JSON, whose rows 0–11 hold the edge
cases (all NULL, empties, numeric extremes, escapes, long lists, the text
cap). `tests/fixtures/datasets/Dataset Schema.md` describes every column.

## Recipes

### Load from a file input

```ts
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  await table.loadData(file);
});
```

### Load a URL with credentials

The library uses `fetch()` with defaults — to include cookies or headers,
fetch yourself and pass the body as a `Blob`, which DuckDB can read from
disk (an `ArrayBuffer` would be copied into its memory whole):

```ts
const res = await fetch(url, { credentials: 'include', headers: { 'X-Token': token } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
await table.loadData(await res.blob(), { sourceFormat: 'parquet' });
```

### Retry on failure

```ts
table.on('loadError', async ({ error }) => {
  if (error instanceof LoadError && error.code === 'FETCH_FAILED') {
    // Offer the user a retry button; then:
    await table.loadData(source);
  }
});
```

### Pre-name the DuckDB table

Useful if you're joining against it from a custom SQL query:

```ts
await createDataTable({
  container,
  source,
  tableName: 'trips_2024',
});

// Later:
const rows = await table.bridge.query('SELECT COUNT(*) AS n FROM trips_2024');
```

## The reserved `__rowid__` column

Every load synthesizes a `BIGINT` column called `__rowid__` on the base
table — `row_number() OVER () - 1` (0-indexed) — so apps have a stable
key for app-side row alignment, annotations, and read-only column
export. It survives sort, filter, and derived-column add / remove;
only a fresh `loadData()` reassigns it.

If your source already contains a column named `__rowid__`, the loader
rejects with `LoadError('RESERVED_COLUMN_NAME')`. Rename the source
column (e.g. to `_rowid_orig`) and reload.

The synthetic column is hidden from the rendered grid by default and
excluded from default exports unless the user ticks "Include system
columns" in the export dialog. It's queryable like any other column —
useful in raw `bridge.query` calls and in `expression`-kind derived
column expressions (e.g. `FLOOR(__rowid__ / 100) AS batch_id`). Read
the values into a typed array via
[`actions.getColumnValues('__rowid__')`](../api-reference.md#column-values-read-only-export)
(returns `BigInt64Array`).

See [`examples/10-column-export/`](../../examples/10-column-export/)
for a runnable demo.

## Gotchas

- **`ArrayBuffer` defaults to Parquet.** Pass `sourceFormat` if it's anything else.
- **Large Parquet files need a `File`, `Blob`, or URL.** An `ArrayBuffer` is copied into DuckDB's memory whole, next to the table. A load that will not fit rejects with `LOAD_MEMORY_EXCEEDED`; see [Large Parquet files](#large-parquet-files).
- **A bare file name is not a URL.** `'data.csv'` rejects with `SOURCE_AMBIGUOUS`; write `'./data.csv'` or `'/data.csv'`. Relative URLs resolve against `window.location.href`, not the page's `<base href>`. A `file:` URL is fetched like any other, which browsers refuse from a web page; pass the `File` instead.
- **CORS and redirects.** `fetch()` uses default redirect handling and CORS enforcement. For cross-origin loads, the server must send `Access-Control-Allow-Origin`.
- **Reloading doesn't reset columns.** If the new dataset has a different schema, old column visibility/width settings may dangle until the session is cleared. Call `table.clearSession()` before a schema change.
- **Source must not contain a column named `__rowid__`.** That name is reserved for the synthetic row id. The loader throws `LoadError('RESERVED_COLUMN_NAME')` rather than silently rename or overwrite.
- **Peak memory during a large swap.** `loadData()` drops the previous DuckDB base table after the new one is live (or replaces it atomically when the `tableName` matches), so the catalog stays clean across reloads. While the new load is in flight, both buffers coexist briefly — for very large dataset swaps where peak main-thread memory matters, `destroy()` + recreate releases the previous buffers earlier.
- **Progress is coarse.** There is one report per stage (`reading` 0%, `parsing` 25%, `indexing` 90%) and no byte or row counts, so a large file stays at 25% for most of its load.

## Related

- Events: [Events guide](./events.md) — lifecycle ordering for `loadStart` / `loadProgress` / `loadComplete` / `loadError`
- Errors: [Troubleshooting — `FETCH_FAILED`](../troubleshooting.md) for URL load failures
- API reference: [`createDataTable` options](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
- Source: `src/data/DataLoader.ts`, `src/data/WorkerBridge.ts:439-482`; nested columns: `src/core/duckdbType.ts`, `src/data/valueSql.ts`, `src/core/jsonTree.ts`
