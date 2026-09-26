import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Serves the spike page only. No cross-origin-isolation headers on purpose:
// most host pages are not isolated, so DuckDB runs the single-threaded `eh`
// bundle here exactly as it does for the library's users.
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  server: {
    port: 5190,
    strictPort: true,
    fs: { allow: [resolve(here, '../..')] },
  },
});
