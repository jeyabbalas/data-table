import { describe, it, expect } from 'vitest';
import { nextInstanceId } from '@/core/instanceId';

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
