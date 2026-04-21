# 02 — Load from URL

Fetch 100,000 NYC yellow-taxi trip records from a URL and animate a progress bar driven by the `loadProgress` event.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/02-load-from-url/
```

## API surface

- [`createDataTable({ container })`](../../docs/api-reference.md#createdatatable) — construct **without** `source`
- [`DataTable.loadData`](../../docs/api-reference.md#datatable-interface)
- [`loadStart` / `loadProgress` / `loadComplete` / `loadError` events](../../docs/api-reference.md#event-catalog)
- [`ProgressInfo`](../../docs/api-reference.md#progress) — `{ stage, percent, loaded?, total? }`

## Data

100,000 rows × 19 columns — [`tests/fixtures/datasets/csv/nyc_taxi.csv`](../../tests/fixtures/datasets/csv/nyc_taxi.csv) (NYC TLC, January 2024 sample).

## What to observe

1. The progress bar fills as the CSV flows through `reading` → `parsing` → `indexing` → `analyzing` stages. The label shows `<stage> <percent>%` live.
2. On completion the bar reaches 100 % and the label flips to `100,000 rows loaded`.
3. Disable the network in DevTools then reload — the `loadError` event fires, the bar turns red, and the label shows the error message.

## Why listeners are wired before `loadData`

`createDataTable({ source })` awaits the first load **internally** (`src/DataTable.ts`), so any listener attached after `await createDataTable(...)` resolves would miss every single `loadStart` / `loadProgress` / `loadComplete` tick for that initial load. This example constructs the table without `source`, attaches listeners, then calls `table.loadData(url)` — the same pattern you use for subsequent reloads.
