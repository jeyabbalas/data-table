/**
 * @vitest-environment jsdom
 *
 * x-hit-testing for the histogram column-header plot.
 *
 * One ownership rule applies to every x-hit-test in `SharedHistogramBase`:
 * every x inside the plot's horizontal extent belongs to exactly one slot,
 * and the gap between two neighbouring slots splits at its midpoint. The null
 * bar is a slot too, so `LAYOUT.nullBarGap` splits rather than falling wholly
 * to the last bar. x outside the extent belongs to nothing, which is what
 * keeps "click the padding to clear a selection" working.
 *
 * These lock the behavior of `hitTestX` through its five call sites — hover,
 * click, both `handleMouseDown` branches, and `isInsideBrush` — plus the
 * `slideBrush` snap step, which shares the same gap geometry.
 *
 * Fixture geometry (150x60 container, 5 bins, nullCount 2), all derived from
 * the live `barPositions` in the tests but anchored here for readability:
 *   chartArea   {x: 4, width: 122}      nullBarArea {x: 130, width: 16}
 *   bar width   21.79                   bar gap     3.27  (15% of bar width)
 *   bar0/bar1 boundary  x ~= 27.42      bar4/null boundary  x = 128
 *
 * Canvas rects are all-zero under jsdom, so `clientX === x` on the canvas.
 *
 * @see src/visualizations/histogram/SharedHistogramBase.ts hitTestX
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = {
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  rect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 30 }),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
};

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockContext);

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock('../../../src/visualizations/histogram/HistogramData', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return { ...actual, fetchHistogramData: vi.fn() };
});

import { Histogram } from '../../../src/visualizations/histogram/Histogram';
import { fetchHistogramData } from '../../../src/visualizations/histogram/HistogramData';
import type { HistogramData } from '../../../src/visualizations/histogram/HistogramData';
import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

// =========================================
// Fixtures and helpers
// =========================================

const WIDTH = 150;
const HEIGHT = 60;
/** Any y inside the chart band: [PADDING.top, height - PADDING.bottom] = [3, 38]. */
const IN_BAND_Y = 20;

function makeColumn(): ColumnSchema {
  return { name: 'v', type: 'integer', nullable: true, originalType: 'INTEGER' };
}

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn().mockResolvedValue([]) } as unknown as VisualizationOptions['bridge'];
}

/** Five 10-wide bins over [0, 50) plus two nulls. */
function fiveBinsWithNulls(): HistogramData {
  return {
    bins: [
      { x0: 0, x1: 10, count: 5 },
      { x0: 10, x1: 20, count: 8 },
      { x0: 20, x1: 30, count: 3 },
      { x0: 30, x1: 40, count: 6 },
      { x0: 40, x1: 50, count: 4 },
    ],
    nullCount: 2,
    min: 0,
    max: 50,
    total: 28,
    isSingleValue: false,
    isDiscrete: false,
    median: 25,
    distinctCount: 5,
  } as HistogramData;
}

/** One narrow bar centered in the chart area, no nulls. */
function singleValue(): HistogramData {
  return {
    bins: [{ x0: 7, x1: 7, count: 12 }],
    nullCount: 0,
    min: 7,
    max: 7,
    total: 12,
    isSingleValue: true,
    isDiscrete: true,
    median: 7,
    distinctCount: 1,
  } as HistogramData;
}

/** Reaches into the protected interaction state the handlers write. */
interface VizState {
  data: HistogramData | null;
  hoveredBin: number | null;
  hoveredNull: boolean;
  selectedNull: boolean;
  chartArea: { x: number; width: number };
  nullBarArea: { x: number; width: number };
  barPositions: { x: number; width: number; binIndex: number }[];
  brushState: {
    active: boolean;
    committed: boolean;
    sliding: boolean;
    startX: number;
    startBinIndex: number;
    endBinIndex: number;
    slideVisualOffset: number;
    lastClickTime: number;
  };
  dataPromise: Promise<void>;
}

function stateOf(viz: Histogram): VizState {
  return viz as unknown as VizState;
}

