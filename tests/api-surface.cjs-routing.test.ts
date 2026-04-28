import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the CJS drop in v0.4.0.
 *
 * The library is now ESM-only. The worker bundle is itself an ES module
 * loaded as `new Worker(url, { type: 'module' })` — a CJS wrapper cannot
 * load that even with `import.meta.url` shimmed, so CJS was structurally
 * non-functional before being removed. This test ensures the build does
 * not silently re-emit CJS artifacts (e.g. if someone re-adds `'cjs'` to
 * `lib.formats` in `vite.config.ts`).
 *
 * Gated on `dist/` existing — bare `npm test` skips. CI / `prepublishOnly`
 * build first, so the test always runs there.
 */

const DIST = resolve(__dirname, '..', 'dist');
const ROOT_ESM = resolve(DIST, 'data-table.js');
const ROOT_CJS = resolve(DIST, 'data-table.cjs');
const ADVANCED_CJS = resolve(DIST, 'advanced.cjs');

describe('CJS no longer published (ESM-only since 0.4.0)', () => {
  if (!existsSync(ROOT_ESM)) {
    it.skip('dist/ not built — skipping CJS regression smoke test', () => {
      // Run `npm run build` first.
    });
    return;
  }

  it('does not emit dist/data-table.cjs', () => {
    expect(existsSync(ROOT_CJS)).toBe(false);
  });

  it('does not emit dist/advanced.cjs', () => {
    expect(existsSync(ADVANCED_CJS)).toBe(false);
  });
});
