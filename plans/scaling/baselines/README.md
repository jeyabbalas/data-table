# Pre-optimization baselines

Machine-generated. Do not edit between the markers — run
`npm run perf:baseline:report` instead.

Each JSON in this directory is one capture of one tier at one commit,
written by `tests/browser/perf-baseline.spec.ts` (`npm run perf:baseline`).
Captures are append-only: a phase that improves a number adds a column,
it does not overwrite the old one.

Wall-clock numbers here are **not** budgets and nothing asserts against
them — they are machine-specific. The machine is recorded under each
table; two rows from different machines are not comparable. The
machine-independent counts (queries, DOM nodes, observers) are the ones
that graduate into `tests/budgets.ts` when a phase tightens them.

A metric added by a later phase shows `—` for every capture before it —
"not measured", not "zero". The two block-fetch rows start at `4b9bd9e`
(Phase 5). Their pre-phase value is not missing so much as implied: a
block fetch used to project every visible column, so `values per block`
was exactly `(columns + 1) × 128` — 128,128 at WIDE and 25,728 at GRID,
against the 6,272 recorded here. `tests/performance/projection.duckdb.test.ts`
measures the same before/after under control, execution timed apart from
the Arrow drain.

`4b9bd9e` and `bb49bd6` are both Phase 5. The second is the review pass,
which changed the eviction budget's multiplicand and could therefore have
moved memory; it is captured rather than assumed, and did not (heap 18.4
MB at WIDE either way).

<!-- dt-baselines:start -->

### wide-ci — visualizations off

| Metric                      | `202bb18` (2026-08-08) | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: | ---------------------: |
| Generate (ms)               |                   1726 |                   1689 |
| Load (ms)                   |                    913 |                   1448 |
| └ worker stage (ms)         |                  905.6 |                 1447.6 |
| └ first paint (ms)          |                  912.4 |                 1447.7 |
| └ viz ready (ms)            |                  905.7 |                 1447.6 |
| Queries sent                |                      4 |                      4 |
| Cache hits                  |                      0 |                      0 |
| DOM nodes                   |                  11156 |                  15352 |
| Canvases                    |                      0 |                      0 |
| Live ResizeObservers        |                      1 |                      1 |
| Live MutationObservers      |                      1 |                      1 |
| sortColumns subscribers     |                    305 |                    305 |
| JS heap (MB)                |                   19.6 |                   19.6 |
| One sort (ms)               |                   45.3 |                  114.9 |
| One filter (ms)             |                   39.1 |                  120.5 |
| Scroll storm frame p95 (ms) |                    9.3 |                   12.1 |

- `202bb18` — darwin, 10 cpus, node v22.23.2.
- `970698e` — darwin, 10 cpus, node v22.23.2.

### wide — visualizations off

| Metric                           | `202bb18` (2026-08-08) | `51ba4ef` (2026-08-08) | `5285b63` (2026-08-08) | `970698e` (2026-08-08) | `133b388` (2026-08-09) | `4b9bd9e` (2026-08-09) | `bb49bd6` (2026-08-09) |
| -------------------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------: |
| Generate (ms)                    |                  14538 |                  16961 |                  15096 |                  14414 |                  14399 |                  14735 |                  16609 |
| Load (ms)                        |                   3866 |                   3859 |                   4065 |                   8336 |                   5101 |                   3490 |                   3678 |
| └ worker stage (ms)              |                 3845.6 |                 3855.1 |                 4062.8 |                 8334.4 |                   5094 |                 3487.6 |                 3674.5 |
| └ first paint (ms)               |                 3865.2 |                 3855.6 |                 4063.1 |                 8334.7 |                 5095.1 |                 3488.9 |                 3675.8 |
| └ viz ready (ms)                 |                 3845.7 |                 3855.3 |                 4062.9 |                 8334.5 |                 5094.3 |                 3487.8 |                 3674.6 |
| Queries sent                     |                      4 |                      4 |                      4 |                      4 |                      3 |                      3 |                      3 |
| Cache hits                       |                      0 |                      0 |                      0 |                      0 |                      0 |                      0 |                      0 |
| DOM nodes                        |                  36356 |                  52052 |                  51052 |                  51052 |                    970 |                    970 |                    970 |
| Canvases                         |                      0 |                      0 |                      0 |                      0 |                      0 |                      0 |                      0 |
| Live ResizeObservers             |                      1 |                      1 |                      1 |                      1 |                      2 |                      2 |                      2 |
| Live MutationObservers           |                      1 |                      1 |                      1 |                      1 |                      1 |                      1 |                      1 |
| sortColumns subscribers          |                   1005 |                   1005 |                   1005 |                   1005 |                      5 |                      5 |                      5 |
| JS heap (MB)                     |                     28 |                   31.6 |                   31.6 |                  227.9 |                     22 |                   18.4 |                   18.4 |
| One sort (ms)                    |                  164.3 |                  401.8 |                  460.8 |                  391.9 |                    165 |                   23.8 |                     19 |
| One filter (ms)                  |                  152.1 |                  423.7 |                  396.8 |                  381.1 |                  173.9 |                   23.9 |                   21.9 |
| Scroll storm frame p95 (ms)      |                    9.8 |                   36.2 |                   37.3 |                     38 |                    9.3 |                   10.3 |                   10.3 |
| One row-block fetch (ms, median) |                      — |                      — |                      — |                      — |                      — |                    7.4 |                    6.2 |
| └ values per block               |                      — |                      — |                      — |                      — |                      — |                   6272 |                   6272 |

