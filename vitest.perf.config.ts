import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.ts';

/**
 * Perf / memory-stress vitest config — single-flag entry point for nightly
 * or manual runs. Extends the base config, narrows `include` to
 * `tests/performance/**`, and raises `testTimeout` so the opt-in suites
 * (`RUN_DUCKDB_PERF=1`, `RUN_LIFECYCLE_STRESS=1`) have headroom for the
 * 1M-row generation, 10k-annotation insert, and 1000-cycle create/destroy
 * scenarios.
 *
 * It spreads the base config instead of calling `mergeConfig`, which
 * concatenates arrays: merged, `include` kept the base `tests/**` glob and
 * `npm run test:perf` ran the whole suite. `tests/perf-config.test.ts`
 * checks it.
 *
 * The default `npm test` run is unchanged — perf tests still run there
 * for the cheap/fast scenarios (annotations bench, scroll-handler bench,
 * memory-leaks shared-bridge / 100k-mutation / 100-cycle scaffolds);
 * the slow gates only fire under their env vars.
 *
 * `test:perf` collects no coverage, so the base config's thresholds, which
 * the perf files alone could not meet, don't apply to it.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/performance/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
