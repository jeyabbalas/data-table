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
      // Vitest 5 matches these against paths relative to the root, so a
      // directory needs its `/**`: a bare `tests/` matches no file in it.
      exclude: ['node_modules/**', 'dist/**', '**/*.config.*', 'tests/**'],
      // The thresholds trail the measured figures by about one point: each
      // is the figure rounded down, minus 1. Measured on 2026-10-07 (vitest 5,
      // coverage-v8 5): statements 91.26, branches 84.17, functions 94.33,
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
