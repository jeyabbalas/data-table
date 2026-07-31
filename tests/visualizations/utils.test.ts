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
});
