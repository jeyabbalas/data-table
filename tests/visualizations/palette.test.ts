/**
 * inkFor's backdrop: what shows through a translucent fill. A chart paints
 * on its slot, and with filters on paints a segment's solid share over its
 * ghost, so a label on a translucent fill reads against all of those. The
 * theme writes its tints as `color-mix(…, transparent)`, which a computed
 * style gives with the variable substituted.
 *
 * Its choices for opaque fills, and the contrast they clear on every theme
 * token, are in tests/styles/contrast.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { inkFor } from '../../src/visualizations/palette';

/** A host's translucent primary. */
const TRANSLUCENT = 'rgba(96, 165, 250, 0.55)';
/** The dark theme's chart slot (`--dt-bg-secondary`). */
const DARK_SLOT = '#1f2937';
/** The ghost of `TRANSLUCENT`, as `--dt-primary-alpha-50` computes. */
const GHOST = `color-mix(in srgb, ${TRANSLUCENT} 50%, transparent)`;

describe('inkFor — the backdrop under a translucent fill', () => {
  it('reads the fill over white by default, and over the backdrop given', () => {
    // Over white the fill is pale: near-black. Over the dark slot it shows
    // as rgb(67, 109, 162), where near-black would be 3.3:1 and white 5.3:1.
    expect(inkFor(TRANSLUCENT)).toBe('#111827');
    expect(inkFor(TRANSLUCENT, { backdrop: DARK_SLOT })).toBe('#ffffff');
    expect(inkFor(TRANSLUCENT, { backdrop: [DARK_SLOT] })).toBe('#ffffff');
  });

  it('paints the layers from the bottom up', () => {
    // The ghost over the slot under the fill: rgb(75, 125, 186), where white
    // is 4.3:1, near-black 4.2:1 and black 4.9:1.
    expect(inkFor(TRANSLUCENT, { backdrop: [DARK_SLOT, GHOST] })).toBe('#000000');
    // The ghost alone over white is pale, and the fill over it too.
    expect(inkFor(TRANSLUCENT, { backdrop: [GHOST] })).toBe('#111827');
  });

  it('leaves out a layer it cannot read', () => {
    expect(inkFor(TRANSLUCENT, { backdrop: [DARK_SLOT, 'oklch(0.7 0.1 250 / 50%)'] })).toBe(
      inkFor(TRANSLUCENT, { backdrop: DARK_SLOT }),
    );
    expect(inkFor(TRANSLUCENT, { backdrop: ['rebeccapurple'] })).toBe(inkFor(TRANSLUCENT));
    expect(inkFor(TRANSLUCENT, { backdrop: [] })).toBe(inkFor(TRANSLUCENT));
  });

  it('reads a translucent bottom layer as painted over white', () => {
    // A slot at 0% shows white; at 100% it is the slot.
    expect(inkFor(TRANSLUCENT, { backdrop: 'rgba(31, 41, 55, 0)' })).toBe(inkFor(TRANSLUCENT));
    expect(inkFor(TRANSLUCENT, { backdrop: 'rgba(31, 41, 55, 1)' })).toBe('#ffffff');
  });
});

describe('inkFor — the theme’s tints', () => {
  it('reads color-mix with transparent as the color at that share of its alpha', () => {
    for (const [mix, rgba] of [
      ['color-mix(in srgb, #2563eb 30%, transparent)', 'rgba(37, 99, 235, 0.3)'],
      ['color-mix( in srgb , #2563EB 30% , transparent )', 'rgba(37, 99, 235, 0.3)'],
      ['COLOR-MIX(in srgb,#60a5fa 50%,transparent)', 'rgba(96, 165, 250, 0.5)'],
      [GHOST, 'rgba(96, 165, 250, 0.275)'],
    ] as const) {
      for (const backdrop of [undefined, DARK_SLOT, '#ffffff']) {
        expect(inkFor(mix, { backdrop }), `${mix} over ${backdrop}`).toBe(
          inkFor(rgba, { backdrop }),
        );
      }
    }
    // 30% primary over white is pale; over the dark slot, dark.
    expect(inkFor('color-mix(in srgb, #2563eb 30%, transparent)')).toBe('#111827');
    expect(inkFor('color-mix(in srgb, #2563eb 30%, transparent)', { backdrop: DARK_SLOT })).toBe(
      '#ffffff',
    );
  });

  it('falls back for a mix it cannot read', () => {
    for (const mix of [
      'color-mix(in oklch, #2563eb 30%, transparent)',
      'color-mix(in srgb, #2563eb 30%, white)',
      'color-mix(in srgb, oklch(0.6 0.2 260) 30%, transparent)',
      'color-mix(in srgb, #2563eb, transparent)',
    ]) {
      expect(inkFor(mix, { fallback: 'fallback' }), mix).toBe('fallback');
    }
  });
});