let container: HTMLElement;
let canvas: HTMLCanvasElement;
let onFilterChange: ReturnType<typeof vi.fn>;
let nowMs: number;

/** Monotonic clock so gestures never accidentally read as double-clicks. */
function advanceClock(ms = 1000): void {
  nowMs += ms;
}

async function mount(data: HistogramData, filters: Filter[] = []): Promise<Histogram> {
  vi.mocked(fetchHistogramData).mockResolvedValue(data);
  const viz = new Histogram(container, makeColumn(), {
    tableName: 't',
    bridge: makeBridge(),
    filters,
    onFilterChange,
  });
  await stateOf(viz).dataPromise;
  canvas = container.querySelector('canvas')!;
  return viz;
}

function move(x: number, y: number = IN_BAND_Y): void {
  canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
}

function press(x: number, y: number = IN_BAND_Y): void {
  advanceClock();
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y }));
}

function release(x: number, y: number = IN_BAND_Y): void {
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y }));
}

/** A full click gesture in browser order: mousedown, mouseup, click. */
function click(x: number, y: number = IN_BAND_Y): void {
  press(x, y);
  release(x, y);
  canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }));
}

/** Midpoint of the gap between two adjacent bars — the ownership boundary. */
function barBoundary(viz: Histogram, leftIndex: number): number {
  const positions = stateOf(viz).barPositions;
  const left = positions[leftIndex]!;
  const right = positions[leftIndex + 1]!;
  return (left.x + left.width + right.x) / 2;
}

/** Midpoint of `nullBarGap` — the boundary between the last bar and the null bar. */
function nullBoundary(viz: Histogram): number {
  const { barPositions, nullBarArea } = stateOf(viz);
  const last = barPositions[barPositions.length - 1]!;
  return (last.x + last.width + nullBarArea.x) / 2;
}

beforeEach(() => {
  document.body.innerHTML = '';
  nowMs = 1_700_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  onFilterChange = vi.fn();
  container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    top: 0,
    left: 0,
    bottom: HEIGHT,
    right: WIDTH,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// =========================================
// Layout anchors
// =========================================

describe('SharedHistogramBase — fixture layout', () => {
  it('lays the 5-bin fixture out as the hand-computed geometry', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const { chartArea, nullBarArea, barPositions } = stateOf(viz);

    expect(chartArea.x).toBe(4);
    expect(chartArea.width).toBe(122);
    expect(nullBarArea.x).toBe(130);
    expect(nullBarArea.width).toBe(16);
    expect(barPositions).toHaveLength(5);
    expect(barPositions[0]!.width).toBeCloseTo(21.79, 2);
    // Few-bin regime: gaps are 15% of bar width, not LAYOUT.barGap.
    expect(barPositions[1]!.x - barPositions[0]!.x - barPositions[0]!.width).toBeCloseTo(3.27, 2);
    expect(barBoundary(viz, 0)).toBeCloseTo(27.42, 2);
    expect(nullBoundary(viz)).toBeCloseTo(128, 6);

    viz.destroy();
  });
});

// =========================================
// Hover
// =========================================

describe('SharedHistogramBase — hover', () => {
  it('never drops the highlight while scrubbing across a gap', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const first = state.barPositions[0]!;
    const second = state.barPositions[1]!;

    // Sweep from inside bar0, through the whole gap, into bar1.
    for (let x = first.x + 1; x <= second.x + 1; x += 0.25) {
      move(x);
      expect(state.hoveredBin).not.toBeNull();
    }

    viz.destroy();
  });

  it('splits the inter-bar gap at its midpoint', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const boundary = barBoundary(viz, 0);

    move(boundary - 0.01);
    expect(state.hoveredBin).toBe(0);

    // The boundary itself belongs to the left slot.
    move(boundary);
    expect(state.hoveredBin).toBe(0);

    move(boundary + 0.01);
    expect(state.hoveredBin).toBe(1);

    viz.destroy();
  });

  it('re-renders only when the hovered bar actually changes', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const boundary = barBoundary(viz, 0);

    move(state.barPositions[0]!.x + 1);
    expect(state.hoveredBin).toBe(0);

    const rendersAfterFirstHover = mockContext.clearRect.mock.calls.length;

    // Still bar0 — inside the bar, then out in the gap it now owns.
    move(state.barPositions[0]!.x + 2);
    move(boundary - 0.01);
    expect(state.hoveredBin).toBe(0);
    expect(mockContext.clearRect.mock.calls.length).toBe(rendersAfterFirstHover);

    // Crossing the boundary is a real change.
    move(boundary + 0.01);
    expect(state.hoveredBin).toBe(1);
    expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(rendersAfterFirstHover);

    viz.destroy();
  });

  it('splits the null gap at its midpoint instead of giving it to the last bar', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const boundary = nullBoundary(viz);

    move(boundary);
    expect(state.hoveredBin).toBe(4);
    expect(state.hoveredNull).toBe(false);

    move(boundary + 0.01);
    expect(state.hoveredBin).toBeNull();
    expect(state.hoveredNull).toBe(true);

    // The null bar's right edge is the extent's max; past it, nothing.
    const nullRight = state.nullBarArea.x + state.nullBarArea.width;
    move(nullRight);
    expect(state.hoveredNull).toBe(true);

    move(nullRight + 0.01);
    expect(state.hoveredNull).toBe(false);
    expect(state.hoveredBin).toBeNull();

    viz.destroy();
  });

  it('resolves the paddings to nothing', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);

    move(stateOf(viz).chartArea.x - 0.01);
    expect(state.hoveredBin).toBeNull();
    expect(state.hoveredNull).toBe(false);

    move(WIDTH - 1);
    expect(state.hoveredBin).toBeNull();
    expect(state.hoveredNull).toBe(false);

    viz.destroy();
  });
});

