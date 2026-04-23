# 10 — Column export

Fetch a single column out of the loaded table as a typed JS array using `table.actions.getColumnValues()`, and toggle the synthetic `__rowid__` column in and out of the grid.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/10-column-export/
```

## API surface

- [`actions.getColumnValues(name, opts?)`](../../docs/api-reference.md#column-export) — returns `Int32Array` / `Float64Array` / `BigInt64Array` / `unknown[]` depending on column type.
- [`ROWID_COLUMN`](../../docs/api-reference.md#tier-1-exports) — the string constant `"__rowid__"`, reserved for the synthetic row id.
- [`actions.showColumn`](../../docs/api-reference.md#column-visibility) / [`actions.hideColumn`](../../docs/api-reference.md#column-visibility).

## Data

100,000 rows × 19 columns — [`tests/fixtures/datasets/csv/nyc_taxi.csv`](../../tests/fixtures/datasets/csv/nyc_taxi.csv), plus the synthetic `__rowid__` (BIGINT, 0..N-1) injected at load.

## What to observe

1. **`__rowid__` is hidden by default.** The grid shows the same columns it did before Phase 1. Check the "Show `__rowid__` in grid" box to reveal it; the column is always retrievable via `getColumnValues('__rowid__')` regardless.
2. **Typed-array return.** Pick a numeric column (e.g., `fare_amount`) and click **Fetch values**. The Return line shows `Float64Array`. Pick a string column (e.g., `store_and_fwd_flag`) and the return is `Array`. `__rowid__` always returns `BigInt64Array`.
3. **Scope: filtered.** Click "Filter `fare_amount` > 20", set scope to `filtered`, and fetch `fare_amount`. Every printed value is strictly greater than 20. Values stay in `__rowid__` order (stable across the filter).
4. **Scope: selected.** Select a few rows in the grid (`Shift+click` to range-select), choose scope `selected`, and fetch any column. The returned values correspond to the selected rows in positional order within the current filter/sort view.
5. **Export dialog opt-in.** Open the library's export dialog (right-click a column header → Export, or use your integration entry point). A new "Include system columns (e.g. `__rowid__`)" checkbox appears when the schema has any system columns. Default exports exclude `__rowid__`; tick the box to include it as the first column of the export.

## Why `__rowid__`?

Downstream apps built on top of this library (harmonization, data quality) need a stable key to correlate app-authored metadata (validation errors, rule hits) with library-managed rows — one that survives sort, filter, and derived-column operations. `__rowid__` is that key. It is a first-class DuckDB column, so apps can use it in raw `bridge.query` calls and in expression-kind derived columns (e.g., `FLOOR(__rowid__ / 100) AS batch_id`).

## BigInt ergonomics

`getColumnValues('__rowid__')` returns `BigInt64Array`. To consume values as plain numbers:

```ts
const ids = await table.actions.getColumnValues('__rowid__');
const asNumbers = Array.from(ids, (v) => Number(v));      // safe for datasets ≤ Number.MAX_SAFE_INTEGER rows
```
