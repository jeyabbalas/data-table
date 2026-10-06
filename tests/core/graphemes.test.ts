import { afterEach, describe, expect, it, vi } from 'vitest';

import { clipText, graphemeStart } from '@/core/graphemes';

/** The man, woman, girl family: five code points, eight UTF-16 units, one grapheme. */
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const FLAG_US = '\u{1F1FA}\u{1F1F8}';
/** `e` and a combining acute accent. */
const E_ACUTE = 'é';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Every grapheme boundary of `text`, its end included. */
function boundaries(text: string): Set<number> {
  const set = new Set([text.length]);
  for (const { index } of segmenter.segment(text)) set.add(index);
  return set;
}

describe('graphemeStart', () => {
  it('moves a cut inside a grapheme to its start, and leaves one between graphemes', () => {
    const text = `ab${FAMILY}c${E_ACUTE}d`;
    for (let at = 0; at <= text.length; at++) {
      const cut = graphemeStart(text, at);
      expect(boundaries(text).has(cut), `cut at ${at} gave ${cut}`).toBe(true);
      expect(cut).toBeLessThanOrEqual(at);
    }
    expect(graphemeStart(text, 5)).toBe(2);
    expect(graphemeStart(text, 10)).toBe(10);
    expect(graphemeStart(text, 12)).toBe(11);
  });

  it('pairs regional indicators from the start of their run, however long', () => {
    // A cut 64 units into a run starts its window at a flag's second half.
    for (const text of [
      `a${FLAG_US.repeat(1500)}`,
      FLAG_US.repeat(1500),
      `ab${FLAG_US.repeat(40)}`,
    ]) {
      for (const at of [3999, 3998, 3997, 81, 80, 70, 65]) {
        if (at >= text.length) continue;
        const cut = graphemeStart(text, at);
        expect(boundaries(text).has(cut), `${text.slice(0, 2)}…: cut at ${at} gave ${cut}`).toBe(
          true,
        );
        expect(at - cut).toBeLessThan(4);
      }
    }
    expect(graphemeStart(`a${FLAG_US.repeat(1500)}`, 3999)).toBe(3997);
  });

  it('cuts a grapheme too long for its window inside it, never inside a surrogate pair', () => {
    const marks = `x${'́'.repeat(200)}y`;
    expect(graphemeStart(marks, 150)).toBe(150);
    const smileys = '\u{1F600}'.repeat(10);
    expect(graphemeStart(smileys, 5)).toBe(4);
  });

  it('keeps an index at either end', () => {
    expect(graphemeStart('abc', 0)).toBe(0);
    expect(graphemeStart('abc', 3)).toBe(3);
    expect(graphemeStart(FAMILY, 3)).toBe(0);
  });

  describe('without Intl.Segmenter', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it('cuts at the index, never inside a surrogate pair', async () => {
      vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
      vi.resetModules();
      const fresh = await import('@/core/graphemes');
      expect(fresh.graphemeStart(`ab${FAMILY}`, 5)).toBe(5);
      expect(fresh.graphemeStart(`ab${FAMILY}`, 4)).toBe(4);
      expect(fresh.graphemeStart(`ab${FAMILY}`, 3)).toBe(2);
    });
  });
});

describe('clipText', () => {
  it('keeps text within the budget, `…` included, and never splits a grapheme', () => {
    const names = [
      `${'x'.repeat(58)}${FAMILY}yy`,
      `${'x'.repeat(59)}${FLAG_US}yy`,
      `${'x'.repeat(60)}${E_ACUTE}zzzz`,
      `${'x'.repeat(50)}\u{1F600}${'y'.repeat(20)}`,
    ];
    for (const name of names) {
      for (const max of [2, 10, 59, 60, 61, 62, 64]) {
        const text = clipText(name, max);
        expect(text.length).toBeLessThanOrEqual(max);
        expect(text.endsWith('…')).toBe(true);
        expect(boundaries(name).has(text.length - 1), `${name.slice(-6)} at ${max}`).toBe(true);
        expect(name.startsWith(text.slice(0, -1))).toBe(true);
      }
    }
  });

  it('leaves text that fits alone', () => {
    expect(clipText('short', 8)).toBe('short');
    expect(clipText(FAMILY, 8)).toBe(FAMILY);
    expect(clipText('ab', 1)).toBe('…');
  });
});
