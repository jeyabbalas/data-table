/**
 * `ColumnWindowModel` — the arithmetic behind body column windowing.
 *
 * Runs in the default `node` environment on purpose: the model measures
 * nothing and touches no element, and a jsdom test could not drive a
 * genuinely narrow window anyway (`MIN_OVERSCAN_COLUMNS` floors the DOM
 * window at `visible + 20`, and every jsdom table in the repo is ≤ 3 columns).
 * Here the overscan constants are inputs, so a 5-of-50 window is reachable.
 */
import { describe, expect, it } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import {
  BOX_OVERHEAD_PX,
  ColumnWindowModel,
  DEFAULT_COLUMN_WIDTH,
  MIN_OVERSCAN_COLUMNS,
  OVERSCAN_VIEWPORTS,
  pinnedOffsets,
  pinnedPrefixLength,
} from '@/table/ColumnWindow';

/** `n` columns named `c0..c{n-1}`. */
function columns(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i}`);
}

/** Uniform widths, as a fresh Map (identity is the model's cache key). */
function widths(names: readonly string[], px = 150): Map<string, number> {
  return new Map(names.map((name) => [name, px]));
}

/** The narrow-window setup the DOM cannot produce: no overscan at all. */
const NO_OVERSCAN = { minOverscanColumns: 0, overscanViewports: 0 } as const;

describe('ColumnWindowModel — prefix sums', () => {
  it('sums occupied widths and answers spans in O(1)', () => {
    const model = new ColumnWindowModel();
    const names = columns(5);
    const w = new Map([
      ['c0', 100],
      ['c1', 200],
      ['c2', 50],
      // c3 missing -> DEFAULT_COLUMN_WIDTH
      ['c4', 25],
    ]);
    model.sync(names, w);

    expect(model.size()).toBe(5);
    expect(model.columnLeftPx(0)).toBe(0);
    expect(model.columnLeftPx(1)).toBe(100);
    expect(model.columnLeftPx(3)).toBe(350);
    expect(model.columnWidthPx(3)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(model.spanPx(1, 4)).toBe(200 + 50 + 150);
    expect(model.totalWidthPx()).toBe(100 + 200 + 50 + 150 + 25);
  });

  it('clamps span bounds and returns 0 for an inverted range', () => {
    const model = new ColumnWindowModel();
    const names = columns(3);
    model.sync(names, widths(names));

    expect(model.spanPx(-5, 99)).toBe(450);
    expect(model.spanPx(2, 2)).toBe(0);
    expect(model.spanPx(3, 1)).toBe(0);
    expect(model.columnWidthPx(9)).toBe(0);
    expect(model.columnWidthPx(-1)).toBe(0);
  });

  it('rebuilds only when an input identity changes', () => {
    const model = new ColumnWindowModel();
    const names = columns(4);
    const w = widths(names, 100);
    model.sync(names, w);
    expect(model.totalWidthPx()).toBe(400);

    // Mutating the map in place is deliberately NOT observed — the state
    // layer replaces it wholesale, which is what makes identity a sound key.
    w.set('c0', 999);
    model.sync(names, w);
    expect(model.totalWidthPx()).toBe(400);

    // A replacement map is.
    model.sync(names, new Map(w));
    expect(model.totalWidthPx()).toBe(400 - 100 + 999);

    // …as is a replacement column list.
    model.sync([...names, 'c4'], widths(columns(5), 100));
    expect(model.size()).toBe(5);
    expect(model.totalWidthPx()).toBe(500);

    // …as is a change of box overhead against otherwise-identical inputs.
    const five = columns(5);
    const fiveWidths = widths(five, 100);
    model.sync(five, fiveWidths);
    expect(model.totalWidthPx()).toBe(500);
    model.sync(five, fiveWidths, 25);
    expect(model.totalWidthPx()).toBe(5 * 125);
  });

  it('reset() drops the cache', () => {
    const model = new ColumnWindowModel();
    const names = columns(3);
    model.sync(names, widths(names));
    model.reset();
    expect(model.size()).toBe(0);
    expect(model.totalWidthPx()).toBe(0);
    // The same inputs must rebuild rather than hit a stale cache.
    model.sync(names, widths(names));
    expect(model.totalWidthPx()).toBe(450);
  });

  it('adds the box overhead to every column', () => {
    const model = new ColumnWindowModel();
    const names = columns(4);
    model.sync(names, widths(names, 100), 25);
    expect(model.totalWidthPx()).toBe(4 * 125);
    expect(model.columnLeftPx(2)).toBe(250);
    expect(BOX_OVERHEAD_PX).toBe(0);
  });

  it('rounds each declared width before summing (D10)', () => {
    const model = new ColumnWindowModel();
    const names = columns(1000);
    model.sync(names, widths(names, 150.3));
    // 150.3 -> 150 per column, summed exactly. Not 150300.
    expect(model.totalWidthPx()).toBe(150_000);
    expect(Number.isInteger(model.spanPx(0, 990))).toBe(true);
    // Every span is an integer, so no residue can accumulate into the
    // one spacer that stands in for hundreds of header boxes.
    expect(model.spanPx(3, 977) % 1).toBe(0);
  });
});

describe('ColumnWindowModel — visible range', () => {
  const names = columns(60);

  function compute(scrollLeft: number, viewportWidth: number, overrides = {}) {
    return new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: [],
      scrollLeft,
      viewportWidth,
      ...NO_OVERSCAN,
      ...overrides,
    });
  }

  it('excludes a column the viewport edge merely touches', () => {
    // scrollLeft 3000, viewport 600 -> band [3000, 3600). Column 24 starts
    // exactly at 3600, so `colLeft < b` is false and it is out; a `<=` slip
    // would render 25 columns instead of 24.
    const win = compute(3000, 600);
    expect(win.start).toBe(20);
    expect(win.end).toBe(24);
  });

  it('excludes a column whose right edge merely touches the band start', () => {
    // Column 19 ends exactly at 3000; `colRight > a` is false.
    const win = compute(3000, 600);
    expect(win.start).toBe(20);
    // One pixel earlier and column 19 is in.
    expect(compute(2999, 600).start).toBe(19);
  });

  it('includes a column the band ends one pixel inside', () => {
    expect(compute(3000, 601).end).toBe(25);
  });

  it('starts at 0 at the left edge', () => {
    const win = compute(0, 600);
    expect(win.start).toBe(0);
    expect(win.end).toBe(4);
    expect(win.leftSpacerPx).toBe(0);
    expect(win.rightSpacerPx).toBe(56 * 150);
  });

  it('clamps to the content end when scrolled past it', () => {
    const win = compute(1_000_000, 600);
    expect(win.end).toBe(60);
    expect(win.start).toBe(60);
    expect(win.rightSpacerPx).toBe(0);
    expect(win.leftSpacerPx).toBe(9000);
  });

  it('treats a negative scrollLeft as 0', () => {
    expect(compute(-500, 600)).toEqual(compute(0, 600));
  });

  it('handles zero-width columns without excluding their neighbours', () => {
    const model = new ColumnWindowModel();
    const names5 = columns(5);
    const w = new Map([
      ['c0', 0],
      ['c1', 0],
      ['c2', 100],
      ['c3', 100],
      ['c4', 100],
    ]);
    const win = model.compute({
      visibleColumns: names5,
      columnWidths: w,
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 100,
      ...NO_OVERSCAN,
    });
    // A zero-width column at the left edge cannot "intersect" a band it has
    // no extent in — c2 is the first column with any presence.
    expect(win.start).toBe(2);
    expect(win.end).toBe(3);
  });
});

describe('ColumnWindowModel — overscan', () => {
  const names = columns(60);

  it('extends the pixel band by one viewport per side', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: [],
      scrollLeft: 3000,
      viewportWidth: 600,
      minOverscanColumns: 0,
      overscanViewports: 1,
    });
    // band [2400, 4200)
    expect(win.start).toBe(16);
    expect(win.end).toBe(28);
  });

  it('widens to the column floor when the pixel term is small', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: [],
      scrollLeft: 3000,
      viewportWidth: 600,
    });
    // Defaults: pixel overscan gives [16, 28); the 10-column floor around
    // the *visible* range [20, 24) gives [10, 34) and wins on both sides.
    expect(win.start).toBe(10);
    expect(win.end).toBe(34);
    expect(win.end - win.start).toBe(24);
    expect(win.leftSpacerPx).toBe(1500);
    expect(win.rightSpacerPx).toBe(3900);
    expect(win.totalWidthPx).toBe(9000);
  });

  it('keeps a viewport-less table whole through the column floor', () => {
    // jsdom reports clientWidth 0. Every jsdom table in the repo is small
    // enough that the floor renders all of it, which is why the existing
    // suites see no behavior change.
    const small = columns(3);
    const win = new ColumnWindowModel().compute({
      visibleColumns: small,
      columnWidths: widths(small),
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 0,
    });
    expect(win.start).toBe(0);
    expect(win.end).toBe(3);
    expect(win.leftSpacerPx).toBe(0);
    expect(win.rightSpacerPx).toBe(0);
    expect(MIN_OVERSCAN_COLUMNS).toBe(10);
    expect(OVERSCAN_VIEWPORTS).toBe(1);
  });

  it('never overscans past the ends of the column list', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(win.start).toBe(0);
    expect(win.end).toBeLessThanOrEqual(60);
    expect(win.leftSpacerPx).toBe(0);
  });

  it('treats a negative overscan request as zero', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: [],
      scrollLeft: 3000,
      viewportWidth: 600,
      minOverscanColumns: -5,
      overscanViewports: -1,
    });
    expect(win.start).toBe(20);
    expect(win.end).toBe(24);
  });
});

describe('ColumnWindowModel — degenerate column lists', () => {
  it('returns an empty window for zero columns', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: [],
      columnWidths: new Map(),
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(win).toEqual({
      start: 0,
      end: 0,
      pinnedCount: 0,
      leftSpacerPx: 0,
      rightSpacerPx: 0,
      pinnedWidthPx: 0,
      totalWidthPx: 0,
      pinnedPrefixViolated: false,
    });
  });

  it('renders the only column of a one-column table', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: ['only'],
      columnWidths: new Map([['only', 400]]),
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(win.start).toBe(0);
    expect(win.end).toBe(1);
    expect(win.totalWidthPx).toBe(400);
  });

  it('keeps the only column when it is also pinned', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: ['only'],
      columnWidths: new Map([['only', 400]]),
      pinnedColumns: ['only'],
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(win.pinnedCount).toBe(1);
    expect(win.start).toBe(1);
    expect(win.end).toBe(1);
    expect(win.pinnedWidthPx).toBe(400);
    expect(win.leftSpacerPx).toBe(0);
    expect(win.rightSpacerPx).toBe(0);
  });
});

describe('ColumnWindowModel — pinned prefix', () => {
  const names = columns(60);

  it('force-renders the pinned prefix and never starts inside it', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: ['c0', 'c1'],
      scrollLeft: 6000,
      viewportWidth: 600,
      ...NO_OVERSCAN,
    });
    expect(win.pinnedCount).toBe(2);
    expect(win.pinnedWidthPx).toBe(300);
    expect(win.start).toBe(40);
    // The left spacer covers [P, start), not [0, start) — the pinned cells
    // are still in the row and occupy their own width.
    expect(win.leftSpacerPx).toBe(38 * 150);
    expect(win.pinnedPrefixViolated).toBe(false);
  });

  it('clamps start up to the pinned prefix when the window would begin inside it', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: ['c0', 'c1', 'c2'],
      scrollLeft: 0,
      viewportWidth: 600,
      ...NO_OVERSCAN,
    });
    expect(win.pinnedCount).toBe(3);
    expect(win.start).toBe(3);
    expect(win.leftSpacerPx).toBe(0);
  });

  it('ignores pinned columns that are not visible at all', () => {
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: widths(names),
      pinnedColumns: ['hidden-one'],
      scrollLeft: 0,
      viewportWidth: 600,
      ...NO_OVERSCAN,
    });
    expect(win.pinnedCount).toBe(0);
    expect(win.pinnedWidthPx).toBe(0);
    expect(win.pinnedPrefixViolated).toBe(false);
  });

  it('falls back to the last pinned index when the prefix invariant breaks', () => {
    // visible [A, C, D] with D pinned but sitting behind unpinned C.
    const win = new ColumnWindowModel().compute({
      visibleColumns: ['A', 'C', 'D'],
      columnWidths: new Map([
        ['A', 100],
        ['C', 100],
        ['D', 100],
      ]),
      pinnedColumns: ['A', 'D'],
      scrollLeft: 0,
      viewportWidth: 50,
      ...NO_OVERSCAN,
    });
    expect(win.pinnedPrefixViolated).toBe(true);
    // Through the last pinned column: correct, merely less economical.
    expect(win.pinnedCount).toBe(3);
    expect(win.pinnedWidthPx).toBe(300);
    expect(win.start).toBe(3);
    expect(win.end).toBe(3);
  });

  it('pinnedPrefixLength counts the leading run only', () => {
    expect(pinnedPrefixLength(['A', 'C', 'D'], ['A', 'D'])).toBe(1);
    expect(pinnedPrefixLength(['A', 'D', 'C'], ['A', 'D'])).toBe(2);
    expect(pinnedPrefixLength(['A', 'B'], [])).toBe(0);
    expect(pinnedPrefixLength([], ['A'])).toBe(0);
  });
});

describe('the pinned-prefix fallback is reachable through public API', () => {
  const SCHEMA: ColumnSchema[] = ['A', 'C', 'D'].map((name) => ({
    name,
    type: 'string',
    nullable: true,
    originalType: 'VARCHAR',
  }));

  it('hideColumn -> toggleColumnPin -> showColumn leaves a pinned column behind an unpinned one', () => {
    const state = createTableState();
    initializeColumnsFromSchema(state, SCHEMA);
    const actions = new StateActions(state, undefined as never);

    actions.toggleColumnPin('A');
    expect(state.visibleColumns.get()).toEqual(['A', 'C', 'D']);
    expect(state.pinnedColumns.get()).toEqual(['A']);

    actions.hideColumn('C');
    actions.toggleColumnPin('D');
    actions.showColumn('C');

    // `showColumn` splices via `computeRestoreIndex`, which never re-derives
    // from `columnOrder` and never clamps to the pinned prefix.
    expect(state.visibleColumns.get()).toEqual(['A', 'C', 'D']);
    expect(state.pinnedColumns.get()).toEqual(['A', 'D']);

    const win = new ColumnWindowModel().compute({
      visibleColumns: state.visibleColumns.get(),
      columnWidths: state.columnWidths.get(),
      pinnedColumns: state.pinnedColumns.get(),
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(win.pinnedPrefixViolated).toBe(true);
    expect(win.pinnedCount).toBe(3);
  });

  it('hideColumn leaves a hidden column in pinnedColumns, so its length over-counts', () => {
    const state = createTableState();
    initializeColumnsFromSchema(state, SCHEMA);
    const actions = new StateActions(state, undefined as never);

    actions.toggleColumnPin('A');
    actions.toggleColumnPin('C');
    actions.hideColumn('C');

    expect(state.pinnedColumns.get()).toEqual(['A', 'C']);
    expect(state.visibleColumns.get()).not.toContain('C');

    // Counting `pinnedColumns.length` would force-render two columns and
    // push every later sticky offset a column too far right. The leading-run
    // length over `visibleColumns` is 1, which is the truth.
    const win = new ColumnWindowModel().compute({
      visibleColumns: state.visibleColumns.get(),
      columnWidths: state.columnWidths.get(),
      pinnedColumns: state.pinnedColumns.get(),
      scrollLeft: 0,
      viewportWidth: 600,
    });
    expect(state.pinnedColumns.get()).toHaveLength(2);
    expect(win.pinnedCount).toBe(1);
    expect(win.pinnedPrefixViolated).toBe(false);
    expect(win.pinnedWidthPx).toBe(DEFAULT_COLUMN_WIDTH);
  });
});

describe('pinnedOffsets', () => {
  const Z = 20;

  it('places each pinned column after the ones before it', () => {
    const names = ['a', 'b', 'c', 'd'];
    const offsets = pinnedOffsets(names, widths(names), 2, Z, ['a', 'b']);

    expect(offsets.get('a')).toEqual({ left: 0, zIndex: Z + 2 });
    expect(offsets.get('b')).toEqual({ left: 150, zIndex: Z + 1 });
    // z descending left to right, so an earlier column paints over a later
    // one when they overlap at the sticky edge.
    expect(offsets.get('a')!.zIndex).toBeGreaterThan(offsets.get('b')!.zIndex);
    expect(offsets.has('c')).toBe(false);
  });

  it('rounds each width before accumulating, like the prefix sums do', () => {
    const names = ['a', 'b', 'c'];
    const offsets = pinnedOffsets(names, widths(names, 150.6), 3, Z, names);
    expect(offsets.get('b')!.left).toBe(151);
    expect(offsets.get('c')!.left).toBe(302);
  });

  it('does not make an unpinned column sticky when the prefix is violated', () => {
    // `showColumn` can splice an unpinned column in front of a pinned one, so
    // `pinnedCount` falls back to "through the last pinned column" — the right
    // answer for deciding what to *render*, and the wrong one for deciding
    // what to freeze. Without the filter, `b` would pin itself to the
    // viewport edge and no user action asked for it.
    const names = ['a', 'b', 'd'];
    const offsets = pinnedOffsets(names, widths(names), 3, Z, ['a', 'd']);

    expect(offsets.has('b')).toBe(false);
    expect(offsets.get('a')).toEqual({ left: 0, zIndex: Z + 3 });
    // `b` is not sticky but it still occupies its width, so `d` sits past it.
    expect(offsets.get('d')).toEqual({ left: 300, zIndex: Z + 1 });
  });

  it('omits a pinned column that is no longer visible', () => {
    // `hideColumn` leaves the column in `pinnedColumns`. Walking that list
    // gave the hidden column a slot and pushed every later offset — and the
    // demarcation line — one column too far right.
    const names = ['a', 'c'];
    const offsets = pinnedOffsets(names, widths(names), 2, Z, ['a', 'b', 'c']);

    expect([...offsets.keys()]).toEqual(['a', 'c']);
    expect(offsets.get('c')!.left).toBe(150);
  });

  it('is empty for an unpinned table and clamps past the end of the list', () => {
    const names = ['a', 'b'];
    expect(pinnedOffsets(names, widths(names), 0, Z, [])).toEqual(new Map());
    expect([...pinnedOffsets(names, widths(names), 9, Z, names).keys()]).toEqual(['a', 'b']);
  });
});

describe('ColumnWindowModel — hostile widths', () => {
  // `setColumnWidth` validates nothing and a restored session snapshot copies
  // `columnWidths` in wholesale, so a non-finite or negative width is
  // reachable without malice. A non-finite one used to poison every prefix sum
  // after it — and silently, because `flex: 0 0 NaNpx` and
  // `setContentWidth(NaN)` are both rejected by CSSOM, so the spacer and the
  // scroll extent kept their previous values while the model believed
  // something else. A negative one is worse: it makes `prefix` decrease, and
  // the binary searches are only correct on a sorted array. `0` is not in this
  // list — it is a legitimate width, and the visible-range suite pins it.
  for (const [label, bad] of [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['negative', -50],
  ] as const) {
    it(`falls back to the default for a ${label} width instead of poisoning the tail`, () => {
      const model = new ColumnWindowModel();
      const names = columns(5);
      const w = widths(names, 100);
      w.set('c2', bad);
      model.sync(names, w);

      expect(model.totalWidthPx()).toBe(4 * 100 + DEFAULT_COLUMN_WIDTH);
      expect(model.columnWidthPx(2)).toBe(DEFAULT_COLUMN_WIDTH);
      // Everything after the bad column is still a finite, usable number.
      expect(Number.isFinite(model.columnLeftPx(4))).toBe(true);
      expect(model.columnLeftPx(4)).toBe(100 + 100 + DEFAULT_COLUMN_WIDTH + 100);
    });
  }

  it('keeps the prefix sums monotonic through a negative width', () => {
    // The precondition, stated once: `lowerBound` / `upperBound` binary-search
    // `prefix`, so a single decreasing step there does not merely misplace one
    // column — it makes both boundaries arbitrary, and the window can land
    // anywhere. `columnLeftPx(i)` is `prefix[i]`.
    const model = new ColumnWindowModel();
    const names = columns(6);
    const w = widths(names, 100);
    w.set('c3', -400);
    model.sync(names, w);

    for (let i = 1; i <= names.length; i++) {
      expect(model.columnLeftPx(i), `prefix[${i}]`).toBeGreaterThanOrEqual(
        model.columnLeftPx(i - 1),
      );
    }
    // …and the window it hands back is the one that arithmetic implies.
    const win = model.compute({
      visibleColumns: names,
      columnWidths: w,
      pinnedColumns: [],
      scrollLeft: 0,
      viewportWidth: 200,
      minOverscanColumns: 0,
      overscanViewports: 0,
    });
    expect(win).toMatchObject({ start: 0, end: 2 });
  });

  it('keeps the window and both spacers finite', () => {
    const names = columns(60);
    const w = widths(names);
    w.set('c3', Number.NaN);
    const win = new ColumnWindowModel().compute({
      visibleColumns: names,
      columnWidths: w,
      pinnedColumns: [],
      scrollLeft: 3000,
      viewportWidth: 600,
    });

    for (const [key, value] of Object.entries(win)) {
      if (typeof value === 'number') expect(Number.isFinite(value), key).toBe(true);
    }
    expect(win.leftSpacerPx + win.rightSpacerPx).toBeLessThan(win.totalWidthPx);
  });

  it('does not let a non-finite width reach a sticky offset', () => {
    const names = ['a', 'b', 'c'];
    const w = widths(names);
    w.set('a', Number.NaN);
    const offsets = pinnedOffsets(names, w, 3, 20, names);
    expect(offsets.get('b')!.left).toBe(DEFAULT_COLUMN_WIDTH);
    expect(offsets.get('c')!.left).toBe(DEFAULT_COLUMN_WIDTH + 150);
  });
});
