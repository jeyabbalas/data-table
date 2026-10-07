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
      // Every source file counts, whether a test imports it or not: vitest 4
      // dropped `coverage.all`, and without `include` the totals left out any
      // module no test imports. Paths are relative to the root.
      include: ['src/**/*.ts'],
      exclude: [
        // Declarations hold no code.
        'src/**/*.d.ts',
        // The worker entry sets `self.onmessage` and posts to `self` when
        // imported, so it runs only in a Web Worker. Its logic is
        // `dispatcher.ts`, which the tests cover.
        'src/worker/worker.ts',
      ],
      // The thresholds trail the measured figures by about one point: each
      // is the figure rounded down, minus 1. Measured on 2026-10-07 (vitest 5,
      // coverage-v8 5) over every file `include` takes, on macOS and on CI's
      // Ubuntu alike: statements 91.26, branches 84.17, functions 94.33,
      // lines 93.01. Raise them as coverage grows.
      thresholds: {
        statements: 90,
        branches: 83,
        functions: 93,
        lines: 92,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