- `202bb18` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `51ba4ef` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `5285b63` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `970698e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `133b388` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `4b9bd9e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `bb49bd6` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.

### wide — visualizations on

| Metric                           | `202bb18` (2026-08-08) | `51ba4ef` (2026-08-08) | `970698e` (2026-08-08) | `133b388` (2026-08-09) | `4b9bd9e` (2026-08-09) | `bb49bd6` (2026-08-09) |
| -------------------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------: |
| Generate (ms)                    |                  14154 |                  14716 |                  14461 |                  16309 |                  14704 |                  16194 |
| Load (ms)                        |                   3860 |                   3743 |                  18884 |                   3532 |                   3097 |                   3457 |
| └ worker stage (ms)              |                 3839.5 |                 3741.7 |                 8673.7 |                 3518.5 |                 3094.8 |                 3450.3 |
| └ first paint (ms)               |                 3859.1 |                 3742.1 |                   8674 |                 3519.3 |                 3095.5 |                   3451 |
| └ viz ready (ms)                 |                 4157.6 |                 4291.7 |                  18884 |                 3914.3 |                 3303.8 |                 3615.8 |
| Queries sent                     |                     20 |                     20 |                   2004 |                     19 |                     19 |                     19 |
| Cache hits                       |                      0 |                      0 |                      0 |                      0 |                      0 |                      0 |
| DOM nodes                        |                  36380 |                  52076 |                  55052 |                    994 |                    994 |                    994 |
| Canvases                         |                      8 |                      8 |                   1000 |                      8 |                      8 |                      8 |
| Live ResizeObservers             |                      9 |                      9 |                   1001 |                     10 |                     10 |                     10 |
| Live MutationObservers           |                      2 |                      2 |                   1001 |                      2 |                      2 |                      2 |
| sortColumns subscribers          |                   1005 |                   1005 |                   1005 |                      5 |                      5 |                      5 |
| JS heap (MB)                     |                   24.8 |                     28 |                  227.9 |                     22 |                   18.4 |                   19.6 |
| One sort (ms)                    |                  163.8 |                  450.3 |                10514.6 |                  149.8 |                   26.8 |                   16.7 |
| One filter (ms)                  |                  230.7 |                  506.2 |                 8274.7 |                  250.5 |                  112.1 |                    112 |
| Scroll storm frame p95 (ms)      |                   10.1 |                   40.5 |                   44.8 |                    9.3 |                   10.3 |                   10.3 |
| One row-block fetch (ms, median) |                      — |                      — |                      — |                      — |                    7.7 |                      9 |
| └ values per block               |                      — |                      — |                      — |                      — |                   6272 |                   6272 |

- `202bb18` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `51ba4ef` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `970698e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `133b388` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `4b9bd9e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `bb49bd6` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.

### wide-csv — visualizations off

| Metric                      | `5285b63` (2026-08-08) |
| --------------------------- | ---------------------: |
| Generate (ms)               |                      0 |
| Load (ms)                   |                   5021 |
| └ worker stage (ms)         |                 5020.8 |
| └ first paint (ms)          |                   5021 |
| └ viz ready (ms)            |                 5020.9 |
| Queries sent                |                      4 |
| Cache hits                  |                      0 |
| DOM nodes                   |                  51052 |
| Canvases                    |                      0 |
| Live ResizeObservers        |                      1 |
| Live MutationObservers      |                      1 |
| sortColumns subscribers     |                   1005 |
| JS heap (MB)                |                  110.6 |
| One sort (ms)               |                  345.1 |
| One filter (ms)             |                  321.3 |
| Scroll storm frame p95 (ms) |                   41.4 |

