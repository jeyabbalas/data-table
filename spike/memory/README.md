# Memory-envelope spike

Throwaway measurement code, not part of the library. It answers one question: **which way of loading
a Parquet source lets DuckDB-WASM hold ~1,000 columns × 200K rows (or ~40 × 5M) in the browser, and
how fast are the table's queries under each?** Findings live in `docs/dev/memory-envelope.md`.

## Strategies

| Name              | Load path                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `buffer`          | `File` → `ArrayBuffer` → `registerFileBuffer` → `CREATE TABLE AS` (what the library does today) |
| `handle`          | `registerFileHandle` (DuckDB reads the file lazily from disk) → `CREATE TABLE AS`               |
| `view`            | `registerFileHandle` → `CREATE VIEW` over `read_parquet(…, file_row_number = true)`             |
| `handle-buffered` | As `handle`, registered with `directIO = false`                                                 |

The `CREATE TABLE AS` is the library's own shape (`row_number() OVER ()` as `__rowid__`).

## What is measured

- **Peak memory**: the byte length of DuckDB's `WebAssembly.Memory`. Linear memory only grows, so its
  size after a step is that step's high-water mark, which is what the 4 GiB wasm32 ceiling applies
  to. `main.ts` wraps DuckDB's worker to capture the Memory when the Emscripten runtime creates it.
- **DuckDB's own accounting**: `duckdb_memory()` after the load.
- **Latency** of the queries the table issues: 128-row blocks by `__rowid__` range (top and middle),
  sorted blocks via `ORDER BY … LIMIT 128 OFFSET k`, a filter count, a histogram (stats + bins), and
  value counts, each with and without a filter.

## Running

```sh
python3 spike/memory/gen.py --cols 1000 --rows 200000 --rg 122880 --out /some/dir/wide-200k.parquet
# … see run.spec.ts DEFAULT_CASES for the full file list …
SPIKE_DATA=/some/dir npx playwright test -c spike/memory/playwright.config.ts
python3 spike/memory/summarize.py
```

`SPIKE_CASES=strategy:file[:i][:limit=2.5GB],…` runs a subset; `i` adds the interaction queries.
Each case runs in a fresh browser context, so a fresh DuckDB and a fresh linear memory.
