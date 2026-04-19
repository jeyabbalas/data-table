import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

const FIXTURES_ROOT = resolve(__dirname, 'tests/fixtures/datasets');
const EXAMPLES_ROOT = resolve(__dirname, 'examples');

const EXAMPLE_ENTRIES = [
  '01-minimal',
  '02-load-from-url',
  '03-programmatic-filters',
  '04-derived-columns',
  '05-event-listeners',
  '06-custom-theme',
  '07-i18n-french',
  '08-custom-visualization',
];

export default defineConfig({
  root: 'examples',
  base: '/data-table/examples/',
  resolve: {
    alias: {
      '@jeyabbalas/data-table/styles': resolve(__dirname, 'src/styles/index.css'),
      '@jeyabbalas/data-table/advanced': resolve(__dirname, 'src/advanced.ts'),
      '@jeyabbalas/data-table': resolve(__dirname, 'src/index.ts'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: '../demo-dist/examples',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(EXAMPLES_ROOT, 'index.html'),
        ...Object.fromEntries(
          EXAMPLE_ENTRIES.map((name) => [name, resolve(EXAMPLES_ROOT, name, 'index.html')]),
        ),
      },
    },
  },
  server: {
    fs: { allow: [resolve(__dirname)] },
  },
  plugins: [
    {
      name: 'examples-serve-fixtures',
      configureServer(server) {
        server.middlewares.use('/fixtures', (req, res, next) => {
          const urlPath = (req.url || '/').split('?')[0];
          const filePath = resolve(FIXTURES_ROOT, '.' + urlPath);
          if (!filePath.startsWith(FIXTURES_ROOT)) {
            res.statusCode = 403;
            res.end();
            return;
          }
          if (!existsSync(filePath) || !statSync(filePath).isFile()) {
            return next();
          }
          const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
          const mime: Record<string, string> = {
            csv: 'text/csv; charset=utf-8',
            json: 'application/json; charset=utf-8',
            parquet: 'application/octet-stream',
          };
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(readFileSync(filePath));
        });
      },
    },
  ],
});
