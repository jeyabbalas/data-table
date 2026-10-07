/* eslint-disable */
/**
 * Bundle-size budgets per dist/ entry.
 *
 * Sizes are reported in **brotli-compressed** form (size-limit's default,
 * matching what browsers receive over HTTPS).
 *
 * Caps key off measured size + ~5 % headroom (matches size-limit's default
 * regression threshold) so unintended growth surfaces in CI.
 *
 * Lazy-chunk filenames are content-hashed by Vite (e.g. `VisualizationRegistry-*`,
 * `SQLFilterModal-*`), so we glob; the underlying chunks are reached via
 * dynamic `import()` boundaries: `lazyExportDialog` in `src/DataTable.ts`
 * and the modal-open handlers in `src/table/TableContainer.ts`.
 *
 * CJS bundles were dropped in 0.4.0 (see `.changeset/fix-worker-url-and-cjs-drop.md`)
 * — the library is browser-only and the worker is itself an ES module that a CJS
 * wrapper cannot load. Only ESM + CSS are measured now.
 *
 * Current baseline (brotli, re-measured after the review fixes to the
 * nested-type work under Vite 8.2.0 / rolldown 1.2.1, which, like rolldown
 * 1.0.1 before it, inlines the shared ModalHost code into each modal
 * consumer):
 *   root entry · ESM               10.93 kB   →  11.4 kB cap (4.3 %)
 *   advanced entry · ESM            2.32 kB   →   2.45 kB cap (5.6 %)
 *   stylesheet                     22.57 kB   →  23.7 kB cap (5.0 %)
 *   lazy ExportDialog chunk        97.67 kB   → 100 kB   cap (2.4 %)
 *   lazy SQLFilterModal chunk       2.53 kB   →   2.6 kB cap (2.8 %)
 *   lazy DerivedColumnModal         3.77 kB   →   3.95 kB cap (4.8 %)
 *   lazy DerivedColumnEditPanel     3.15 kB   →   3.3 kB cap (4.8 %)
 *   lazy FilterPresetPanel          2.62 kB   →   2.7 kB cap (3.1 %)
 *   lazy CodeMirror editor          5.16 kB   →   5.5 kB cap (6.6 %)
 *   lazy extractExpression chunk    2.81 kB   →   2.95 kB cap (5.0 %)
 *   lazy ValueInspector chunk       8.45 kB   →   8.9 kB cap (5.3 %)
 *   lazy ExtractColumnPanel chunk   4.95 kB   →   5.3 kB cap (7.1 %)
 *   lazy TreeView chunk             2.79 kB   →   2.85 kB cap (2.2 %)
 *
 * The two derived-column chunks were last measured once their panels
 * showed the errors the stylesheet had hidden, with the name and values
 * fields labelled and described by them: DerivedColumnModal went from
 * 3.63 to 3.77 kB and DerivedColumnEditPanel from 3.04 to 3.15 kB, and
 * their caps from 3.8 and 3.1 kB.
 *
 * Root entry history. It measured 7.68 kB until the column charts became
 * lazy; `LazyVizController` took it to 8.80 kB. The controller is only
 * reachable from `createDataTable`, so it lands in the root entry, and
 * `visualizations: false` pays for it too. The shared chunk
 * the root entry imports is loaded up front as well, so moving the
 * controller there would not change what a page downloads. Keeping charts
 * and custom stats panels through column changes, and building panels only
 * for the columns near the view, took it from 9.00 to 9.38 kB, and the cap
 * from 9.3 to 9.8 kB. The fixes after that took it to 9.68 kB. Rejecting
 * pending worker requests when the worker fails, instead of leaving them
 * waiting, and reporting that failure once from the table, took it to
 * 10.17 kB, and the cap to 10.7 kB. Showing a chart whose fetch failed as
 * failed (its stats slot's text, the error's column on a copy of the error,
 * the table-wide count kept current for a chart without stats) added 0.29 kB.
 * Merged with the other fixes of that round (load options passed to the
 * worker and `loadProgress` emitted, derived-column changes run one at a
 * time, a failed initial load torn down, loads that report the tables they
 * replace), it measured 10.85 kB, and the cap moved to 11.4 kB. The
 * nested-type work left it at 10.93 kB.
 *
 * Advanced entry history. Removing the deprecated `VisualizationFactory`
 * took it from 2.50 to 2.32 kB, and the cap from 2.6 to 2.45 kB.
 *
 * ExportDialog chunk history. Despite its name, the glob matches the shared
 * `VisualizationRegistry-*` chunk, which holds most of the table: header,
 * body, keyboard navigation. It measured 69.91 kB until the column-geometry
 * work (the one column layout, the pinned-column fixes, the measured
 * scrollbar gutter) took it to 74.03 kB. The column window, which renders
 * and fetches only the columns near the view, took it to 77.47 kB, and the
 * header work after it to 78.21 kB: columns held while a drag or a panel
 * uses them, header controls built and taken down with their column, and a
 * header row and body updated in place on a column change instead of
 * rebuilt. The cap moved from 78 to 82 kB then. The same work took the stylesheet
 * from 18.66 to 19.45 kB, mostly in comments (see below), and its cap from
 * 19.6 to 20.4 kB. The fixes after the column work took the chunk to
 * 81.35 kB (drops hit-tested against the layout, the header's scroll echo,
 * the viewport height, the dialogs' focus) and its cap to 85 kB, and the
 * stylesheet to 20.51 kB (narrow headers' clipped controls, the SQL filter
 * modal's Remove section, the failed chart's line) and its cap to 21.5 kB.
 * Measured again under Vite 8.2.0 / rolldown 1.2.1, the chunk was 81.61 kB
 * before nested columns. Their type parser, bounded cell text and exact
 * text filters took it to 84.28 kB, and their header label and summary
 * chart to 87.80 kB, and the cap to 92 kB. Reading cell and column values
 * exactly, nested ones as JSON, took it to 91.28 kB, and the cap to 96 kB.
 * The `codeSplitting` group in `vite.config.ts` (see the ValueInspector
 * chunk below) took it to 94.04 kB, and "extract field → column" from the
 * UI (the header's extract button, the panels' wiring) to 94.98 kB, and the
 * cap to 100 kB. The fixes after it (F2 on a row still loading, the value
 * inspector's focus) left it at 95.22 kB, and the review fixes, among them
 * the bounded formatting of nested cells, the derived-column checks, the
 * exact reads' paging and the panels' waiting opens, at 97.67 kB. The 0.9.0
 * "nice to have" fixes (RT-16 – RT-21: dates and times exported as ISO text,
 * NaN and infinity left out of charts, sub-second intervals, TIME WITH TIME
 * ZONE charts, extreme dates and more) took it to 100.12 kB, and the cap to
 * 104 kB.
 *
 * extractExpression chunk history. New with `actions.addNestedFieldColumn`,
 * at 2.79 kB: the SQL that reads one part of a nested or JSON column, loaded
 * the first time a column is extracted.
 *
 * ValueInspector chunk history. New with the value inspector (F2, a double
 * click or the inspect icon on a nested or JSON cell), at 10.59 kB: the
 * panel, the tree view and the value-tree model, which pairs a value's JSON
 * with its DuckDB type. The JSON parser, the type parser and the cell read
 * it uses are shared with the table. Opening it also loads the
 * `extractExpression-*` chunk, for its "add as column" rules. With the
 * type parser shared by two lazy chunks and the table, rolldown would move
 * it, with `FilterSQL`, `errors` and `types`, into a chunk of their own that
 * the root entry imports (3.94 kB, which no budget here measured), and a
 * page would load 1.07 kB more: the `codeSplitting` group in
 * `vite.config.ts` keeps them in the shared chunk.
 *
 * ExtractColumnPanel chunk history. New with "extract field → column" from
 * the UI (the extract button on a nested or JSON column's header), at
 * 5.12 kB: the panel and its JSON path parser. It loads the
 * `extractExpression-*` chunk too, and shares the tree view with the
 * ValueInspector chunk, so rolldown moved `TreeView` out of that chunk into
 * a `TreeView-*` chunk the two load, measured here at 2.71 kB (cap
 * 2.85 kB): the ValueInspector chunk measured 8.51 kB with it gone, and its
 * cap moved from 11.2 to 8.9 kB. A page that opens both panels loads the
 * tree once. The review fixes dropped the tree's unused API and moved the two
 * panels' element and close-icon helpers into it, and took the copies the
 * inspector kept of shared rules out: TreeView 2.79 kB, ValueInspector
 * 8.45 kB and ExtractColumnPanel 4.95 kB.
 *
 * ModalHost no longer ships as a separate chunk: rolldown, since 1.0.1,
 * inlines the shared ModalHost helpers into each modal consumer. The
 * per-modal caps above already cover the added bytes.
 *
 * Stylesheet history. The line above previously read 16.94 kB; that figure was
 * never measured — the real size at that commit was 17.11 kB, so the gate had
 * ~0.7 kB less headroom than it advertised. The accessibility follow-up to
 * issue #84 then took it 17.11 → 18.66 kB: darker contrast tokens, the
 * roving-tabindex toolbars, and clipping the two scrollable regions that had
 * no focusable content.
 *
 * Worth knowing before the next CSS budget conversation: essentially all of
 * that 1.55 kB is *comment prose*, not rules. `buildStylesPlugin` in
 * `vite.config.ts` concatenates `src/styles/*.css` verbatim with no
 * minification, so every explanatory comment ships to users. Stripped of
 * comments the same stylesheet is 7.98 kB brotli — 57 % smaller, and the
 * rule payload actually shrank by ~30 bytes across this change. Minifying in
 * that concat step would make this budget a measure of CSS rather than of
 * documentation; it is deliberately left alone here because it changes
 * published output.
 *
 * Nested columns took it from 20.51 to 20.54 kB (the header's type label),
 * and the value inspector's panel and tree to 21.81 kB, and the cap from
 * 21.5 to 22.9 kB. The extract panel took it to 22.57 kB, and the cap to
 * 23.7 kB.
 *
 * Phase-9 baseline pre-refactor (kept for diff context):
 *   root entry · ESM        7.33 kB   →   7.7 kB cap
 *   advanced entry · ESM    2.36 kB   →   2.5 kB cap
 *   lazy chunk · ESM       77.43 kB   →  81 kB   cap (modal classes now split out)
 */
