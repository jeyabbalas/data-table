import { it } from 'vitest';

type TestFn = ((name: string, fn: () => void) => void) & {
  skip: (name: string, fn: () => void) => void;
};

/** Whether this run is in CI: `CI` is set, and not to `false` or `0`. */
export function isCI(env: NodeJS.ProcessEnv = process.env): boolean {
  const ci = env['CI'];
  return ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0';
}

/**
 * Stands in for the tests of a suite that reads `dist/` when there is no
 * build. Locally, where `npm test` often runs before any build, it skips.
 * In CI, which builds first, it fails: there a missing `dist/` means a
 * step went wrong, and a skip would hide that the suite never ran.
 */
export function missingDist(
  suite: string,
  env: NodeJS.ProcessEnv = process.env,
  test: TestFn = it,
): void {
  if (isCI(env)) {
    test(`${suite}: dist/ is built`, () => {
      throw new Error('dist/ is missing: run `npm run build` first');
    });
  } else {
    test.skip(`dist/ not built — skipping ${suite}`, () => {
      // Run `npm run build` first.
    });
  }
}