// =========================================
// Click
// =========================================

describe('SharedHistogramBase — click', () => {
  it('commits a one-bin brush on the nearest bar when the click lands in a gap', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const boundary = barBoundary(viz, 1);

    click(boundary - 0.01);

    expect(state.brushState.committed).toBe(true);
    expect(state.brushState.startBinIndex).toBe(1);
    expect(state.brushState.endBinIndex).toBe(1);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      column: 'v',
      type: 'range',
      min: 10,
      max: 20,
    });

    viz.destroy();
  });

  it('assigns the far side of the same gap to the next bar', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);

    click(barBoundary(viz, 1) + 0.01);

    expect(state.brushState.startBinIndex).toBe(2);
    expect(onFilterChange).toHaveBeenCalledWith({
      column: 'v',
      type: 'range',
      min: 20,
      max: 30,
    });

    viz.destroy();
  });

  it('filters on null when the click lands in the null half of the null gap', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);

    click(nullBoundary(viz) + 0.01);

    expect(state.selectedNull).toBe(true);
    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ column: 'v', type: 'null' });

    viz.destroy();
  });

  it('clears a null selection when the click lands in the padding', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);

    click(nullBoundary(viz) + 0.01);
    expect(state.selectedNull).toBe(true);
    onFilterChange.mockClear();

    // Left padding — outside the extent, so it belongs to no slot.
    click(stateOf(viz).chartArea.x - 1);

    expect(state.selectedNull).toBe(false);
    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    viz.destroy();
  });

  it('does not act on a bar whose bin is empty', async () => {
    const data = fiveBinsWithNulls();
    data.bins[2]!.count = 0;
    const viz = await mount(data);
    const state = stateOf(viz);

    click(stateOf(viz).barPositions[2]!.x + 1);

    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).not.toHaveBeenCalled();

    viz.destroy();
  });
});

// =========================================
// Brush creation
// =========================================

