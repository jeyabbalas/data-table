import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, existsSync, statSync } from 'fs';

const FIXTURES_ROOT = resolve(__dirname, 'tests/fixtures/datasets');

export default defineConfig({
  root: 'examples',
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
