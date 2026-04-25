import { describe, it, expect } from 'vitest';
import {
  normalizeColumnHeaderTooltip,
  tooltipContentEquals,
} from '@/core/columnHeaderTooltip';
import type { ColumnHeaderTooltipContent } from '@/core/types';

describe('normalizeColumnHeaderTooltip', () => {
  it('null and undefined → null', () => {
    expect(normalizeColumnHeaderTooltip(null)).toBeNull();
    expect(normalizeColumnHeaderTooltip(undefined)).toBeNull();
  });

  it('empty string → null', () => {
    expect(normalizeColumnHeaderTooltip('')).toBeNull();
  });

  it('non-empty string → { description: string }', () => {
    expect(normalizeColumnHeaderTooltip('hi')).toEqual({ description: 'hi' });
  });

  it('non-string non-object primitives → null', () => {
    expect(normalizeColumnHeaderTooltip(42)).toBeNull();
    expect(normalizeColumnHeaderTooltip(true)).toBeNull();
    expect(normalizeColumnHeaderTooltip(Symbol('s'))).toBeNull();
  });

  it('object with all fields empty → null', () => {
    expect(normalizeColumnHeaderTooltip({})).toBeNull();
    expect(
      normalizeColumnHeaderTooltip({ title: '', description: '', items: [] }),
    ).toBeNull();
  });

  it('preserves non-empty title and description', () => {
    expect(normalizeColumnHeaderTooltip({ title: 'T' })).toEqual({ title: 'T' });
    expect(normalizeColumnHeaderTooltip({ description: 'D' })).toEqual({
      description: 'D',
    });
    expect(normalizeColumnHeaderTooltip({ title: 'T', description: 'D' })).toEqual({
      title: 'T',
      description: 'D',
    });
  });

  it('drops items with non-string label or no label', () => {
    expect(
      normalizeColumnHeaderTooltip({
        items: [
          { label: '', value: 'dropped' },
          { label: 0 as unknown as string, value: 'dropped' },
          { label: 'kept', value: 'kept-val' },
        ],
      }),
    ).toEqual({ items: [{ label: 'kept', value: 'kept-val' }] });
  });

  it('drops items with non-string non-array value', () => {
    expect(
      normalizeColumnHeaderTooltip({
        items: [
          { label: 'l1', value: 0 as unknown as string },
          { label: 'l2', value: { x: 1 } as unknown as string },
          { label: 'l3', value: null as unknown as string },
        ],
      }),
    ).toBeNull();
  });

  it('filters string[] values to non-empty strings; drops empty result', () => {
    expect(
      normalizeColumnHeaderTooltip({
        items: [
          { label: 'kept', value: ['a', '', 'b'] },
          { label: 'dropped', value: [''] },
          { label: 'mixed', value: ['x', 1 as unknown as string, 'y'] },
        ],
      }),
    ).toEqual({
      items: [
        { label: 'kept', value: ['a', 'b'] },
        { label: 'mixed', value: ['x', 'y'] },
      ],
    });
  });

  it('drops items array entirely if no item survives', () => {
    expect(
      normalizeColumnHeaderTooltip({ title: 'T', items: [{ label: '', value: 'v' }] }),
    ).toEqual({ title: 'T' });
  });

  it('treats items: not-an-array as missing', () => {
    expect(
      normalizeColumnHeaderTooltip({
        title: 'T',
        items: 'no' as unknown as ColumnHeaderTooltipContent['items'],
      }),
    ).toEqual({ title: 'T' });
  });
});

describe('tooltipContentEquals', () => {
  it('null vs null → true', () => {
    expect(tooltipContentEquals(null, null)).toBe(true);
  });

  it('null vs object → false', () => {
    expect(tooltipContentEquals(null, { title: 'T' })).toBe(false);
    expect(tooltipContentEquals({ title: 'T' }, null)).toBe(false);
  });

  it('same reference → true', () => {
    const a: ColumnHeaderTooltipContent = { title: 'T' };
    expect(tooltipContentEquals(a, a)).toBe(true);
  });

  it('structurally equal objects → true', () => {
    expect(
      tooltipContentEquals(
        { title: 'T', description: 'D' },
        { title: 'T', description: 'D' },
      ),
    ).toBe(true);
  });

  it('different title → false', () => {
    expect(tooltipContentEquals({ title: 'T' }, { title: 'X' })).toBe(false);
  });

  it('different description → false', () => {
    expect(
      tooltipContentEquals({ description: 'D' }, { description: 'E' }),
    ).toBe(false);
  });

  it('items length mismatch → false', () => {
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: '1' }] },
        { items: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }] },
      ),
    ).toBe(false);
  });

  it('item label or value differs → false', () => {
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: '1' }] },
        { items: [{ label: 'a', value: '2' }] },
      ),
    ).toBe(false);
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: '1' }] },
        { items: [{ label: 'b', value: '1' }] },
      ),
    ).toBe(false);
  });

  it('string vs string[] item value → false', () => {
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: '1' }] },
        { items: [{ label: 'a', value: ['1'] }] },
      ),
    ).toBe(false);
  });

  it('string[] item values: equal arrays → true; different → false', () => {
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: ['x', 'y'] }] },
        { items: [{ label: 'a', value: ['x', 'y'] }] },
      ),
    ).toBe(true);
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: ['x', 'y'] }] },
        { items: [{ label: 'a', value: ['x', 'z'] }] },
      ),
    ).toBe(false);
    expect(
      tooltipContentEquals(
        { items: [{ label: 'a', value: ['x'] }] },
        { items: [{ label: 'a', value: ['x', 'y'] }] },
      ),
    ).toBe(false);
  });
});
