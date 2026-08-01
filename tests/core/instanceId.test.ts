import { describe, it, expect, vi } from 'vitest';
import { nextInstanceId, resolveInstanceId } from '@/core/instanceId';

describe('nextInstanceId', () => {
  it('returns a string matching the expected t{n}-{hex} format', () => {
    const id = nextInstanceId();
    expect(id).toMatch(/^t\d+-[0-9a-f]{4}$/);
  });

  it('generates distinct IDs across 100 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(nextInstanceId());
    }
    expect(ids.size).toBe(100);
  });

  it('counter segment is strictly increasing between consecutive calls', () => {
    const first = nextInstanceId();
    const second = nextInstanceId();
    const firstN = Number(first.match(/^t(\d+)-/)![1]);
    const secondN = Number(second.match(/^t(\d+)-/)![1]);
    expect(secondN).toBe(firstN + 1);
  });
});

describe('resolveInstanceId', () => {
  it('mints a fresh id when nothing is supplied', () => {
    expect(resolveInstanceId()).toMatch(/^t\d+-[0-9a-f]{4}$/);
    expect(resolveInstanceId('')).toMatch(/^t\d+-[0-9a-f]{4}$/);
  });

  it('keeps a supplied id recognisable but appends a random suffix', () => {
    const id = resolveInstanceId('my-table');
    expect(id).toMatch(/^my-table-[0-9a-f]{4}$/);
  });

  it('draws fresh randomness per call, so two tables given the same value diverge', () => {
    // The whole point: `instanceId` is a public option, so two tables can be
    // handed the same one. Identical values would mint identical cell ids and
    // leave both grids publishing an ambiguous `aria-activedescendant`.
    // Stubbed rather than sampled — a 4-hex suffix collides often enough over
    // 100 draws to make a statistical assertion flaky.
    const uuids = ['aaaabbbb-0000-0000-0000-000000000000', 'ccccdddd-0000-0000-0000-000000000000'];
    let call = 0;
    const spy = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementation(() => uuids[call++] as ReturnType<typeof crypto.randomUUID>);

    expect(resolveInstanceId('shared')).toBe('shared-aaaa');
    expect(resolveInstanceId('shared')).toBe('shared-cccc');

    spy.mockRestore();
  });
});
