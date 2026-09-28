# Memory envelope for large Parquet sources

Maintainer notes: the findings of a browser spike run before any further large-dataset work. The
spike code and raw results are on branch `spike/memory-envelope` (`spike/memory/`).

## Question and verdict

Can DuckDB-WASM hold the largest shapes users need, about 1,000 columns × 200K rows or ~40 columns ×
5M rows (≈200M cells), in memory, and which way of loading the file makes that possible?

**Yes, but not the way the library loaded files at the time.** Copying the file into DuckDB's heap,
as it did then, tops out between 150K and 200K rows at 1,000 columns. Registering the file as a lazy
handle instead loads 200K × 1,000 at 76% of the 4 GiB ceiling, and 250K at 90%; since #120 the
loader registers `File` and `Blob` sources that way. A direct-scan mode is not needed for the target
shapes, so it is not on the roadmap. Separately, sorted scrolling on a ~200M-cell deep table ran out
of memory; #119 fixed it with a two-phase sorted fetch.

## Setup

- Chromium 151 (Playwright, headless), macOS, 16 GiB RAM. DuckDB-WASM 1.33.1-dev57 (DuckDB v1.5.4),
  single-threaded `eh` bundle, no cross-origin isolation, default `memory_limit` (3.1 GiB).
- Synthetic Parquet (`gen.py`), repeating a 20-column type mix: 12 doubles (1% nulls), 3 integers,
  3 categorical strings (20 / 1,000 / 50,000 values), a timestamp and a boolean. "Random" data is
  full-precision; "rounded" data compresses about 3× better on disk. Row groups of 122,880 rows
  (DuckDB's default) unless noted.
- **Peak memory** is the size of DuckDB's `WebAssembly.Memory`, which only grows, read after each
  step. The archived branch measured `performance.memory` on the main thread, which cannot see it.
- Three strategies: `buffer` (File → ArrayBuffer → `registerFileBuffer` → `CREATE TABLE AS`, today's
  path), `handle` (`registerFileHandle`, DuckDB reads the file lazily from disk → `CREATE TABLE AS`),
  `view` (`registerFileHandle` → a view over `read_parquet(…, file_row_number = true)`).
- Queries use a 40-column projection, i.e. assume the archived branch's projection clipping. Main
  projects every visible column per block.

## Results

Peak linear memory (MiB, ceiling 4,096) at 1,000 columns, random data:

| Rows | File (MiB) | `buffer`                             | `handle`    |         `view` |
| ---: | ---------: | ------------------------------------ | ----------- | -------------: |
| 100K |        732 | 2,764                                | 1,960       |              — |
| 150K |      1,102 | 3,709 (91%)                          | 2,536       |              — |
| 200K |      1,464 | out of memory                        | 3,114 (76%) |            120 |
| 250K |      1,837 | out of memory                        | 3,692 (90%) |              — |
| 300K |      2,196 | file cannot be read as `ArrayBuffer` | out of mem. | 16 (load only) |

- At 200K × 1,000: rounded data (447 MiB file) fits both ways (`buffer` 3,238, `handle` 2,727); a
  single 200K-row row group fits `handle` at 3,596 (88%) but not `buffer`.
- **The archived branch's `memory_limit = '2.5GB'` makes 200K × 1,000 fail** under `handle`.
- **DuckDB's table costs ~10.6–11.6 bytes per cell** whatever the entropy (`IN_MEMORY_TABLE` is
  2,208 MiB for 200K × 1,000, random or rounded; 2,031 MiB for 5M × 40). In-memory tables are not
  compressed.
- `buffer`'s peak ≈ `handle`'s peak + the file size: the copy that matters is the one **inside** the
  WASM heap. The branch's zero-copy transfer removed JavaScript-heap copies, which do not count
  against this ceiling.
- `handle`'s peak ≈ `duckdb_memory()`'s total + a decode buffer for one 122,880-row row group:
  ~850 MiB at 1,000 columns, ~70 MiB at 40. Larger row groups raise it (a single 200K-row group:
  +1.3 GiB).
- 5M × 40: `buffer` peaks at 3,686 after load, `handle` at 2,154.

Load time at the target shapes: `buffer` 6–8 s, plus 0.4–2.4 s to copy the file into the heap
first (`handle` registers in 1 ms); `handle` 28–38 s (17 s at 100K × 1,000, 52 s at 250K × 1,000),
`handle` with `directIO = false` ~90 s, `view` under 1.1 s.

Query latency (ms). "Two-phase" sorts only `(key, __rowid__)` with the offset, then fetches the 128
rows by `__rowid__`:

| Case                | Block (top / mid) | Sorted top | Sorted mid, `OFFSET` | Sorted mid, two-phase | Filter count | Histogram (filtered) | Value counts (filtered) |
| ------------------- | ----------------: | ---------: | -------------------: | --------------------: | -----------: | -------------------: | ----------------------: |
| 200K × 1,000, table |            11 / 5 |         23 |                   84 |                    72 |            4 |              23 (11) |                   8 (5) |
| 200K × 1,000, view  |         268 / 417 |        531 |                  538 |                   849 |           58 |            135 (137) |                 52 (63) |
| 5M × 40, table      |            15 / 5 |        273 |    **out of memory** |                   933 |           33 |            295 (150) |                121 (80) |
| 5M × 40, view       |         267 / 223 |     14,819 |               17,188 |                15,073 |          365 |        1,005 (1,644) |               464 (852) |

