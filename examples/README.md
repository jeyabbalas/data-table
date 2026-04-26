# Examples

Thirteen single-feature examples for `@jeyabbalas/data-table`. Each one is compact, imports from `@jeyabbalas/data-table` (not `../src/`), and demonstrates one focused pattern.

## Run

From the repo root:

```bash
npm run dev
```

Then open `http://localhost:5173/data-table/` and click **thirteen focused examples** to land on `http://localhost:5173/data-table/examples/`. Each example links from there.

No pre-build needed — Vite serves the library from source via aliases (see `vite.demo.config.ts`).

The same examples are also browsable on the deployed demo under [`/data-table/examples/`](https://jeyabbalas.github.io/data-table/examples/).

## The examples

| # | Directory | Demonstrates | API surface |
|---|---|---|---|
| 01 | [`01-minimal`](./01-minimal/) | Mount + load an inline CSV | `createDataTable`, `loadData` |
| 02 | [`02-load-from-url`](./02-load-from-url/) | URL load with a progress bar | `on('loadProgress')`, `on('loadComplete')` |
| 03 | [`03-programmatic-filters`](./03-programmatic-filters/) | Apply range / set / raw-SQL filters from buttons; log `filterChange` | `actions.addFilter`, `addRawSQLFilter`, `on('filterChange')` |
| 04 | [`04-derived-columns`](./04-derived-columns/) | Expression + vector derived columns | `actions.addDerivedColumn` |
| 05 | [`05-event-listeners`](./05-event-listeners/) | External panel reflects filter / sort / selection | `on()`, `off()` |
| 06 | [`06-custom-theme`](./06-custom-theme/) | CSS variable overrides + `setColorScheme` | `--dt-*`, `setColorScheme` |
| 07 | [`07-i18n-french`](./07-i18n-french/) | Translate every UI label via a `messages` override | `messages: DeepPartial<Strings>` |
| 08 | [`08-custom-visualization`](./08-custom-visualization/) | Subclass `BaseVisualization`; register via per-instance `VisualizationRegistry` | `BaseVisualization`, `VisualizationRegistry` |
| 09 | [`09-multi-table`](./09-multi-table/) | Two tables sharing a `FilterPresetManager` and a `SessionStore` | shared `presets.manager`, shared `persistence.sessionStore` |
| 10 | [`10-column-export`](./10-column-export/) | Read a column out as a typed array; toggle the synthetic `__rowid__` in the grid | `actions.getColumnValues`, `ROWID_COLUMN`, `actions.showColumn` |
| 11 | [`11-annotations`](./11-annotations/) | Programmatic row / column / cell annotations with severity, JSON round-trip, IndexedDB persistence, intersection popover | `table.annotations.*` (`add`, `addMany`, `getByCell`, `setSeverityFilter`, `toJSON`, `loadJSON`, `on('change', …)`) |
| 12 | [`12-column-header-tooltips`](./12-column-header-tooltips/) | Structured popover (title / description / items + enum chips) anchored on the column-name span; XSS-safe; stateless demo (`persistence: false`) | `actions.setColumnHeaderTooltip`, `actions.getColumnHeaderTooltip` |
| 13 | [`13-custom-stats-panel`](./13-custom-stats-panel/) | Replace the column-header `.dt-col-stats` slot with a `BaseStatsPanel` subclass. Numeric panel does `n · μ · σ` via a custom `AVG` / `STDDEV_POP` query; categorical panel does `top: <value> (<pct>%)`; both re-query on every filter change with a per-panel `fetchSeq` stale-result guard | `BaseStatsPanel`, `StatsPanelRegistry`, `StatsPanelOptions` |

For the full API, see [`docs/api-reference.md`](../docs/api-reference.md).
