import { describe, it, expect } from 'vitest';
import { isCI, missingDist } from './helpers/missingDist';

/**
 * The api-surface tests that read `dist/` register one stand-in test when it
 * is missing: a skip locally, a failure in CI. CI builds before it tests, so
 * a skip there only hid that the tests never ran, as they didn't on any PR
 * while the workflow tested first.
 */
describe('missingDist', () => {
  function register(env: NodeJS.ProcessEnv) {
    const calls: { kind: 'run' | 'skip'; name: string; fn: () => void }[] = [];
    const test = Object.assign(
      (name: string, fn: () => void) => void calls.push({ kind: 'run', name, fn }),
      { skip: (name: string, fn: () => void) => void calls.push({ kind: 'skip', name, fn }) },
    );
    missingDist('the audit', env, test);
    return calls;
  }

  it('fails in CI, saying how to fix it', () => {
    const calls = register({ CI: 'true' });
    expect(calls.map((call) => call.kind)).toEqual(['run']);
    expect(calls[0]!.name).toContain('the audit');
    expect(calls[0]!.fn).toThrow('dist/ is missing: run `npm run build` first');
  });

  it('skips outside CI', () => {
    const calls = register({});
    expect(calls.map((call) => call.kind)).toEqual(['skip']);
    expect(calls[0]!.name).toContain('the audit');
  });

  it('reads CI as CI services set it', () => {
    expect(isCI({ CI: 'true' })).toBe(true);
    expect(isCI({ CI: '1' })).toBe(true);
    expect(isCI({})).toBe(false);
    expect(isCI({ CI: '' })).toBe(false);
    expect(isCI({ CI: 'false' })).toBe(false);
    expect(isCI({ CI: '0' })).toBe(false);
  });
});
