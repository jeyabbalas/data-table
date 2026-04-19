# @jeyabbalas/data-table

A client-side TypeScript library for interactive, explorable data tables.
Built on [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview) — all
analytics run entirely in the browser, so no data ever leaves the user's
machine.

- Per-column visualizations (histograms, value counts, date/time histograms)
  with brush/click crossfilter
- Manual filter UI per column + raw-SQL `WHERE` filters
- Pin / hide / reorder / resize columns; virtual scrolling
- Derived columns (SQL expressions or JS-provided value vectors)
- Filter presets (import/export JSON)
- Undo/redo and IndexedDB session persistence
- CSV / JSON / Parquet export
- Automatic light/dark mode via CSS custom properties

## Install

```bash
npm install @jeyabbalas/data-table \
  @duckdb/duckdb-wasm \
  @codemirror/autocomplete @codemirror/commands @codemirror/lang-sql \
  @codemirror/language @codemirror/state @codemirror/view @lezer/highlight
```

`@duckdb/duckdb-wasm` is a required peer dependency. The `@codemirror/*`
and `@lezer/*` packages are optional peers — install them only if you use
the default SQL expression editor (for derived columns and raw-SQL filters).
If you supply your own `editorFactory` or disable those features, you can
omit them.

## Quick start

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container: document.getElementById('my-table')!,
  source: myCsvFileOrUrl,      // File | string URL | ArrayBuffer | Blob
});

table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(`${filters.length} filters, ${filteredRowCount} rows match`);
});

// When unmounting (e.g., route change in an SPA):
await table.destroy();
```

## Documentation

- **Start here:** Quick start (above) · [Runnable examples](./examples/README.md)
- **API reference:** [docs/api-reference.md](./docs/api-reference.md) — every option, event, action, error, filter shape, and derived-column type.
- **Troubleshooting:** [docs/troubleshooting.md](./docs/troubleshooting.md) — error codes and 15 FAQs with fix snippets.
- **For AI coding agents:** [AGENTS.md](./AGENTS.md) — capability matrix, clarifying-question checklist, canonical snippets, pitfalls.
- **Source:** Tier-1 exports live in [`src/index.ts`](./src/index.ts); Tier-2 in [`src/advanced.ts`](./src/advanced.ts).

## Framework integration

The library is **browser-only** — it uses Web Workers, `window`, `document`,
and IndexedDB directly, and is not safe to evaluate during SSR. Mount the
table inside your framework's client-side lifecycle hook.

### React

```tsx
import { useEffect, useRef } from 'react';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

export function Table({ source }: { source: File | string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let instance: DataTable | undefined;
    void createDataTable({ container: hostRef.current, source }).then((t) => {
      if (cancelled) { void t.destroy(); return; }
      instance = t;
    });
    return () => {
      cancelled = true;
      if (instance && !instance.isDestroyed()) void instance.destroy();
    };
  }, [source]);
  return <div ref={hostRef} style={{ height: 600 }} />;
}
```

The `cancelled` flag handles the case where the effect re-runs before
`createDataTable` resolves. `isDestroyed()` guards against double destroys
when React's Strict Mode double-invokes effects in dev.

### Vue 3

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const host = ref<HTMLElement | null>(null);
let table: DataTable | undefined;

onMounted(async () => {
  if (host.value) table = await createDataTable({ container: host.value, source: props.source });
});
onBeforeUnmount(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
</template>
```

After `destroy()`, the public methods (`loadData`, `on`, `off`,
`openExportDialog`, `clearSession`, `setColorScheme`) throw `DestroyedError`.
Check `table.isDestroyed()` in long-lived closures before calling them.

## Feature toggles

All features are on by default; pass `false` or a config object to customize:

| Option              | Default | Notes                                                 |
|---------------------|---------|-------------------------------------------------------|
| `persistence`       | `true`  | Auto-save filters/sort/columns to IndexedDB           |
| `presets`           | `true`  | Show the "Presets" button for saving filter sets      |
| `undoRedo`          | `true`  | Ctrl/Cmd+Z and Ctrl+Y keyboard shortcuts              |
| `expressionFilter`  | `true`  | Show the "Expression" (raw SQL) filter button         |
| `visualizations`    | `true`  | Auto-attach column header histograms / value counts   |
| `exportDialog`      | `true`  | `table.openExportDialog()` opens a CSV/JSON/Parquet modal |

