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
      // Initial thresholds set at Phase 0 baseline minus ~1 percentage point
      // (statements 72.65, branches 59.53, functions 77.71, lines 74.45).
      // Phase 9 tightens these once subsystem-specific gaps in worker loaders,
      // valuecounts, and histogram are closed.
      thresholds: {
        statements: 71,
        branches: 58,
        functions: 76,
        lines: 73,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
