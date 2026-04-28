import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};

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

/**
 * Plugin to emit a one-line type-stub at dist/styles.d.ts so that
 * `import '@jeyabbalas/data-table/styles'` typechecks under strict TS
 * (TS2882 otherwise — bare CSS exports have no type declaration).
 */
function emitStylesTypeStubPlugin(): Plugin {
  return {
    name: 'emit-styles-dts',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      writeFileSync(
        resolve(distDir, 'styles.d.ts'),
        '// Side-effect import — bundles the prebuilt CSS at "./data-table.css".\nexport {};\n',
        'utf8',
      );
    },
  };
}

export default defineConfig({
  plugins: [buildStylesPlugin(), emitStylesTypeStubPlugin()],
  // Asset URLs (used by `new Worker(new URL(...), import.meta.url)` rewrites)
  // must be relative so they resolve correctly from the bundle's installed
  // location in `node_modules/@jeyabbalas/data-table/dist/`. The default `/`
  // produced absolute paths that 404'd at the consumer's site root.
  base: './',
  define: {
    __DT_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    lib: {
      // Two entry points (ESM only — the library is browser-only and the
      // worker bundle is itself an ES module, so a CJS wrapper can't load
      // it as `{ type: 'module' }` even with Terser fixes).
      //   `.`         → dist/data-table.js
      //   `./advanced` → dist/advanced.js
      // package.json's `exports` field advertises which ones are public.
      entry: {
        'data-table': resolve(__dirname, 'src/index.ts'),
        advanced: resolve(__dirname, 'src/advanced.ts'),
      },
      name: 'DataTable',
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ['es'],
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
