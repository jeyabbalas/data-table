/**
 * findSlotAtX — gap-inclusive hit-testing for bars/segments.
 *
 * Verifies that inter-slot gaps map to the nearest slot (at the gap midpoint)
 * so hover/click never falls into an interaction dead zone, while points
 * outside the [min, max] extent still return null.
 *
 * truncateText — the cut text of a chart's labels: the type outline under a
 * nested column's bar, the value counts' segments, the histograms' axes.
 * It cuts between graphemes, at every width.
 */

import { describe, it, expect } from 'vitest';

import { findSlotAtX, truncateText } from '../../src/visualizations/utils';

describe('findSlotAtX', () => {
  // Two 10px slots with a 4px gap between them: [0,10] gap [14,24].
  const slots = [
    { x: 0, width: 10 },
    { x: 14, width: 10 },
  ];
  const min = 0;
  const max = 24;

  it('returns null when there are no slots', () => {
    expect(findSlotAtX([], 5, 0, 100)).toBeNull();
  });

  it('returns null outside the [min, max] extent', () => {
    expect(findSlotAtX(slots, -1, min, max)).toBeNull();
    expect(findSlotAtX(slots, 25, min, max)).toBeNull();
  });

  it('maps points inside a slot to that slot', () => {
    expect(findSlotAtX(slots, 5, min, max)).toBe(0);
    expect(findSlotAtX(slots, 20, min, max)).toBe(1);
  });

  it('splits the gap at its midpoint between neighbouring slots', () => {
    // Gap is [10, 14], midpoint 12.
    expect(findSlotAtX(slots, 11, min, max)).toBe(0);
    expect(findSlotAtX(slots, 12, min, max)).toBe(0); // boundary is inclusive-left
    expect(findSlotAtX(slots, 13, min, max)).toBe(1);
  });

  it('lets the first and last slot own the outer extent up to min/max', () => {
    expect(findSlotAtX(slots, 0, min, max)).toBe(0);
    expect(findSlotAtX(slots, 24, min, max)).toBe(1);
  });

  it('gives the whole extent to a single slot', () => {
    // A lone slot narrower than the extent still owns everything inside it —
    // this is the single-value histogram's regime.
    const one = [{ x: 40, width: 20 }];
    expect(findSlotAtX(one, 0, 0, 100)).toBe(0);
    expect(findSlotAtX(one, 50, 0, 100)).toBe(0);
    expect(findSlotAtX(one, 100, 0, 100)).toBe(0);
    expect(findSlotAtX(one, -0.01, 0, 100)).toBeNull();
    expect(findSlotAtX(one, 100.01, 0, 100)).toBeNull();
  });

  it('splits each gap at its own midpoint when gaps differ in width', () => {
    // [0,10] gap(2) [12,22] gap(8) [30,40]: midpoints 11 and 26.
    const uneven = [
      { x: 0, width: 10 },
      { x: 12, width: 10 },
      { x: 30, width: 10 },
    ];
    expect(findSlotAtX(uneven, 11, 0, 40)).toBe(0);
    expect(findSlotAtX(uneven, 11.01, 0, 40)).toBe(1);
    expect(findSlotAtX(uneven, 26, 0, 40)).toBe(1);
    expect(findSlotAtX(uneven, 26.01, 0, 40)).toBe(2);
  });

  it('handles fractional geometry without dead zones', () => {
    // The few-bin histogram regime: 21.785714-wide bars on a 25.053571 pitch.
    const barWidth = 122 / 5.6;
    const pitch = barWidth * 1.15;
    const bars = Array.from({ length: 5 }, (_, i) => ({ x: 4 + i * pitch, width: barWidth }));
    for (let x = 4; x <= 126; x += 0.25) {
      expect(findSlotAtX(bars, x, 4, 126)).not.toBeNull();
    }
  });
});