describe('SharedHistogramBase — brush creation', () => {
  it('starts a brush from a press that lands in a gap', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    const pressX = barBoundary(viz, 0) - 0.01; // in the bar0/bar1 gap

    press(pressX);
    // The press must record a non-zero startX: handleMouseUp uses it as the
    // "a brush was started" sentinel.
    expect(state.brushState.startX).toBeCloseTo(pressX, 6);
    expect(state.brushState.startX).not.toBe(0);

    move(state.barPositions[2]!.x + 5);
    expect(state.brushState.active).toBe(true);

    release(state.barPositions[2]!.x + 5);

    expect(state.brushState.committed).toBe(true);
    expect(state.brushState.startBinIndex).toBe(1);
    expect(state.brushState.endBinIndex).toBe(2);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      column: 'v',
      type: 'range',
      min: 10,
      max: 30,
    });

    viz.destroy();
  });

  it('starts no brush from a press on the null slot or in the padding', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);

    press(nullBoundary(viz) + 0.01);
    expect(state.brushState.startX).toBe(0);
    release(nullBoundary(viz) + 0.01);

    press(stateOf(viz).chartArea.x - 1);
    expect(state.brushState.startX).toBe(0);
    release(stateOf(viz).chartArea.x - 1);

    viz.destroy();
  });
});

// =========================================
// Committed-brush hit region
// =========================================

describe('SharedHistogramBase — committed brush hit region', () => {
  /** Commit a one-bin brush on `binIndex` and reset the filter spy. */
  async function withBrushOn(binIndex: number): Promise<Histogram> {
    const viz = await mount(fiveBinsWithNulls());
    click(stateOf(viz).barPositions[binIndex]!.x + 1);
    expect(stateOf(viz).brushState.committed).toBe(true);
    onFilterChange.mockClear();
    return viz;
  }

  it('slides instead of clearing when the press lands in the half-gap outside an edge', async () => {
    const viz = await withBrushOn(2);
    const state = stateOf(viz);
    const outsideEdge = barBoundary(viz, 2) - 0.01; // past bar2's right edge, still bar2's

    expect(outsideEdge).toBeGreaterThan(
      state.barPositions[2]!.x + state.barPositions[2]!.width, // outside the drawn bar
    );

    press(outsideEdge);
    expect(state.brushState.sliding).toBe(true);
    expect(state.brushState.committed).toBe(true);
    // The press itself must not clear-and-recreate the filter.
    expect(onFilterChange).not.toHaveBeenCalled();

    release(outsideEdge);

    // Exactly one emission for the whole gesture, and it is the same range —
    // not a clear followed by a fresh one-bin brush.
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      column: 'v',
      type: 'range',
      min: 20,
      max: 30,
    });
    expect(state.brushState.startBinIndex).toBe(2);
    expect(state.brushState.endBinIndex).toBe(2);

    viz.destroy();
  });

  it('clears once the press crosses into the next bar', async () => {
    const viz = await withBrushOn(2);
    const state = stateOf(viz);

    press(barBoundary(viz, 2) + 0.01);

    expect(state.brushState.sliding).toBe(false);
    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    viz.destroy();
  });

  it('clears when the press lands in the padding outside the extent', async () => {
    const viz = await withBrushOn(2);
    const state = stateOf(viz);

    click(stateOf(viz).chartArea.x - 1);

    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    viz.destroy();
  });
});

// =========================================
// slideBrush snap step
// =========================================

describe('SharedHistogramBase — slideBrush snap step', () => {
  it('snaps to the real bar pitch on a few-bin histogram', async () => {
    const viz = await mount(fiveBinsWithNulls());
    click(stateOf(viz).barPositions[0]!.x + 1);
    const state = stateOf(viz);
    expect(state.brushState.committed).toBe(true);

    // The few-bin regime spaces bars by 15% of their width; a step built from
    // `barPositions[0].width + LAYOUT.barGap` would be ~2.27px short per bin.
    const pitch = state.barPositions[1]!.x - state.barPositions[0]!.x;
    const grabX = state.barPositions[0]!.x + 1;

    press(grabX);
    expect(state.brushState.sliding).toBe(true);

    move(grabX + pitch);

    expect(state.brushState.startBinIndex).toBe(1);
    expect(state.brushState.endBinIndex).toBe(1);
    // Dragging exactly one pitch must land the brush exactly on bin 1, with no
    // residual offset between the drawn overlay and the bar.
    expect(state.brushState.slideVisualOffset).toBeCloseTo(0, 6);

    release(grabX + pitch);
    expect(onFilterChange).toHaveBeenLastCalledWith({
      column: 'v',
      type: 'range',
      min: 10,
      max: 20,
    });

    viz.destroy();
  });
});

