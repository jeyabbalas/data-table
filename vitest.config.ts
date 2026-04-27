import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.config.*', 'tests/'],
      // Phase 9 tightening — actuals minus ~1 percentage point.
      // Phase 8 actuals: statements 77.11, branches 64.14, functions 82.33,
      // lines 78.96. Each subsystem phase added 1.5–2 pp; reaching the
      // review-plan §4 long-term targets (90/85/90/90) needs roughly 5 more
      // focused subsystem-coverage phases — branches dominate the remaining
      // gap (CSV/format/error branches in src/data/ + worker glue). Tracked
      // as a post-1.0 follow-up.
      thresholds: {
        statements: 76,
        branches: 63,
        functions: 81,
        lines: 77,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
