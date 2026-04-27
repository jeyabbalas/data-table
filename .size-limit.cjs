/* eslint-disable */
/**
 * Bundle-size budgets per dist/ entry.
 *
 * Sizes are reported in **brotli-compressed** form (size-limit's default,
 * matching what browsers receive over HTTPS).
 *
 * Phase 9 (2026-04-26) actuals + ~5 % headroom — the review-plan §3 example
 * caps (root <30 kB, advanced <10 kB, lazy <150 kB) would mask real
 * regressions, so we deliberately key off measured size instead. The 5 %
 * headroom matches `size-limit`'s default regression threshold so any
 * meaningful unintended growth surfaces in CI.
 *
 * Lazy-chunk filenames are content-hashed by Vite (`VisualizationRegistry-*`),
 * so we glob; the underlying chunk is always reachable via the
 * `lazyExportDialog` dynamic import in `src/DataTable.ts`.
 *
 * Phase-9 baseline (brotli, captured 2026-04-26 after the
 * splitCrossfilterFilters removal, columnChange dedupe, loadComplete clone,
 * SESSION_VERSION_REJECTED warning, and high-contrast.css addition):
 *   root entry · ESM        7.33 kB   →   7.7 kB cap (5.0 %)
 *   root entry · CJS        6.46 kB   →   6.8 kB cap (5.3 %)
 *   advanced entry · ESM    2.36 kB   →   2.5 kB cap (5.9 %)
 *   advanced entry · CJS    2.01 kB   →   2.2 kB cap (9.5 %)
 *   stylesheet             16.14 kB   →  17 kB   cap (5.3 %)
 *   lazy chunk · ESM       77.43 kB   →  81 kB   cap (4.6 %)
 *   lazy chunk · CJS       71.85 kB   →  76 kB   cap (5.8 %)
 *
 * Phase-2 baseline pre-tightening (kept for diff context):
 *   root entry · ESM        7.01 kB   →   8 kB
 *   root entry · CJS        6.17 kB   →   7 kB
 *   advanced entry · ESM    2.30 kB   →   3 kB
 *   advanced entry · CJS    2.00 kB   →   2.5 kB
 *   stylesheet             15.28 kB   →  18 kB
 *   lazy chunk · ESM       76.51 kB   →  90 kB
 *   lazy chunk · CJS       71.26 kB   →  85 kB
 */
module.exports = [
  {
    name: 'root entry · ESM (dist/data-table.js)',
    path: 'dist/data-table.js',
    limit: '7.7 kB',
  },
  {
    name: 'root entry · CJS (dist/data-table.cjs)',
    path: 'dist/data-table.cjs',
    limit: '6.8 kB',
  },
  {
    name: 'advanced entry · ESM (dist/advanced.js)',
    path: 'dist/advanced.js',
    limit: '2.5 kB',
  },
  {
    name: 'advanced entry · CJS (dist/advanced.cjs)',
    path: 'dist/advanced.cjs',
    limit: '2.2 kB',
  },
  {
    name: 'stylesheet (dist/data-table.css)',
    path: 'dist/data-table.css',
    limit: '17 kB',
  },
  {
    name: 'lazy ExportDialog chunk · ESM',
    path: 'dist/VisualizationRegistry-*.js',
    limit: '81 kB',
  },
  {
    name: 'lazy ExportDialog chunk · CJS',
    path: 'dist/VisualizationRegistry-*.cjs',
    limit: '76 kB',
  },
];
