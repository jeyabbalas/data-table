import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __DT_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.config.*', 'tests/'],
      // Ratcheted at the scaling plan's Phase 3.5 — actuals minus ~1
      // percentage point, the standing convention here. Phase 3.5 actuals:
      // statements 87.07, branches 76.54, functions 90.16, lines 89.18.
      // Phases 0–3 of the scaling plan landed ~10 pp of new tests each without
      // moving the floor, so it had drifted 11 pp below what the suite
      // actually holds and would no longer have caught a regression.
      //
      // Prior mark (Phase 8 actuals): statements 77.11, branches 64.14,
      // functions 82.33, lines 78.96. Branches still dominate the gap to the
      // review-plan §4 long-term targets (90/85/90/90) — CSV/format/error
      // branches in src/data/ plus worker glue. Tracked as a post-1.0
      // follow-up.
      thresholds: {
        statements: 86,
        branches: 75.5,
        functions: 89,
        lines: 88,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
