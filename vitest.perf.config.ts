import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Perf / memory-stress vitest config — single-flag entry point for the
 * nightly job. Extends the base config, narrows `include` to
 * `tests/performance/**`, and raises `testTimeout` so the opt-in suites
 * (`RUN_DUCKDB_PERF=1`, `RUN_LIFECYCLE_STRESS=1`) have headroom for the
 * 1M-row generation, 10k-annotation insert, and 1000-cycle create/destroy
 * scenarios.
 *
 * The default `npm test` run is unchanged — perf tests still run there
 * for the cheap/fast scenarios (annotations bench, scroll-handler bench,
 * memory-leaks shared-bridge / 100k-mutation / 100-cycle scaffolds);
 * the slow gates only fire under their env vars.
 *
 * Coverage thresholds inherited from the base config are honoured but
 * irrelevant in practice — `include` narrows away most of `src/`.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/performance/**/*.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
);
