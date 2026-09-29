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

`source` accepts `File | string | ArrayBuffer | Blob`. When `source` is a
string starting with `http`, the library fetches it; otherwise it treats the
string as raw data.

## Source types

### `File`

Comes from an `<input type="file">`, a drag-and-drop event, or the File
System Access API.

- **Parquet** — handed to DuckDB unread. DuckDB reads the file from disk as
  it loads, so the file is never held in memory next to the table. This is
  the way to load large files; see [Large Parquet files](#large-parquet-files).
- **CSV / JSON** — read with `file.text()`.

### URL (`string` starting with `http`)

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

Any `string` that doesn't start with `http` is treated as raw data.
Content sniffing looks at the first non-whitespace character — `[` or `{`
means JSON; anything else is CSV.

## Format detection

Detection order:

| Source        | Signal used                                               |
| ------------- | --------------------------------------------------------- |
| `File`        | File extension (`.csv` / `.json` / `.parquet`)            |
| URL           | `URL(source).pathname` extension                          |
| `ArrayBuffer` | Assumed Parquet                                           |
| Raw string    | First non-whitespace character — `[`/`{` → JSON, else CSV |

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

Stages progress roughly `reading → parsing → indexing → analyzing`, but not
every source emits every stage (a small CSV may skip straight to `analyzing`).

`ProgressInfo` carries enough data to format your own strings:
`loaded` / `total` (bytes when known), `percent` (0–1 or `undefined`),
`stage`, and an optional `estimatedRemaining` in milliseconds.

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

To load files near that size, pass the Parquet file as a `File`, `Blob`, or
URL. DuckDB then reads it from disk as it builds the table. Before loading,
the loader estimates the table's size from the file's footer and a sample
of its text columns, and picks how to read the file:

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
- **URL must start with `http`.** Relative URLs, `file://`, and `data:` URLs are _not_ auto-fetched — read them yourself and pass the bytes.
- **CORS and redirects.** `fetch()` uses default redirect handling and CORS enforcement. For cross-origin loads, the server must send `Access-Control-Allow-Origin`.
- **Reloading doesn't reset columns.** If the new dataset has a different schema, old column visibility/width settings may dangle until the session is cleared. Call `table.clearSession()` before a schema change.
- **Source must not contain a column named `__rowid__`.** That name is reserved for the synthetic row id. The loader throws `LoadError('RESERVED_COLUMN_NAME')` rather than silently rename or overwrite.
- **Peak memory during a large swap.** `loadData()` drops the previous DuckDB base table after the new one is live (or replaces it atomically when the `tableName` matches), so the catalog stays clean across reloads. While the new load is in flight, both buffers coexist briefly — for very large dataset swaps where peak main-thread memory matters, `destroy()` + recreate releases the previous buffers earlier.
- **Progress isn't always byte-exact.** DuckDB's parse stage reports row counts once schema is known; bytes are estimated from the fetch `Content-Length` when available.

## Related

- Events: [Events guide](./events.md) — lifecycle ordering for `loadStart` / `loadProgress` / `loadComplete` / `loadError`
- Errors: [Troubleshooting — `FETCH_FAILED`](../troubleshooting.md) for URL load failures
- API reference: [`createDataTable` options](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
- Source: `src/data/DataLoader.ts`, `src/data/WorkerBridge.ts:262-288`
