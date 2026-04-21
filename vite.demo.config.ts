import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

const FIXTURES_ROOT = resolve(__dirname, 'tests/fixtures/datasets');

const EXAMPLES = [
  '01-minimal',
  '02-load-from-url',
  '03-programmatic-filters',
  '04-derived-columns',
  '05-event-listeners',
  '06-custom-theme',
  '07-i18n-french',
  '08-custom-visualization',
  '09-multi-table',
];

export default defineConfig({
  // root defaults to '.'
  base: '/data-table/', // GitHub repo name for GitHub Pages
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Examples import the library by package name; alias to source so we
      // don't need a prebuild during dev.
      '@jeyabbalas/data-table/styles': resolve(__dirname, 'src/styles/index.css'),
      '@jeyabbalas/data-table/advanced': resolve(__dirname, 'src/advanced.ts'),
      '@jeyabbalas/data-table': resolve(__dirname, 'src/index.ts'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'examples/index': resolve(__dirname, 'examples/index.html'),
        ...Object.fromEntries(
          EXAMPLES.map((name) => [
            `examples/${name}/index`,
            resolve(__dirname, 'examples', name, 'index.html'),
          ]),
        ),
      },
    },
  },
  server: {
    fs: { allow: [resolve(__dirname)] },
  },
  plugins: [
    {
      // Dev-only: serve CSV / JSON / Parquet fixtures from /fixtures/* so
      // examples can fetch sample datasets without hitting the network.
      name: 'serve-fixtures',
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
