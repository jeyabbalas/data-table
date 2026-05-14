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
 * Current baseline (brotli, captured after the modal-lazy-import refactor that
 * introduced `derivedColumns` and dynamic-imported SQLFilterModal,
 * DerivedColumnModal, DerivedColumnEditPanel, FilterPresetPanel):
 *   root entry · ESM                7.67 kB   →   8.1 kB cap (5.6 %)
 *   advanced entry · ESM            2.44 kB   →   2.6 kB cap (6.6 %)
 *   stylesheet                     16.14 kB   →  17 kB   cap (5.3 %)
 *   lazy ExportDialog chunk        63.29 kB   →  67 kB   cap (5.9 %)
 *   lazy SQLFilterModal chunk       2.48 kB   →   2.6 kB cap (4.8 %)
 *   lazy DerivedColumnModal         3.58 kB   →   3.8 kB cap (6.1 %)
 *   lazy DerivedColumnEditPanel     2.95 kB   →   3.1 kB cap (5.1 %)
 *   lazy FilterPresetPanel          2.50 kB   →   2.7 kB cap (8.0 %)
 *   lazy CodeMirror editor          5.16 kB   →   5.5 kB cap (6.6 %)
 *   lazy ModalHost (shared)         5.25 kB   →   5.6 kB cap (6.7 %)
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
    limit: '17 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '67 kB',
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
  {
    name: 'lazy ModalHost shared chunk · ESM',
    path: 'dist/ModalHost-*.js',
    limit: '5.6 kB',
  },
];
