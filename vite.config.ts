import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

/**
 * Plugin to concatenate CSS module files into a single dist/data-table.css.
 *
 * Source modules live in src/styles/ with numeric-prefixed filenames
 * (01-*.css, 02-*.css, …) so lexicographic sort == cascade order.
 * The developer-facing src/styles/index.css manifest is skipped (it uses
 * runtime @import, which the demo app relies on during dev).
 */
function buildStylesPlugin(): Plugin {
  return {
    name: 'build-styles',
    writeBundle() {
      const srcDir = resolve(__dirname, 'src/styles');
      const distPath = resolve(__dirname, 'dist/data-table.css');
      const distDir = resolve(__dirname, 'dist');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      const files = readdirSync(srcDir)
        .filter((f) => /^\d\d-.+\.css$/.test(f))
        .sort();

      const combined = files.map((f) => readFileSync(resolve(srcDir, f), 'utf8')).join('\n');

      writeFileSync(distPath, combined, 'utf8');
      console.log(`✓ Concatenated ${files.length} CSS modules → dist/data-table.css`);
    },
  };
}

export default defineConfig({
  plugins: [buildStylesPlugin()],
  build: {
    lib: {
      // Two entry points:
      //   `.`        → dist/data-table.{js,cjs}
      //   `./advanced` → dist/advanced.{js,cjs}
      // package.json's `exports` field advertises which ones are public.
      entry: {
        'data-table': resolve(__dirname, 'src/index.ts'),
        advanced: resolve(__dirname, 'src/advanced.ts'),
      },
      name: 'DataTable',
      fileName: (format, entryName) => (format === 'es' ? `${entryName}.js` : `${entryName}.cjs`),
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Externalize peer dependencies — consumers install them once in their app
      // so they are not double-bundled.
      external: [/^@codemirror\//, /^@lezer\//, /^@duckdb\/duckdb-wasm/],
      output: {
        // No UMD build, so no globals mapping needed.
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  worker: {
    format: 'es',
  },
});
