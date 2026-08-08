# Loading data

Load CSV, JSON, or Parquet into the table from a `File`, a URL, a `Blob`, or
an `ArrayBuffer`. The library detects the format, hands the bytes off to the
DuckDB-in-WASM worker, and emits progress events you can use to render a bar
or a spinner.

## You'll learn how to

- Load data from each supported source (File, URL, Blob, ArrayBuffer)
- Override format detection when the extension lies (or there isn't one)
- Show a progress bar from `loadStart` / `loadProgress` / `loadComplete`
- Recover from a load failure and retry
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
System Access API. The library reads it with `file.arrayBuffer()` whatever
the format and hands the bytes straight to the worker — text sources are
never decoded into a JavaScript string on the way, which is a copy saved on
each side of the worker boundary.

UTF-8 is assumed, matching what `file.text()` would have decoded. A UTF-8
byte-order mark is stripped; a UTF-16 one is decoded. Bytes that are not
valid UTF-8 now reach DuckDB intact and fail the load rather than loading as
replacement characters — convert the file if its encoding is something else.

### URL (`string` starting with `http`)

Fetched with the platform `fetch()` — cross-origin URLs must send the
appropriate CORS headers. A non-2xx response throws `LoadError` with
`code: 'FETCH_FAILED'` and the status in `details`.

### `ArrayBuffer`

Treated as binary (Parquet) unless you set `sourceFormat` explicitly.

The buffer is **transferred** to the worker rather than copied, so it is
detached when the load starts: `byteLength` becomes `0` and you cannot read
it again. That is what stops a large source from existing twice at once.
Pass `buffer.slice(0)` if you need to keep your own copy.

```ts
const bytes = await file.arrayBuffer();
await table.loadData(bytes);
bytes.byteLength; // 0

await table.loadData(other.slice(0)); // `other` stays usable
```

### `Blob`

Wrapped internally and read the same way as a `File`.

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

## Type detection

Text columns that hold ISO timestamps, ISO dates, or 24-hour times are
converted to `TIMESTAMP` / `DATE` / `TIME` during the load, so they sort,
filter, and chart as temporal values rather than as strings.

The decision is made from the **first 4,096 rows** of the source, and a
column is converted when at least 95 % of the distinct values sampled from
that window match. Bounding the sample is what keeps detection from costing
anything on a deep table — five million rows are probed as cheaply as five
thousand — but it has one consequence worth stating plainly:

> A column whose values only start looking temporal _after_ row 4,096 stays
> `VARCHAR`. So does one whose leading rows are unrepresentative — a low
> cardinality column whose distribution changes later in the file is exactly
> the case to watch.

Conversion uses `TRY_CAST`, so values that do not parse — including anything
past the sampled window — become `NULL` rather than failing the load.

There is no per-column override. If you know the types, load Parquet: its
columns carry their own types and are used as-is.

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

Stages arrive in this order, which follows the work rather than the names:

| Stage       | Where       | `loaded` / `total`        | What is happening                                                         |
| ----------- | ----------- | ------------------------- | ------------------------------------------------------------------------- |
| `reading`   | main thread | bytes read / source size  | Reading the file, or streaming the URL response                           |
| `parsing`   | worker      | —                         | DuckDB is reading the source to resolve its schema                        |
| `analyzing` | worker      | probe chunks done / total | Deciding which text columns hold dates, times, or timestamps              |
| `indexing`  | worker      | —                         | Materializing the typed table, then reading back its row count and schema |

`percent` is `0`–`100`, never decreases, and the load ends with exactly one
report at `100` — so `percent === 100` is a usable terminal signal. Only
`reading` reports `cancelable: true`; once the worker starts, no DuckDB
statement in the load can be interrupted.

A source may skip `analyzing`'s intermediate steps — a table with no text
columns has nothing to probe — but every load emits each stage at least
once.

`ProgressInfo` also carries an optional `estimatedRemaining` in
milliseconds.

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
fetch yourself and pass the `ArrayBuffer`:

```ts
const res = await fetch(url, { credentials: 'include', headers: { 'X-Token': token } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const buf = await res.arrayBuffer();
await table.loadData(buf, { sourceFormat: 'parquet' });
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
- **URL must start with `http`.** Relative URLs, `file://`, and `data:` URLs are _not_ auto-fetched — read them yourself and pass the bytes.
- **CORS and redirects.** `fetch()` uses default redirect handling and CORS enforcement. For cross-origin loads, the server must send `Access-Control-Allow-Origin`.
- **Reloading doesn't reset columns.** If the new dataset has a different schema, old column visibility/width settings may dangle until the session is cleared. Call `table.clearSession()` before a schema change.
- **Source must not contain a column named `__rowid__`.** That name is reserved for the synthetic row id. The loader throws `LoadError('RESERVED_COLUMN_NAME')` rather than silently rename or overwrite.
- **Peak memory during a large swap.** `loadData()` drops the previous DuckDB base table after the new one is live (or replaces it atomically when the `tableName` matches), so the catalog stays clean across reloads. While the new load is in flight, both buffers coexist briefly — for very large dataset swaps where peak main-thread memory matters, `destroy()` + recreate releases the previous buffers earlier.
- **An `ArrayBuffer` source is detached.** It is transferred to the worker, not copied. Pass `buffer.slice(0)` to keep a usable copy.
- **Byte progress is only reported for `reading`.** The worker's stages report where they are, not how many bytes they have consumed — DuckDB does not expose that. For a URL, byte progress needs a `Content-Length`; without one, `loaded` still counts real bytes but `percent` stays at the start of the band until the read finishes.
- **Text detection reads the first 4,096 rows.** See [Type detection](#type-detection).

## Related

- Events: [Events guide](./events.md) — lifecycle ordering for `loadStart` / `loadProgress` / `loadComplete` / `loadError`
- Errors: [Troubleshooting — `FETCH_FAILED`](../troubleshooting.md) for URL load failures
- API reference: [`createDataTable` options](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
- Source: `src/data/DataLoader.ts`, `src/data/WorkerBridge.ts:262-288`