"Table" is `handle`; `buffer` is within 30 ms of it once loaded. The sorted-mid `OFFSET` query is
main's own shape (`ORDER BY <sort>, __rowid__ LIMIT 128 OFFSET k` over every projected column): at
5M × 40 it grew memory by 1.2 GiB beyond the 2.1 GiB peak after load (a 2.0 GiB table) and still
failed.

## What this changes

1. **Register `File` sources with `registerFileHandle` (`directIO = true`).** It removes the file
   from the WASM heap: the 1,000-column ceiling moves from ~150K to ~250K rows, and 5M × 40 drops
   from 3.6 to 2.1 GiB. It costs load time (7 s → 35 s at 200K × 1,000), so keep `buffer` when the
   estimated peak fits comfortably, and look at speeding up `handle` (for example an OPFS copy) as
   a follow-up. URL sources were not measured; `registerFileURL` range reads are the analogue.
2. **Make sorted and filtered fetches two-phase.** Sort the keys and `__rowid__` only, then fetch
   the block by id. This fixes the out-of-memory crash on deep sorted scrolling and costs ~0.9 s per
   block at 5M rows; materializing that order once per sort (the archived plan's rank index) then
   makes every block cheap. This does not depend on column windowing and can land first.
3. **Do not lower `memory_limit`.** Expose it as an option at most.
4. **Estimate before loading.** Row count, column count and row-group size come from the Parquet
   footer. Estimate the peak (table ≈ 11.5 B × cells, plus decode buffers, plus the file if
   buffered), choose `buffer` or `handle`, and refuse with a typed error when neither fits, instead
   of letting the worker abort.
5. **Defer direct scan.** It is a workable overflow mode for wide sources beyond ~250K × 1,000
   (every query under 1 s with a clipped projection) but useless for sorting deep ones (11–19 s).
   Revisit only if a user needs more than ~250M cells.

## Follow-up: read modes and the table estimate

Measured afterwards to design the load path (#120), same setup. `prefetch` is
`SET prefetch_all_parquet_files = true`; "cache off" adds
`SET enable_external_file_cache = false`. Load time and peak WASM memory (MiB):

| File                                | `buffer`      | `handle`     | `handle` + prefetch | `handle` + prefetch, cache off |
| ----------------------------------- | ------------- | ------------ | ------------------- | ------------------------------ |
| 1M × 40, 293 MiB                    | 1.6 s, 805    | 5.4 s, 515   | 1.3 s, 828          | 1.3 s, 537                     |
| 50K × 1,000, 370 MiB, one row group | 2.8 s, 1,792  | 7.8 s, 1,381 | 2.3 s, 1,763        | 2.4 s, 1,762                   |
| 200K × 1,000, 1,464 MiB             | out of memory | 34 s, 3,114  | out of memory       | 9.9 s, 3,642                   |

- **Prefetching makes lazy reads as fast as buffering, but only with the external file cache
  off.** The cache is on by default and keeps every prefetched block, so the load then costs the
  whole file again. With it off, prefetching costs at most about one row group. This replaces
  recommendation 1's "keep `buffer` when it fits".
- **The table estimate needs block granularity.** DuckDB stores each column of each 122,880-row
  group in whole 256 KiB blocks, plus one block for its validity mask, so a short row group still
  pays for whole blocks. The flat 11.5 B per cell in recommendation 4 is over a quarter low for
  short, wide tables: 548 MiB against the 756 MiB measured at 50K × 1,000. #120 calibrated the block
  model against `duckdb_memory()` and keeps the measurements as cases in
  `tests/worker/loaders/memoryBudget.test.ts`: within 1% per type at 1M rows, within 3% per column
  for short tables, and within 5% for the wide files measured here.
- **Do not retry after running out.** After an "Allocation failure", a lazy retry of the same file
  failed too, although new 100 MB and 1 GB tables still loaded. The estimate has to be the guard.
- **The library's own load adds type detection.** At 200K × 1,000 it takes 2.6 s. When string
  columns hold ISO dates, it rebuilds the whole table to convert them, and on a 200K × 1,000 file
  that rebuild failed. The spike recorded only the wrapped error ("Failed to convert columns to
  date", at a 3,497 MiB peak); #121 measured it as out of memory with 10 such columns, and
  converting in the load's single `CREATE TABLE` loads the same file in 12 s.
- **In-memory compression is a possible later lever.** `ATTACH ':memory:' AS db (COMPRESS)`
  followed by `CHECKPOINT` should trade query speed for a smaller table, but the trial's size and
  latency figures were not recorded in `spike/memory/results`, so none are given here. Nothing is
  compressed until the checkpoint, though, so the load's peak is unchanged; using it would take a
  load that checkpoints in chunks. Worth a spike only if users need more than the current ceiling.

## Caveats

- Synthetic data. Its strings are 8 characters, which DuckDB stores inline; longer strings cost
  more per cell. Check the 250K figure against real user files before promising it.
- The first round measures DuckDB alone. The library adds type detection (time, and a full-table
  rebuild when it converts string columns; see the follow-up), chart queries, and, before #120,
  main-thread copies of the file.
- One machine and one browser. The WASM ceiling is the same everywhere; timings are not.
