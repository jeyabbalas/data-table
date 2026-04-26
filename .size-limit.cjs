/* eslint-disable */
/**
 * Bundle-size budgets per dist/ entry.
 *
 * Sizes are reported in **brotli-compressed** form (size-limit's default,
 * matching what browsers receive over HTTPS). Initial budgets = current
 * brotli baseline + ~10–15% headroom, so unrelated peer-dependency churn
 * doesn't trip the gate. Phase 9 tightens these once the subsystem reviews
 * close known waste in worker loaders, value-counts data preparation, and
 * the histogram base.
 *
 * Lazy-chunk filenames are content-hashed by Vite (`VisualizationRegistry-*`),
 * so we glob; the underlying chunk is always reachable via the
 * `lazyExportDialog` dynamic import in `src/DataTable.ts`.
 *
 * Phase-2 baseline (brotli, captured 2026-04-26):
 *   root entry · ESM        7.01 kB   →   8 kB   cap
 *   root entry · CJS        6.17 kB   →   7 kB   cap
 *   advanced entry · ESM    2.30 kB   →   3 kB   cap
 *   advanced entry · CJS    2.00 kB   →   2.5 kB cap
 *   stylesheet             15.28 kB   →  18 kB   cap
 *   lazy chunk · ESM       76.51 kB   →  90 kB   cap
 *   lazy chunk · CJS       71.26 kB   →  85 kB   cap
 */
module.exports = [
  {
    name: 'root entry · ESM (dist/data-table.js)',
    path: 'dist/data-table.js',
    limit: '8 kB',
  },
  {
    name: 'root entry · CJS (dist/data-table.cjs)',
    path: 'dist/data-table.cjs',
    limit: '7 kB',
  },
  {
    name: 'advanced entry · ESM (dist/advanced.js)',
    path: 'dist/advanced.js',
    limit: '3 kB',
  },
  {
    name: 'advanced entry · CJS (dist/advanced.cjs)',
    path: 'dist/advanced.cjs',
    limit: '2.5 kB',
  },
  {
    name: 'stylesheet (dist/data-table.css)',
    path: 'dist/data-table.css',
    limit: '18 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '90 kB',
  },
  {
    name: 'lazy ExportDialog chunk · CJS',
    path: 'dist/VisualizationRegistry-*.cjs',
    limit: '85 kB',
  },
];