describe('truncateText', () => {
  /**
   * A context measuring 5 px per UTF-16 unit, so half a surrogate pair is
   * narrower than the whole one, as the replacement character is narrower
   * than an emoji on a real canvas. It records what it measures.
   */
  function context(): { ctx: CanvasRenderingContext2D; measured: string[] } {
    const measured: string[] = [];
    const ctx = {
      measureText: (text: string) => {
        measured.push(text);
        return { width: text.length * 5 };
      },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, measured };
  }

  /** Man, ZWJ, woman, ZWJ, girl: one grapheme of 8 UTF-16 units. */
  const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = (text: string): string[] =>
    Array.from(segmenter.segment(text), ({ segment }) => segment);

  it.each([
    ['an astral character', '{📍, x, tier}'],
    ['a ZWJ emoji sequence', `trip ${FAMILY} 2024`],
    ['flags', '🇫🇷🇩🇪🇮🇹 eu'],
    ['NFD accents', 'e\u0301te\u0301 a\u0300 Paris'],
  ])('cuts text with %s between graphemes, at every width', (_, text) => {
    const whole = graphemes(text);
    const { ctx } = context();
    for (let width = 0; width <= (text.length + 1) * 5; width += 0.5) {
      const cut = truncateText(ctx, text, width);
      if (cut === text) {
        expect(text.length * 5).toBeLessThanOrEqual(width);
        continue;
      }
      // Whole graphemes of the text and `…`, as many as fit, or nothing.
      const kept = cut === '' ? [] : graphemes(cut.slice(0, -1));
      if (cut !== '') expect(cut.endsWith('…'), `${width} px: ${cut}`).toBe(true);
      expect(kept, `${width} px: ${cut}`).toEqual(whole.slice(0, kept.length));
      expect(cut.length * 5).toBeLessThanOrEqual(width);
      const longer = whole.slice(0, kept.length + 1).join('') + '…';
      expect(longer.length * 5, `${width} px: ${cut}`).toBeGreaterThan(width);
    }
  });

  it('keeps a grapheme whole or drops it, and never ends on half of one', () => {
    const { ctx } = context();
    // '{\uD83D…' would be 15 px; '{📍…' is 20.
    expect(truncateText(ctx, '{📍, x}', 15)).toBe('{…');
    expect(truncateText(ctx, '{📍, x}', 20)).toBe('{📍…');
    // A family is 8 units: kept whole, never as man + ZWJ.
    expect(truncateText(ctx, `${FAMILY} trip`, 40)).toBe('');
    expect(truncateText(ctx, `${FAMILY} trip`, 45)).toBe(`${FAMILY}…`);
    // A flag is two regional indicators, never one.
    expect(truncateText(ctx, '🇫🇷🇩🇪', 15)).toBe('');
    expect(truncateText(ctx, '🇫🇷🇩🇪', 25)).toBe('🇫🇷…');
    // A decomposed é keeps its accent.
    expect(truncateText(ctx, 'e\u0301te\u0301', 10)).toBe('');
    expect(truncateText(ctx, 'e\u0301te\u0301', 15)).toBe('e\u0301…');
  });

  it('returns the text when it fits, and nothing when no width is given', () => {
    const { ctx } = context();
    expect(truncateText(ctx, 'tier', 20)).toBe('tier');
    expect(truncateText(ctx, 'tier', 19)).toBe('ti…');
    expect(truncateText(ctx, 'tier', 0)).toBe('');
    expect(truncateText(ctx, '', 10)).toBe('');
  });

  it('measures the text, then once per grapheme it drops', () => {
    // 20 families: 20 graphemes, 160 UTF-16 units.
    const text = FAMILY.repeat(20);
    const { ctx, measured } = context();
    // Two families and `…` are 85 px.
    expect(truncateText(ctx, text, 100)).toBe(FAMILY.repeat(2) + '…');
    expect(measured).toHaveLength(1 + 18);
    expect(measured[0]).toBe(text);
  });
});
