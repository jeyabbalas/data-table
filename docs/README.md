# Documentation

Deep-dive documentation for [`@jeyabbalas/data-table`](../README.md). Start with
the top-level README for installation and a quick-start; come here when you
need a walkthrough, a reference, or a troubleshooting playbook.

## Start here

- [Quick start](../README.md#quick-start) — mount a table in ~10 lines
- [Runnable examples](../examples/README.md) — ten focused single-feature examples, browsable from the demo via `npm run dev`
- [AGENTS.md](../AGENTS.md) — coding-agent orientation: capability matrix, clarifying-question checklist, canonical snippets, pitfalls

## Reference

- [API reference](./api-reference.md) — every option, event, action, error code, filter shape, derived-column type
- [Troubleshooting](./troubleshooting.md) — 23 error codes and 15 common-issue FAQs with fix snippets
- [Performance](./performance.md) — architectural limits, self-benchmarking methodology

## Guides (task-oriented)

- [Loading data](./guides/loading-data.md) — File / URL / Blob / ArrayBuffer, format detection, progress
- [Filters](./guides/filters.md) — seven filter types, programmatic construction, serialization
- [Derived columns](./guides/derived-columns.md) — SQL-expression and pre-computed vector columns
- [Events](./guides/events.md) — event catalog, lifecycle ordering, error discrimination
- [Visualizations](./guides/visualizations.md) — built-ins and custom class registration
- [Session persistence](./guides/session-persistence.md) — IndexedDB lifecycle, sync-save, custom store
- [Theming](./guides/theming.md) — complete `--dt-*` CSS variable reference, dark mode, per-instance overrides
- [Internationalization (i18n)](./guides/i18n.md) — `Strings` interface, `DeepPartial` overrides, function-typed strings
- [Accessibility](./guides/accessibility.md) — keyboard map, ARIA surface, screen-reader testing recipes
- [Multi-table dashboards](./guides/multi-table.md) — shared presets and storage across instances
- [CSP and offline deployments](./guides/csp-and-offline.md) — custom worker factory, self-hosted WASM
- [Filter presets](./guides/filter-presets.md) — save / load / export / import JSON

## Concepts (deep dives)

- [Architecture](./concepts/architecture.md) — signals, worker bridge, crossfilter coordinator, virtual scroller, modal host
- [State model](./concepts/state-model.md) — `TableState` field inventory, subscription patterns, undo snapshots

## Integrations

### Frameworks

- [React](./integrations/react.md)
- [Vue](./integrations/vue.md)
- [Svelte](./integrations/svelte.md)
- [Solid](./integrations/solid.md)
- [Next.js](./integrations/nextjs.md)
- [Nuxt](./integrations/nuxt.md)

### Bundlers and CDN

- [Vite](./integrations/vite.md)
- [Webpack](./integrations/webpack.md)
- [CDN (no-build)](./integrations/cdn.md)

---

## Finding things fast

- **"What does option `X` do?"** → [API reference](./api-reference.md).
- **"What's the error code `Y`?"** → [Troubleshooting](./troubleshooting.md).
- **"How do I do `Z`?"** → start in [Guides](#guides-task-oriented). Each guide links back to the API reference for type signatures.
- **"I'm an AI agent writing code against this library."** → [AGENTS.md](../AGENTS.md) first, then this index.

Documentation source lives alongside the code. Corrections and additions are
welcome — open an issue or PR at the repo root.