// =========================================
// Ghost null bar
// =========================================

describe('SharedHistogramBase — null bar crossfiltered to zero', () => {
  it('stays hoverable but inert on click, exactly like a ghost bar', async () => {
    const background = fiveBinsWithNulls();
    const foreground = fiveBinsWithNulls();
    foreground.nullCount = 0;

    const viz = await mount(background);
    // Force the crossfilter shape the layout reads: nulls in the background
    // (so the null bar is still drawn) but none in the foreground.
    const state = stateOf(viz);
    (viz as unknown as { backgroundData: HistogramData }).backgroundData = background;
    state.data = foreground;
    viz.render();
    onFilterChange.mockClear();

    move(state.nullBarArea.x + 2);
    expect(state.hoveredNull).toBe(true);

    click(state.nullBarArea.x + 2);
    expect(state.selectedNull).toBe(false);
    expect(state.brushState.committed).toBe(false);
    expect(onFilterChange).not.toHaveBeenCalled();

    viz.destroy();
  });
});

// =========================================
// Single-value regime
// =========================================

describe('SharedHistogramBase — single-value histogram', () => {
  it('gives the whole chart area to the one bar', async () => {
    // Accepted consequence of the uniform rule: a single-value histogram draws
    // one deliberately narrow bar (<=60px) centered in the chart area, and the
    // rule hands that bar every x in the chart area. There are no inter-bar
    // gaps here so nothing flickers either way; the trade is a much larger
    // click target against the in-chart "click blank space to clear" escape.
    // Clearing stays available via the paddings, the y-bands, double-click and
    // Escape.
    const viz = await mount(singleValue());
    const state = stateOf(viz);
    const bar = state.barPositions[0]!;

    expect(bar.width).toBeLessThanOrEqual(60);
    expect(bar.x).toBeGreaterThan(state.chartArea.x);

    // Left of the drawn bar but inside the chart area.
    move(state.chartArea.x);
    expect(state.hoveredBin).toBe(0);

    // Right of the drawn bar, up to the chart edge.
    move(state.chartArea.x + state.chartArea.width);
    expect(state.hoveredBin).toBe(0);

    // The paddings still belong to nothing.
    move(state.chartArea.x - 0.01);
    expect(state.hoveredBin).toBeNull();
    move(state.chartArea.x + state.chartArea.width + 0.01);
    expect(state.hoveredBin).toBeNull();

    // A click anywhere in the chart area therefore selects the bar.
    click(state.chartArea.x + 1);
    expect(state.brushState.committed).toBe(true);
    expect(state.brushState.startBinIndex).toBe(0);

    viz.destroy();
  });
});

// =========================================
// Stale layout state
// =========================================

describe('SharedHistogramBase — stale layout state', () => {
  it('drops bar geometry when a re-render finds no data', async () => {
    const viz = await mount(fiveBinsWithNulls());
    const state = stateOf(viz);
    expect(state.barPositions.length).toBe(5);

    // Simulate the data going empty (e.g. a filter with no matching rows).
    state.data = { ...fiveBinsWithNulls(), bins: [], nullCount: 0, total: 0 } as HistogramData;
    viz.render();

    expect(state.barPositions).toEqual([]);
    expect(state.nullBarArea).toEqual({ x: 0, y: 0, width: 0, height: 0 });

    // Nothing left to hit: hover over the old bar region resolves to nothing.
    move(60);
    expect(state.hoveredBin).toBeNull();
    expect(state.hoveredNull).toBe(false);

    viz.destroy();
  });
});
