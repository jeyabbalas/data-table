# Examples

Fourteen single-feature examples for `@jeyabbalas/data-table`. Each one is compact, imports from `@jeyabbalas/data-table` (not `../src/`), and demonstrates one focused pattern.

## Run

From the repo root:

```bash
npm run dev
```

Then open `http://localhost:5173/data-table/` and click **fourteen focused examples** to land on `http://localhost:5173/data-table/examples/`. Each example links from there.

No pre-build needed — Vite serves the library from source via aliases (see `vite.demo.config.ts`).

The same examples are also browsable on the deployed demo under [`/data-table/examples/`](https://jeyabbalas.github.io/data-table/examples/).

## Sizing the mount container

Every example gives its mount container a bounded height through an unbroken chain from the viewport down. That CSS is load-bearing, not decorative. The table is virtualized and measures the container to decide how many rows to render (about `⌈containerHeight / rowHeight⌉ + 10`); with no bounded height the container becomes content-sized, the visible range becomes the entire dataset, and you get one `LIMIT <totalRows>` query and a DOM row for every row. Nothing errors — virtualization is silently defeated. A zero-height container renders nothing and logs a one-shot console warning at mount.

All fourteen start the chain with `html, body { margin: 0; padding: 0; height: 100% }` plus `body { display: flex; flex-direction: column }`. Two patterns follow from there.

Direct flex child of `body` (01, 02, 03, 06, 07, 08, 13):

```css
#table {
  flex: 1;
  min-height: 0;
}
```

Grid cell beside a side panel (04, 05, 10, 11, 12, 14):

```css
.split {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px; /* panel width varies per example */
  min-height: 0;
}
#table {
  min-height: 0;
}
```

`09-multi-table` nests the two: a `main` grid holding two `.wrap` flex columns, each with a `flex: 1; min-height: 0` table.

`min-height: 0` is mandatory on every flex or grid child in the chain. Flex items default to `min-height: auto` and refuse to shrink below their intrinsic content height — here, every row in the dataset. Omit it and you get the unbounded case above from CSS that looks correctly sized.

Copy [`01-minimal`](./01-minimal/) as the smallest correct reference; see [Sizing the container](../README.md#sizing-the-container) for the full rationale.

## The examples

| #   | Directory                                                   | Demonstrates                                                                                                                                                                                                                                                                                                                                                                                                                                                           | API surface                                                                                                         |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 01  | [`01-minimal`](./01-minimal/)                               | Mount + load an inline CSV                                                                                                                                                                                                                                                                                                                                                                                                                                             | `createDataTable`, `loadData`                                                                                       |
| 02  | [`02-load-from-url`](./02-load-from-url/)                   | URL load with a progress bar                                                                                                                                                                                                                                                                                                                                                                                                                                           | `on('loadProgress')`, `on('loadComplete')`                                                                          |
| 03  | [`03-programmatic-filters`](./03-programmatic-filters/)     | Apply range / set / raw-SQL filters from buttons; log `filterChange`                                                                                                                                                                                                                                                                                                                                                                                                   | `actions.addFilter`, `addRawSQLFilter`, `on('filterChange')`                                                        |
| 04  | [`04-derived-columns`](./04-derived-columns/)               | Expression + vector derived columns                                                                                                                                                                                                                                                                                                                                                                                                                                    | `actions.addDerivedColumn`                                                                                          |
| 05  | [`05-event-listeners`](./05-event-listeners/)               | External panel reflects filter / sort / selection                                                                                                                                                                                                                                                                                                                                                                                                                      | `on()`, `off()`                                                                                                     |
| 06  | [`06-custom-theme`](./06-custom-theme/)                     | CSS variable overrides + `setColorScheme`                                                                                                                                                                                                                                                                                                                                                                                                                              | `--dt-*`, `setColorScheme`                                                                                          |
| 07  | [`07-i18n-french`](./07-i18n-french/)                       | Translate every UI label via a `messages` override                                                                                                                                                                                                                                                                                                                                                                                                                     | `messages: DeepPartial<Strings>`                                                                                    |
| 08  | [`08-custom-visualization`](./08-custom-visualization/)     | Subclass `BaseVisualization`; register via per-instance `VisualizationRegistry`                                                                                                                                                                                                                                                                                                                                                                                        | `BaseVisualization`, `VisualizationRegistry`                                                                        |
| 09  | [`09-multi-table`](./09-multi-table/)                       | Two tables sharing a `FilterPresetManager` and a `SessionStore`                                                                                                                                                                                                                                                                                                                                                                                                        | shared `presets.manager`, shared `persistence.sessionStore`                                                         |
| 10  | [`10-column-export`](./10-column-export/)                   | Read a column out as a typed array; toggle the synthetic `__rowid__` in the grid                                                                                                                                                                                                                                                                                                                                                                                       | `actions.getColumnValues`, `ROWID_COLUMN`, `actions.showColumn`                                                     |
| 11  | [`11-annotations`](./11-annotations/)                       | Programmatic row / column / cell annotations with severity, JSON round-trip, IndexedDB persistence, intersection popover                                                                                                                                                                                                                                                                                                                                               | `table.annotations.*` (`add`, `addMany`, `getByCell`, `setSeverityFilter`, `toJSON`, `loadJSON`, `on('change', …)`) |
| 12  | [`12-column-header-tooltips`](./12-column-header-tooltips/) | Structured popover (title / description / items + enum chips) anchored on the column-name span; XSS-safe; stateless demo (`persistence: false`)                                                                                                                                                                                                                                                                                                                        | `actions.setColumnHeaderTooltip`, `actions.getColumnHeaderTooltip`                                                  |
| 13  | [`13-custom-stats-panel`](./13-custom-stats-panel/)         | Replace the column-header `.dt-col-stats` slot with a `BaseStatsPanel` subclass. Numeric panel does `n · μ · σ` via a custom `AVG` / `STDDEV_POP` query; categorical panel does `top: <value> (<pct>%)`; both re-query on every filter change with a per-panel `fetchSeq` stale-result guard                                                                                                                                                                           | `BaseStatsPanel`, `StatsPanelRegistry`, `StatsPanelOptions`                                                         |
| 14  | [`14-standalone-sql-editor`](./14-standalone-sql-editor/)   | Two host-built CodeMirror SQL editors mounted _outside_ the data table — filter SQL composer + derived expression composer — sharing the table's live schema via `actions.getCompletionContext()` and refreshing on every `derivedChange` via a single `Compartment.reconfigure()`. Demonstrates host-owned theming via `--dt-*` CSS variables, scoped autocomplete tooltips via `tooltipClass`, and the `validateSQLFilter` / `validateExpression` Apply-gate pattern | `createSqlExtensions`, `buildCompletionContext`, `DUCKDB_FUNCTION_DETAILS`, `dataTableTheme`                        |

For the full API, see [`docs/api-reference.md`](../docs/api-reference.md).