module.exports = [
  {
    name: 'root entry · ESM (dist/data-table.js)',
    path: 'dist/data-table.js',
    limit: '11.4 kB',
  },
  {
    name: 'advanced entry · ESM (dist/advanced.js)',
    path: 'dist/advanced.js',
    limit: '2.45 kB',
  },
  {
    name: 'stylesheet (dist/data-table.css)',
    path: 'dist/data-table.css',
    limit: '23.7 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '104 kB',
  },
  {
    name: 'lazy SQLFilterModal chunk · ESM',
    path: 'dist/SQLFilterModal-*.js',
    limit: '2.6 kB',
  },
  {
    name: 'lazy DerivedColumnModal chunk · ESM',
    path: 'dist/DerivedColumnModal-*.js',
    limit: '3.95 kB',
  },
  {
    name: 'lazy DerivedColumnEditPanel chunk · ESM',
    path: 'dist/DerivedColumnEditPanel-*.js',
    limit: '3.3 kB',
  },
  {
    name: 'lazy FilterPresetPanel chunk · ESM',
    path: 'dist/FilterPresetPanel-*.js',
    limit: '2.7 kB',
  },
  {
    name: 'lazy CodeMirror editor chunk · ESM',
    path: 'dist/CodeMirrorExpressionEditor-*.js',
    limit: '5.5 kB',
  },
  {
    name: 'lazy extractExpression chunk · ESM',
    path: 'dist/extractExpression-*.js',
    limit: '2.95 kB',
  },
  {
    name: 'lazy ValueInspector chunk · ESM',
    path: 'dist/ValueInspector-*.js',
    limit: '8.9 kB',
  },
  {
    name: 'lazy ExtractColumnPanel chunk · ESM',
    path: 'dist/ExtractColumnPanel-*.js',
    limit: '5.3 kB',
  },
  {
    name: 'lazy TreeView chunk · ESM',
    path: 'dist/TreeView-*.js',
    limit: '2.85 kB',
  },
];
