/**
 * findSlotAtX — gap-inclusive hit-testing for bars/segments.
 *
 * Verifies that inter-slot gaps map to the nearest slot (at the gap midpoint)
 * so hover/click never falls into an interaction dead zone, while points
 * outside the [min, max] extent still return null.
 */

import { describe, it, expect } from 'vitest';

import { findSlotAtX } from '../../src/visualizations/utils';

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
