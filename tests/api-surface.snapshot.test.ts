import { describe, it, expect } from 'vitest';
import * as rootModule from '../src/index';
import * as advancedModule from '../src/advanced';

/**
 * Locks the public API surface. A change to either the root entry or the
 * `/advanced` subpath must be intentional — running with `vitest -u` will
 * refresh the snapshot after a deliberate change.
 */
describe('Public API surface', () => {
  it('root export keys match snapshot', () => {
    const keys = Object.keys(rootModule).sort();
    expect(keys).toMatchSnapshot();
  });

  it('advanced export keys match snapshot', () => {
    const keys = Object.keys(advancedModule).sort();
    expect(keys).toMatchSnapshot();
  });
});
