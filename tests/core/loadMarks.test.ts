/**
 * Phase 0 (`plans/scaling/phase-00-harness.md` §4.3): the `dt:load:*` User
 * Timing helpers.
 *
 * The mark and measure names are a downstream contract — the demo perf
 * panel, the Playwright metrics helper, and `docs/performance.md` all read
 * them by name — so this suite pins the names, the spans, the clearing
 * behavior, and the "never throws" guarantee.
 *
 * Node provides `performance.mark` / `measure` / `getEntriesByName`, so no
 * DOM environment is needed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLoadMarks, markLoad, type LoadStage } from '@/core/loadMarks';

const MARKS: LoadStage[] = ['start', 'workerDone', 'firstPaint', 'vizReady', 'complete'];
const MEASURES = ['worker', 'paint', 'viz', 'total'];

function marked(): string[] {
  return MARKS.filter((s) => performance.getEntriesByName(`dt:load:${s}`, 'mark').length > 0);
}
function measured(): string[] {
  return MEASURES.filter((m) => performance.getEntriesByName(`dt:load:${m}`, 'measure').length > 0);
}

describe('loadMarks', () => {
  beforeEach(() => {
    clearLoadMarks();
  });

  it('emits every mark under the dt:load: prefix', () => {
    for (const stage of MARKS) markLoad(stage);
    expect(marked()).toEqual(MARKS);
  });

  it('closes each measure when its stage is marked, not before', () => {
    markLoad('start');
    expect(measured()).toEqual([]);

    markLoad('workerDone');
    expect(measured()).toEqual(['worker']);

    markLoad('firstPaint');
    markLoad('vizReady');
    markLoad('complete');
    expect(measured()).toEqual(MEASURES);
  });

  it('spans every measure from dt:load:start', () => {
    markLoad('start');
    const startAt = performance.getEntriesByName('dt:load:start', 'mark')[0]!.startTime;
    markLoad('complete');

    const total = performance.getEntriesByName('dt:load:total', 'measure')[0]!;
    expect(total.startTime).toBeCloseTo(startAt, 6);
    expect(total.duration).toBeGreaterThanOrEqual(0);
  });

  it('skips the measure when dt:load:start is absent', () => {
    // No `start` mark: `performance.measure` throws on the missing anchor
    // and the helper swallows it, leaving the mark itself in place.
    expect(() => markLoad('complete')).not.toThrow();
    expect(marked()).toEqual(['complete']);
    expect(measured()).toEqual([]);
  });

  it('clears only its own entries', () => {
    performance.mark('host-app-mark');
    performance.mark('dt:load:start');
    performance.measure('host-app-measure', 'host-app-mark');
    for (const stage of MARKS) markLoad(stage);

    clearLoadMarks();

    expect(marked()).toEqual([]);
    expect(measured()).toEqual([]);
    expect(performance.getEntriesByName('host-app-mark', 'mark')).toHaveLength(1);
    expect(performance.getEntriesByName('host-app-measure', 'measure')).toHaveLength(1);

    performance.clearMarks('host-app-mark');
    performance.clearMeasures('host-app-measure');
  });

  it('never throws when the User Timing API is unavailable', () => {
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => {
      throw new TypeError('performance.mark is not a function');
    });
    const clear = vi.spyOn(performance, 'clearMarks').mockImplementation(() => {
      throw new TypeError('performance.clearMarks is not a function');
    });
    try {
      expect(() => markLoad('start')).not.toThrow();
      expect(() => clearLoadMarks()).not.toThrow();
    } finally {
      mark.mockRestore();
      clear.mockRestore();
    }
  });
});
