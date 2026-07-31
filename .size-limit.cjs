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
 *   root entry · ESM                7.65 kB   →   8.1 kB cap (5.9 %)
 *   advanced entry · ESM            2.42 kB   →   2.6 kB cap (7.4 %)
 *   stylesheet                     16.94 kB   →  17.8 kB cap (5.1 %)
 *   lazy ExportDialog chunk        67.58 kB   →  71 kB   cap (5.1 %)
 *   lazy SQLFilterModal chunk       2.49 kB   →   2.6 kB cap (4.4 %)
 *   lazy DerivedColumnModal         3.60 kB   →   3.8 kB cap (5.5 %)
 *   lazy DerivedColumnEditPanel     2.97 kB   →   3.1 kB cap (4.5 %)
 *   lazy FilterPresetPanel          2.52 kB   →   2.7 kB cap (7.1 %)
 *   lazy CodeMirror editor          5.16 kB   →   5.5 kB cap (6.6 %)
 *
 * ModalHost no longer ships as a separate chunk: rolldown 1.0.1 inlines the
 * shared ModalHost helpers into each modal consumer. The per-modal caps above
 * already cover the added bytes.
 *
 * The stylesheet baseline moved 16.22 → 16.94 kB with the ARIA-grid keyboard
 * fix (issue #84): a `.dt-grid` layout block, a `:focus-visible` ring for it,
 * and the header-row cursor ring. Its cap moved with it to keep the usual
 * ~5 % headroom rather than leaving the next CSS change to trip the gate.
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
    limit: '8.1 kB',
  },
  {
    name: 'advanced entry · ESM (dist/advanced.js)',
    path: 'dist/advanced.js',
    limit: '2.6 kB',
  },
  {
    name: 'stylesheet (dist/data-table.css)',
    path: 'dist/data-table.css',
    limit: '17.8 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '71 kB',
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
