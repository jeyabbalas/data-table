# Examples

Eight single-feature examples for `@jeyabbalas/data-table`. Each one is ≤ 50 LOC, imports from `@jeyabbalas/data-table` (not `../src/`), and demonstrates one focused pattern.

## Run

From the repo root:

```bash
npm run example
```

Then open `http://localhost:5173/`. The landing page links each example.

No pre-build needed — Vite serves the library from source via aliases (see `vite.examples.config.ts`).

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

For the full API, see [`docs/api-reference.md`](../docs/api-reference.md).
