# 01 — Minimal

The smallest possible mount: eight rows defined inline in the `.ts` file, wrapped as a JSON `Blob`, handed to `loadData`. No URL, no fetch, no fixture on disk.

## Run

```bash
npm run example
# open http://localhost:5173/01-minimal/
```

## API surface

- [`createDataTable`](../../docs/api-reference.md#createdatatable)
- [`DataTable.loadData`](../../docs/api-reference.md#datatable-interface) — `Blob` source with `sourceFormat: 'json'`
- [`DataTable.destroy`](../../docs/api-reference.md#datatable-interface)

## Data

Eight hand-authored rows with columns `name`, `role`, `team`, `joined`, `active` — defined inline at the top of `main.ts`.

## What to observe

1. The table renders immediately — open DevTools ▸ Network and confirm no request is made for data (only the library bundle and the HTML page).
2. Column types are inferred from the JSON values: `joined` becomes a numeric histogram, `active` a boolean value-counts, `role`/`team` categorical.
3. Click column headers to sort; click filter icons to filter.

## Why inline data?

- **Minimal footprint** for tutorials and quickstart demos — the data and the table live in one file.
- **Fastest path** for small UI prototypes where the data is known at build time.
- **Not for large datasets.** For real-world loads, fetch from a URL (see [example 02](../02-load-from-url/)); the library will stream and emit progress events. Inline JSON is round-tripped through `JSON.stringify` and loses typed-array efficiency.
