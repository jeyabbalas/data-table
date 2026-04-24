import { describe, it, expect } from 'vitest';
import { generateAnnotationId, isAnnotationIdShape } from '@/annotations/AnnotationId';

describe('generateAnnotationId', () => {
  it('produces a 30-char string with the `ann_` prefix', () => {
    const id = generateAnnotationId();
    expect(id).toHaveLength(30);
    expect(id.startsWith('ann_')).toBe(true);
  });

  it('uses Crockford base32 after the prefix', () => {
    const id = generateAnnotationId();
    const crockford = /^[0-9A-HJKMNP-TV-Z]+$/;
    expect(crockford.test(id.slice(4))).toBe(true);
  });

  it('is monotonic for ids generated in a tight burst', () => {
    const n = 5000;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(generateAnnotationId());
    // Sort-stability check: the natural order must equal the sorted order.
    const sorted = [...ids].sort();
    for (let i = 0; i < n; i++) {
      expect(ids[i]).toBe(sorted[i]);
    }
  });

  it('returns unique ids over 10k calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10000; i++) ids.add(generateAnnotationId());
    expect(ids.size).toBe(10000);
  });
});

describe('isAnnotationIdShape', () => {
  it('accepts generator output', () => {
    for (let i = 0; i < 100; i++) {
      expect(isAnnotationIdShape(generateAnnotationId())).toBe(true);
    }
  });

  it('rejects the wrong prefix', () => {
    expect(isAnnotationIdShape('xyz_01HXYZABCDEFGHJKMNPQRSTVWX')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isAnnotationIdShape('ann_SHORT')).toBe(false);
    expect(isAnnotationIdShape('ann_TOOLONG01HXYZABCDEFGHJKMNPQRSTVWX')).toBe(false);
  });

  it('rejects non-Crockford characters', () => {
    // `I` is not in Crockford
    expect(isAnnotationIdShape('ann_01HXYZABCDEFGHIKMNPQRSTVWX')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isAnnotationIdShape(undefined)).toBe(false);
    expect(isAnnotationIdShape(null)).toBe(false);
    expect(isAnnotationIdShape(42)).toBe(false);
    expect(isAnnotationIdShape({})).toBe(false);
  });
});
