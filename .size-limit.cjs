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
 * Current baseline (brotli, captured under Vite 8.0.13 / rolldown 1.0.1, which
 * inlined the shared ModalHost code into each modal consumer and shifted some
 * helper code into VisualizationRegistry):
 *   root entry · ESM               10.82 kB   →  11.4 kB cap (5.4 %)
 *   advanced entry · ESM            2.46 kB   →   2.6 kB cap (5.7 %)
 *   stylesheet                     19.65 kB   →  20.7 kB cap (5.3 %)
 *   lazy ExportDialog chunk        74.65 kB   →  78.5 kB cap (5.2 %)
 *   lazy SQLFilterModal chunk       2.49 kB   →   2.6 kB cap (4.4 %)
 *   lazy DerivedColumnModal         3.59 kB   →   3.8 kB cap (5.9 %)
 *   lazy DerivedColumnEditPanel     2.96 kB   →   3.1 kB cap (4.7 %)
 *   lazy FilterPresetPanel          2.52 kB   →   2.7 kB cap (7.1 %)
 *   lazy CodeMirror editor          5.16 kB   →   5.5 kB cap (6.6 %)
 *
 * ModalHost no longer ships as a separate chunk: rolldown 1.0.1 inlines the
 * shared ModalHost helpers into each modal consumer. The per-modal caps above
 * already cover the added bytes.
 *
 * Root-entry history. 8.12 → 10.82 kB is Phase 2, lazy visualizations, and it
 * is the largest single-phase move this entry has made — worth stating rather
 * than absorbing. Both halves land here because both are statically reachable
 * from `src/DataTable.ts`: `VizDataController` (the per-column state machine,
 * its IntersectionObserver plumbing and its bounded fetch pump) and the
 * facade wiring around it (`normalizeVisualizations`, `whenVizReady`, the
 * `vizReady` generation gate, snapshot seeding through `createVizForColumn`,
 * and the coalesced stats sweep). `ThemeWatcher` and the approximate-distinct
 * helpers are in the visualization chunk, not here.
 *
 * It is not obviously reducible: the controller has to exist synchronously
 * when `attachVisualizations` runs, so moving it behind the dynamic `import()`
 * that already lazies the chart classes would turn a synchronous seam
 * asynchronous — the jsdom suites read a created instance two microtask turns
 * after mount, and the fallback path creates instances inline for exactly
 * that reason. Deferred rather than dismissed: a later phase that revisits
 * the attach seam should reconsider it, and 2.6 kB of entry for charts that
 * `visualizations: false` never uses is the argument for doing so.
 *
 * The visualization chunk moved far less — 73.57 → 74.65 kB — because the
 * snapshot seams, the shared theme observer and the approximate-distinct
 * switch are all small next to the chart classes already in it.
 *
 * Earlier root-entry history. 7.65 → 8.14 kB was the Phase 1 load path: the
 * `reading`-stage byte reporting and streaming URL read in `DataLoader`, the
 * BOM guard, the transfer list on `WorkerBridge`'s load message, and the
 * `loadProgress` clamp in `DataTable`. Note where those bytes did *not* come
 * from — the loaders, the type planner, and the dispatcher are in the worker
 * chunk, which no entry here measures, so the type-detection rewrite that is
 * most of the phase cost nothing at this gate. Cap raised 8.1 → 8.6 kB to
 * restore the ~5 % headroom the file's convention asks for; the previous cap
 * had 38 B left.
 *
 * Phase 3, body column windowing, moved almost nothing here and that is the
 * interesting part. The root entry went 10.82 → 10.83 kB — `ColumnWindow`'s
 * prefix sums, binary search and window arithmetic land in it (`TableBody` is
 * statically reachable from `DataTable`), and they are offset almost exactly
 * by what the same phase deleted: the two per-cursor-move O(N) loops in
 * `KeyboardNavigator`, the per-row `getComputedStyle` and pinned-offset
 * rebuild, and `returnRowToPool`'s `cloneNode` path. The cap stays at 11.4 kB
 * with ~0.57 kB of headroom.
 *
 * The **stylesheet** did move, 18.96 → 19.65 kB, which put it 47 B over its
 * cap. The rules themselves are three lines — `box-sizing: border-box` on
 * `.dt-cell` and `.dt-col-header`, and a two-property `.dt-col-spacer` — minus
 * two deleted `:last-child` blocks. The rest is the comment prose explaining
 * why, which ships verbatim (see the note below on `buildStylesPlugin`). Cap
 * raised 19.6 → 20.7 kB to restore this file's ~5 % convention.
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
    limit: '2.6 kB',
  },
  {
    name: 'stylesheet (dist/data-table.css)',
    path: 'dist/data-table.css',
    limit: '20.7 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '78.5 kB',
  },
  {
    name: 'lazy SQLFilterModal chunk · ESM',
    path: 'dist/SQLFilterModal-*.js',
    limit: '2.6 kB',
  },
  {
    name: 'lazy DerivedColumnModal chunk · ESM',
    path: 'dist/DerivedColumnModal-*.js',
    limit: '3.8 kB',
  },
  {
    name: 'lazy DerivedColumnEditPanel chunk · ESM',
    path: 'dist/DerivedColumnEditPanel-*.js',
    limit: '3.1 kB',
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
];
