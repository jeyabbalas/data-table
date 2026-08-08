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

<!-- dt-baselines:start -->

### wide-ci — visualizations off

| Metric                      | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: |
| Generate (ms)               |                   1689 |
| Load (ms)                   |                   1448 |
| └ worker stage (ms)         |                 1447.6 |
| └ first paint (ms)          |                 1447.7 |
| └ viz ready (ms)            |                 1447.6 |
| Queries sent                |                      4 |
| Cache hits                  |                      0 |
| DOM nodes                   |                  15352 |
| Canvases                    |                      0 |
| Live ResizeObservers        |                      1 |
| Live MutationObservers      |                      1 |
| sortColumns subscribers     |                    305 |
| JS heap (MB)                |                   19.6 |
| One sort (ms)               |                  114.9 |
| One filter (ms)             |                  120.5 |
| Scroll storm frame p95 (ms) |                   12.1 |

- `970698e` — darwin, 10 cpus, node v22.23.2.

### wide — visualizations off

| Metric                      | `5285b63` (2026-08-08) | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: | ---------------------: |
| Generate (ms)               |                  15096 |                  14414 |
| Load (ms)                   |                   4065 |                   8336 |
| └ worker stage (ms)         |                 4062.8 |                 8334.4 |
| └ first paint (ms)          |                 4063.1 |                 8334.7 |
| └ viz ready (ms)            |                 4062.9 |                 8334.5 |
| Queries sent                |                      4 |                      4 |
| Cache hits                  |                      0 |                      0 |
| DOM nodes                   |                  51052 |                  51052 |
| Canvases                    |                      0 |                      0 |
| Live ResizeObservers        |                      1 |                      1 |
| Live MutationObservers      |                      1 |                      1 |
| sortColumns subscribers     |                   1005 |                   1005 |
| JS heap (MB)                |                   31.6 |                  227.9 |
| One sort (ms)               |                  460.8 |                  391.9 |
| One filter (ms)             |                  396.8 |                  381.1 |
| Scroll storm frame p95 (ms) |                   37.3 |                     38 |

- `5285b63` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.
- `970698e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.

### wide — visualizations on

| Metric                      | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: |
| Generate (ms)               |                  14461 |
| Load (ms)                   |                  18884 |
| └ worker stage (ms)         |                 8673.7 |
| └ first paint (ms)          |                   8674 |
| └ viz ready (ms)            |                  18884 |
| Queries sent                |                   2004 |
| Cache hits                  |                      0 |
| DOM nodes                   |                  55052 |
| Canvases                    |                   1000 |
| Live ResizeObservers        |                   1001 |
| Live MutationObservers      |                   1001 |
| sortColumns subscribers     |                   1005 |
| JS heap (MB)                |                  227.9 |
| One sort (ms)               |                10514.6 |
| One filter (ms)             |                 8274.7 |
| Scroll storm frame p95 (ms) |                   44.8 |

- `970698e` — darwin, 10 cpus, node v22.23.2. Truncated: 60000 of 100000 rows, all 1000 columns. exportToBuffer has no ROW_GROUP_SIZE option, so the full-depth tier buffers as one row group and overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.

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

| Metric                      | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: |
| Generate (ms)               |                  23954 |
| Load (ms)                   |                  10943 |
| └ worker stage (ms)         |                10936.4 |
| └ first paint (ms)          |                10936.6 |
| └ viz ready (ms)            |                10936.4 |
| Queries sent                |                      4 |
| Cache hits                  |                      0 |
| DOM nodes                   |                  10252 |
| Canvases                    |                      0 |
| Live ResizeObservers        |                      1 |
| Live MutationObservers      |                      1 |
| sortColumns subscribers     |                    205 |
| JS heap (MB)                |                   17.4 |
| One sort (ms)               |                  167.1 |
| One filter (ms)             |                  102.3 |
| Scroll storm frame p95 (ms) |                    9.5 |

- `970698e` — darwin, 10 cpus, node v22.23.2.

### deep — visualizations off

| Metric                      | `5285b63` (2026-08-08) | `970698e` (2026-08-08) |
| --------------------------- | ---------------------: | ---------------------: |
| Generate (ms)               |                  21848 |                  21063 |
| Load (ms)                   |                   4243 |                  11192 |
| └ worker stage (ms)         |                 4236.9 |                11191.7 |
| └ first paint (ms)          |                 4237.1 |                11191.9 |
| └ viz ready (ms)            |                 4236.9 |                11191.8 |
| Queries sent                |                      4 |                      4 |
| Cache hits                  |                      0 |                      0 |
| DOM nodes                   |                   1072 |                   1072 |
| Canvases                    |                      0 |                      0 |
| Live ResizeObservers        |                      1 |                      1 |
| Live MutationObservers      |                      1 |                      1 |
| sortColumns subscribers     |                     25 |                     25 |
| JS heap (MB)                |                   16.3 |                  347.1 |
| One sort (ms)               |                  120.5 |                  124.8 |
| One filter (ms)             |                   28.7 |                   38.9 |
| Scroll storm frame p95 (ms) |                    9.3 |                    9.3 |

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
