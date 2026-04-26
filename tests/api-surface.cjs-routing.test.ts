import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

/**
 * Verifies the CommonJS routing for both publish entries actually loads.
 *
 * `package.json#exports` advertises `"./advanced": { "require": ... }`
 * (added in Phase 2). The orphaned `dist/advanced.cjs` predates that
 * routing and used to be unreachable for CJS consumers; this test locks
 * the route in so a regression there fails immediately rather than at
 * a downstream consumer's runtime.
 *
 * Gated on `dist/data-table.cjs` and `dist/advanced.cjs` existing — bare
 * `npm test` skips. CI / `prepublishOnly` build first, so the test always
 * runs there.
 */

const DIST = resolve(__dirname, '..', 'dist');
const ROOT_CJS = resolve(DIST, 'data-table.cjs');
const ADVANCED_CJS = resolve(DIST, 'advanced.cjs');

const require = createRequire(import.meta.url);

describe('CJS routing for both publish entries', () => {
  if (!existsSync(ROOT_CJS) || !existsSync(ADVANCED_CJS)) {
    it.skip('dist/ not built — skipping CJS smoke test', () => {
      // Run `npm run build` first.
    });
    return;
  }

  it('require("dist/data-table.cjs") exposes the Tier-1 facade', () => {
    const mod = require(ROOT_CJS) as Record<string, unknown>;
    expect(typeof mod.createDataTable).toBe('function');
    expect(typeof mod.WorkerBridge).toBe('function');
    expect(typeof mod.SessionStore).toBe('function');
    expect(typeof mod.FilterPresetManager).toBe('function');
    expect(typeof mod.VisualizationRegistry).toBe('function');
    expect(mod.VERSION).toBeTypeOf('string');
  });

  it('require("dist/advanced.cjs") exposes the Tier-2 building blocks', () => {
    const mod = require(ADVANCED_CJS) as Record<string, unknown>;
    expect(typeof mod.EventEmitter).toBe('function');
    expect(typeof mod.AutoSave).toBe('function');
    expect(typeof mod.BaseVisualization).toBe('function');
    expect(typeof mod.AnnotationStore).toBe('function');
    expect(typeof mod.UndoManager).toBe('function');
    expect(typeof mod.TableContainer).toBe('function');
    expect(typeof mod.createSqlExtensions).toBe('function');
    expect(typeof mod.buildCompletionContext).toBe('function');
  });

  it('CJS root entry does NOT expose Tier-2 symbols (parity with ESM)', () => {
    const mod = require(ROOT_CJS) as Record<string, unknown>;
    expect(mod.EventEmitter).toBeUndefined();
    expect(mod.StateActions).toBeUndefined();
    expect(mod.AutoSave).toBeUndefined();
    expect(mod.BaseVisualization).toBeUndefined();
    expect(mod.TableContainer).toBeUndefined();
  });
});