- `5285b63` — darwin, 10 cpus, node v22.23.2.

### grid — visualizations off

| Metric                           | `202bb18` (2026-08-08) | `970698e` (2026-08-08) | `4b9bd9e` (2026-08-09) | `bb49bd6` (2026-08-09) |
| -------------------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: |
| Generate (ms)                    |                  23672 |                  23954 |                  24140 |                  24078 |
| Load (ms)                        |                   3769 |                  10943 |                   3972 |                   3769 |
| └ worker stage (ms)              |                   3760 |                10936.4 |                   3970 |                 3765.7 |
| └ first paint (ms)               |                 3764.5 |                10936.6 |                 3970.7 |                 3766.4 |
| └ viz ready (ms)                 |                 3760.2 |                10936.4 |                 3970.1 |                 3765.8 |
| Queries sent                     |                      4 |                      4 |                      3 |                      3 |
| Cache hits                       |                      0 |                      0 |                      0 |                      0 |
| DOM nodes                        |                   7556 |                  10252 |                    970 |                    970 |
| Canvases                         |                      0 |                      0 |                      0 |                      0 |
| Live ResizeObservers             |                      1 |                      1 |                      2 |                      2 |
| Live MutationObservers           |                      1 |                      1 |                      1 |                      1 |
| sortColumns subscribers          |                    205 |                    205 |                      5 |                      5 |
| JS heap (MB)                     |                   19.6 |                   17.4 |                   18.4 |                   18.4 |
| One sort (ms)                    |                    129 |                  167.1 |                   49.4 |                   53.9 |
| One filter (ms)                  |                   60.6 |                  102.3 |                   25.2 |                   30.2 |
| Scroll storm frame p95 (ms)      |                    9.4 |                    9.5 |                   10.4 |                   10.4 |
| One row-block fetch (ms, median) |                      — |                      — |                      8 |                    9.9 |
| └ values per block               |                      — |                      — |                   6272 |                   6272 |

- `202bb18` — darwin, 10 cpus, node v22.23.2.
- `970698e` — darwin, 10 cpus, node v22.23.2.
- `4b9bd9e` — darwin, 10 cpus, node v22.23.2.
- `bb49bd6` — darwin, 10 cpus, node v22.23.2.

### deep — visualizations off

| Metric                      | `202bb18` (2026-08-08) | `5285b63` (2026-08-08) | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: | ---------------------: | ---------------------: |
| Generate (ms)               |                  21412 |                  21848 |                  21063 |
| Load (ms)                   |                   3783 |                   4243 |                  11192 |
| └ worker stage (ms)         |                 3777.3 |                 4236.9 |                11191.7 |
| └ first paint (ms)          |                 3777.9 |                 4237.1 |                11191.9 |
| └ viz ready (ms)            |                 3777.3 |                 4236.9 |                11191.8 |
| Queries sent                |                      4 |                      4 |                      4 |
| Cache hits                  |                      0 |                      0 |                      0 |
| DOM nodes                   |                   1076 |                   1072 |                   1072 |
| Canvases                    |                      0 |                      0 |                      0 |
| Live ResizeObservers        |                      1 |                      1 |                      1 |
| Live MutationObservers      |                      1 |                      1 |                      1 |
| sortColumns subscribers     |                     25 |                     25 |                     25 |
| JS heap (MB)                |                   17.4 |                   16.3 |                  347.1 |
| One sort (ms)               |                  119.2 |                  120.5 |                  124.8 |
| One filter (ms)             |                   26.5 |                   28.7 |                   38.9 |
| Scroll storm frame p95 (ms) |                    9.3 |                    9.3 |                    9.3 |

- `202bb18` — darwin, 10 cpus, node v22.23.2.
- `5285b63` — darwin, 10 cpus, node v22.23.2.
- `970698e` — darwin, 10 cpus, node v22.23.2.

### target — visualizations off

| Metric        | `970698e` (2026-08-08) |
| ------------- | ---------------------: |
| Generate (ms) |                 591514 |
| Queries sent  |                      4 |
| Cache hits    |                      0 |
| JS heap (MB)  |                   19.6 |

- `970698e` — darwin, 10 cpus, node v22.23.2. Probes only — the file is written with COPY … TO parquet and read back through read_parquet. genMs is the COPY; no table is materialized until Phase 10.

<!-- dt-baselines:end -->
