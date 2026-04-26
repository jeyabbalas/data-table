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
System Access API. The library reads the file:

- **Parquet** — `file.arrayBuffer()` (binary)
- **CSV / JSON** — `file.text()`

### URL (`string` starting with `http`)

Fetched with the platform `fetch()` — cross-origin URLs must send the
appropriate CORS headers. A non-2xx response throws `LoadError` with
`code: 'FETCH_FAILED'` and the status in `details`.

### `ArrayBuffer`

Treated as binary (Parquet) unless you set `sourceFormat` explicitly.

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

If the new dataset is enormous and you want to reclaim memory from the
previous one, destroy and recreate the table instead:

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
- **Memory growth across loads.** Each `loadData()` keeps DuckDB's prior tables until they're overwritten. For large-to-large loads, `destroy()` + recreate is cleaner than `loadData()`.
- **Progress isn't always byte-exact.** DuckDB's parse stage reports row counts once schema is known; bytes are estimated from the fetch `Content-Length` when available.

## Related

- Events: [Events guide](./events.md) — lifecycle ordering for `loadStart` / `loadProgress` / `loadComplete` / `loadError`
- Errors: [Troubleshooting — `FETCH_FAILED`](../troubleshooting.md) for URL load failures
- API reference: [`createDataTable` options](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
- Source: `src/data/DataLoader.ts`, `src/data/WorkerBridge.ts:262-288`
