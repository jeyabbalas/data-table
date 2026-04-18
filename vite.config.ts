import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

/**
 * Plugin to copy CSS file to dist directory after build
 */
function copyStylesPlugin(): Plugin {
  return {
    name: 'copy-styles',
    writeBundle() {
      const srcPath = resolve(__dirname, 'src/styles/data-table.css');
      const distPath = resolve(__dirname, 'dist/data-table.css');

      // Ensure dist directory exists
      const distDir = resolve(__dirname, 'dist');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      // Copy the CSS file
      copyFileSync(srcPath, distPath);
      console.log('✓ Copied data-table.css to dist/');
    },
  };
}

export default defineConfig({
  plugins: [copyStylesPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DataTable',
      fileName: (format) => format === 'es' ? 'data-table.js' : 'data-table.cjs',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // Externalize peer dependencies — consumers install them once in their app
      // so they are not double-bundled.
      external: [
        /^@codemirror\//,
        /^@lezer\//,
        /^@duckdb\/duckdb-wasm/,
      ],
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
