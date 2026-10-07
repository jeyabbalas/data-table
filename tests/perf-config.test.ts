import { describe, it, expect } from 'vitest';
import baseConfig from '../vitest.config.ts';
import perfConfig from '../vitest.perf.config.ts';

/**
 * `npm run test:perf` runs `vitest.perf.config.ts`, which narrows the base
 * config's `include` to `tests/performance`. Built with Vite's `mergeConfig`,
 * it narrowed nothing: `mergeConfig` concatenates arrays, so the base
 * `tests/**` glob stayed and the perf run took the whole suite.
 */
describe('vitest.perf.config.ts', () => {
  it('includes only tests/performance', () => {
    expect(perfConfig.test?.include).toEqual(['tests/performance/**/*.test.ts']);
  });

  it('keeps the rest of the base config, with longer timeouts', () => {
    const { include: _perfInclude, testTimeout, hookTimeout, ...perfTest } = perfConfig.test ?? {};
    const { include: _baseInclude, ...baseTest } = baseConfig.test ?? {};
    expect(perfTest).toEqual(baseTest);
    expect([testTimeout, hookTimeout]).toEqual([120_000, 120_000]);
    expect(perfConfig.define).toEqual(baseConfig.define);
    expect(perfConfig.resolve).toEqual(baseConfig.resolve);
  });
});