For the full options surface (mounting, worker, UI, customization), see
[docs/api-reference.md#createdatatableoptions](./docs/api-reference.md#createdatatableoptions).

## Events

Subscribe with `table.on(event, handler)` — returns an unsubscribe function.
The event bus covers `ready`, `loadStart` / `loadProgress` / `loadComplete` /
`loadError`, `filterChange`, `sortChange`, `selectionChange`, `columnChange`,
`derivedChange`, `undoChange`, `destroy`, plus `error` and `warning` for
recoverable failure modes. See
[docs/api-reference.md#event-catalog](./docs/api-reference.md#event-catalog)
for payload types.

## Theming

All colors, spacing, and typography are driven by CSS custom properties on
`:root`. Override globally:

```css
:root {
  --dt-primary: #10b981;
  --dt-radius: 4px;
  --dt-z-modal: 1500;        /* raise above your app's modal layer */
  --dt-panel-width: 420px;   /* widen filter / preset / derived-edit panels */
}
```

Or per-instance via a class on the table element:

```html
<div id="my-table" class="dt-root mint-theme"></div>
<style>
  .dt-root.mint-theme { --dt-primary: #10b981; }
</style>
```

Light/dark mode follows `prefers-color-scheme` by default. Pass
`colorScheme: 'light' | 'dark' | 'auto'` to force a theme, or call
`table.setColorScheme(...)` at runtime. Body-portalled modals (export,
SQL filter, derived-column) stay in sync via `MutationObserver`.

<details>
<summary>Complete CSS variable reference (90+ variables)</summary>

<!-- dt-vars:start -->

Every CSS custom property the library reads. All default to light-mode
values declared on `:root`; dark-mode variants apply automatically under
`prefers-color-scheme: dark` (unless the instance carries
`data-dt-color-scheme="light"`) and unconditionally under
`data-dt-color-scheme="dark"`.

#### Palette

| Variable | Role |
|---|---|
| `--dt-primary` | Accent colour for focused UI, buttons, sort indicators. |
| `--dt-primary-hover` | Hover state for `--dt-primary`. |
| `--dt-primary-light` | Light wash behind active rows/filters. |
| `--dt-primary-lighter` | Lighter wash for selected-row backgrounds. |
| `--dt-primary-alpha-10` | 10% alpha of `--dt-primary` (derived via `color-mix`). |
| `--dt-primary-alpha-20` | 20% alpha of `--dt-primary`. |
| `--dt-primary-alpha-30` | 30% alpha of `--dt-primary`. |
| `--dt-primary-alpha-50` | 50% alpha of `--dt-primary`. |
| `--dt-accent` | Secondary accent (null bars, warning chrome). |
| `--dt-accent-hover` | Hover state for `--dt-accent`. |
| `--dt-accent-soft` | Soft translucent version of `--dt-accent`. |
| `--dt-neutral` | Neutral slate for ValueCounts "Other" category. |
| `--dt-neutral-hover` | Hover state for `--dt-neutral`. |
| `--dt-neutral-soft` | Soft translucent version of `--dt-neutral`. |
| `--dt-success` | Success indicator colour (e.g. validated SQL). |

#### Surfaces

| Variable | Role |
|---|---|
| `--dt-bg` | Primary table background. |
| `--dt-bg-secondary` | Secondary background (header, filter bar). |
| `--dt-bg-tertiary` | Tertiary background (hover rows, input fills). |
| `--dt-border` | Primary border colour. |
| `--dt-border-light` | Subtle border for nested components. |
| `--dt-backdrop` | Modal scrim (semi-transparent). |

#### Text & icons

| Variable | Role |
|---|---|
| `--dt-text` | Default text colour. |
| `--dt-text-secondary` | Secondary / caption text. |
| `--dt-text-tertiary` | Tertiary / placeholder text. |
| `--dt-arrow-default` | Idle colour for sort/expand icons. |
| `--dt-arrow-hover` | Hover colour for sort/expand icons. |

#### Error / validation

| Variable | Role |
|---|---|
| `--dt-error` | Base error colour. |
| `--dt-error-dark` | Darker error accent (button hover, text). |
| `--dt-error-darker` | Strongest error accent. |
| `--dt-error-soft` | Soft translucent error wash. |
| `--dt-error-bg` | Error surface background (banners, panels). |
| `--dt-error-border-soft` | Soft border for error banners. |
| `--dt-error-text-strong` | Strong error text for dark-mode legibility. |
| `--dt-on-error` | Foreground on error-coloured surfaces. |

#### Sizing

| Variable | Default | Role |
|---|--:|---|
| `--dt-header-height` | `120px` | Column header area height (room for visualizations). |
| `--dt-row-height` | `32px` | Virtual-scroller row height. |
| `--dt-col-width` | `200px` | Default column width. |
| `--dt-scrollbar-width` | `17px` | Reserved gutter for the body's vertical scrollbar. |
| `--dt-panel-width` | `320px` | Floating-panel (filter / preset / derived-edit) width. |
| `--dt-radius` | `8px` | Default border radius. |
| `--dt-radius-sm` | `4px` | Small border radius (buttons, chips). |

#### Typography

| Variable | Role |
|---|---|
| `--dt-font-family` | Font family for all library chrome. |
| `--dt-font-size` | Base font size. |
| `--dt-font-size-sm` | Small font size (filter chips, hints). |
| `--dt-font-size-xs` | Extra-small font size (stats captions). |

#### Effects

| Variable | Role |
|---|---|
| `--dt-transition` | Shared transition timing (`0.15s ease`). |
| `--dt-shadow-sm` | Small elevation shadow. |
| `--dt-shadow-md` | Medium elevation shadow (panels, modals). |

#### Syntax highlighting

| Variable | Role |
|---|---|
| `--dt-syntax-string` | String literals in the SQL editor. |
| `--dt-syntax-type` | Type keywords in the SQL editor. |

#### Stacking ladder

Every `z-index` in the library goes through a `--dt-z-*` variable, so you
can interleave your own layers without hunting through the stylesheet.

| Variable | Default | Layer |
|---|--:|---|
| `--dt-z-table-body` | `1` | Table body cells (focused cells, resize handle). |
| `--dt-z-pinned-col` | `20` | Sticky pinned-column base; JS adds per-pin offsets. |
| `--dt-z-header` | `21` | Column header row + hidden-columns gutter. |
| `--dt-z-action-panel` | `30` | Per-column action panel popovers. |
| `--dt-z-filter-bar` | `40` | Filter bar at the top of the table. |
| `--dt-z-floating-panel` | `50` | In-page panels (filter, preset, derived-edit). |
| `--dt-z-autocomplete` | `60` | CodeMirror autocomplete tooltip (portalled to `<body>`). |
| `--dt-z-modal` | `1000` | Full-screen modals + backdrops. |
| `--dt-z-modal-stack-step` | `2` | Step added per stacked modal/panel so two-at-once dialogs layer predictably. |

Simultaneously-open modals or panels receive `--dt-z-{modal,floating-panel}
+ stackIndex * --dt-z-modal-stack-step`. Gaps are ≥ 10 so you can slot
host-app UI between layers:

```css
:root {
  --dt-z-modal: 5000;
  --dt-z-autocomplete: 4900;
  --dt-z-floating-panel: 4800;
}
```

Pinned-column stacking is computed as `--dt-z-pinned-col + pinOrderOffset`,
so overriding `--dt-z-pinned-col` shifts the whole pinned group together.

#### Internal

| Variable | Role |
|---|---|
| `--dt-stylesheet-loaded` | Library-internal marker used by `createDataTable()` to warn when the stylesheet import is missing. Do not override. |

<!-- dt-vars:end -->

</details>

## CSS isolation

All selectors carry the `dt-` prefix. Column-drag cursor, CodeMirror
autocomplete, and modal stacking are all scoped so they don't collide with
host styles. For stricter isolation (two copies of the library on one page,
strict brand walls), pass `classPrefix: 'myapp-dt'` and every selector,
modal, and tooltip re-renders with that prefix.

Shadow DOM is intentionally not used — modals portal into light DOM so they
can inherit `--dt-*` variables from `:root`. Wrap the library in a shadow
root yourself if you need that, and forward the theme variables +
`portalTarget` accordingly.

## Error handling

Every error extends `DataTableError` (which extends `Error`). Subscribe to
the `error` event to route by subsystem, or to `warning` for non-fatal
degradations like `STYLESHEET_MISSING` / `PERSISTENCE_UNAVAILABLE`:

```ts
table.on('error', ({ error, source }) => {
  if (error.code === 'PARSE_FAILED') toast('Could not read that file.');
  else if (source === 'persistence') console.warn(error);
  else reportToSentry(error);
});
```

For the full list of 23 error codes with triggers and fixes, see
[docs/troubleshooting.md](./docs/troubleshooting.md).

## Multiple tables, CSP, and offline

- **Multiple tables:** share a `WorkerBridge` (and optionally a
  `SessionStore` / `FilterPresetManager`) to avoid spinning up two DuckDB
  instances. Give each table a distinct `tableName` so session snapshots
  don't clobber each other.
- **CSP / air-gapped:** self-host the worker and WASM bundles and pass
  `bridgeOptions.workerFactory` + `bridgeOptions.duckdbBundles`.

See [AGENTS.md §3(h)](./AGENTS.md#3-canonical-snippets) for a shared-bridge
snippet, and [docs/troubleshooting.md §4](./docs/troubleshooting.md#4-duckdb-cdn-blocked-by-csp)
for the CSP recipe.

## Accessibility

The grid targets WCAG 2.1 AA: `role="grid"` with `aria-rowcount` /
`aria-colcount`, roving-tabindex arrow-key navigation, polite `aria-live`
announcements on filter/sort/row-count changes, focus trap + escape-to-close
on every modal, and `axe-core` as a CI gate. Known out-of-scope: in-cell
editing, mobile touch gestures, RTL.

## Custom visualizations

Subclass `BaseVisualization` (from `/advanced`) and register on a
per-instance `VisualizationRegistry`:

```ts
import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
import { BaseVisualization } from '@jeyabbalas/data-table/advanced';

class MyViz extends BaseVisualization { /* fetchData, render, … */ }

const registry = new VisualizationRegistry();
registry.register({ name: 'my-viz', isApplicable: t => t === 'float', constructor: MyViz as any, priority: 10 });
const table = await createDataTable({ container, source, visualizationRegistry: registry });
```

Runnable version in [examples/08-custom-visualization](./examples/08-custom-visualization/).

## Internationalization

Every user-facing string comes from a typed `Strings` object. Pass a
`DeepPartial<Strings>` via `messages`; missing keys fall back to English
defaults. Messages are resolved once at construction — recreate the table
to switch locales.

```ts
await createDataTable({
  container, source,
  messages: {
    common: { close: 'Fermer', apply: 'Appliquer' },
    filters: { panelTitle: 'Filtres' },
  },
});
```

Runnable version in [examples/07-i18n-french](./examples/07-i18n-french/).

## Browser support

| API | Used for |
|---|---|
| `Worker` | DuckDB runs in a dedicated worker |
| `WebAssembly` | DuckDB is compiled to Wasm |
| `IndexedDB` | Session persistence (skipped when `persistence: false`) |
| `ResizeObserver` | Column resize, responsive visualizations |
| `BigInt` | DuckDB integer columns cross the worker boundary as BigInt |
| `structuredClone` | Bridge snapshots result sets |

Roughly Chrome/Edge 98+, Firefox 94+, Safari 15.4+. Probe at runtime with
`checkBrowserSupport()` or opt into fail-fast init via
`strictBrowserCheck: true`. See
[docs/api-reference.md#browser-support-probe](./docs/api-reference.md#browser-support-probe).

## Advanced: modular API

The root entry (`@jeyabbalas/data-table`) exposes the facade plus a small
set of stable hooks. Power users who want to orchestrate the stack directly
— custom visualization lifecycles, headless use, driving the bridge
themselves — can import the building blocks from `/advanced`:

```ts
import { TableContainer, FilterBar, ExportDialog, BaseVisualization /* … */ }
  from '@jeyabbalas/data-table/advanced';
```

The `/advanced` surface trades stability for flexibility: it is **not**
covered by the same semver guarantees as the root entry. See
[docs/api-reference.md#tier-2-exports](./docs/api-reference.md#tier-2-exports)
for the full symbol list.

## Development

```bash
npm install
npm run dev              # library playground
npm run dev:demo         # demo app on http://localhost:5173/data-table/
npm run example          # examples dev server at http://localhost:5173/
npm test
npm run build            # emits dist/data-table.{js,cjs} + dist/index.d.ts
npm run build:demo
```

## License

MIT
