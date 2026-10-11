import { afterEach, describe, it, expect, vi } from 'vitest';
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

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The id an earlier, concatenating implementation built from these inputs. */
function referenceId(ms: number, bytes: readonly number[]): string {
  let timestamp = '';
  let value = ms;
  for (let i = 9; i >= 0; i--) {
    timestamp = CROCKFORD[value % 32] + timestamp;
    value = Math.floor(value / 32);
  }
  let randomness = '';
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      randomness += CROCKFORD[(bitBuffer >>> bitCount) & 0x1f];
    }
  }
  return `ann_${timestamp}${randomness}`;
}

describe('generateAnnotationId — encoding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRandom(bytes: number[]) {
    return vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(target: T): T => {
        (target as unknown as Uint8Array).set(bytes);
        return target;
      });
  }

  it('encodes the timestamp and 80 random bits as before', () => {
    const ms = 1_700_000_000_123;
    vi.spyOn(Date, 'now').mockReturnValue(ms);
    const bytes = [0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0xfe, 0xdc];
    const random = mockRandom(bytes);
    const id = generateAnnotationId();
    expect(id).toBe(referenceId(ms, bytes));
    expect(isAnnotationIdShape(id)).toBe(true);
    expect(random).toHaveBeenCalledTimes(1);

    // Same millisecond: the random part counts up by one, no new randomness.
    const next = generateAnnotationId();
    expect(next).toBe(referenceId(ms, [...bytes.slice(0, 9), 0xdd]));
    expect(random).toHaveBeenCalledTimes(1);
    expect(next > id).toBe(true);
  });

  it('carries into higher bytes, and draws new randomness on a new millisecond', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_456);
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0x12, 0xff, 0xff];
    const random = mockRandom(bytes);
    generateAnnotationId();
    expect(generateAnnotationId()).toBe(
      referenceId(1_700_000_000_456, [0, 0, 0, 0, 0, 0, 0, 0x13, 0x00, 0x00]),
    );
    now.mockReturnValue(1_700_000_000_457);
    expect(generateAnnotationId()).toBe(referenceId(1_700_000_000_457, bytes));
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('stays unique and increasing over a 100K burst', () => {
    const n = 100_000;
    const ids = new Array<string>(n);
    for (let i = 0; i < n; i++) ids[i] = generateAnnotationId();
    let increasing = true;
    for (let i = 1; i < n; i++) if (!(ids[i - 1]! < ids[i]!)) increasing = false;
    expect(increasing).toBe(true);
    expect(new Set(ids).size).toBe(n);
    expect(ids.every((id) => isAnnotationIdShape(id))).toBe(true);
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
