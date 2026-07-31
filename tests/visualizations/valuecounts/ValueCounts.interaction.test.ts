/**
 * @vitest-environment jsdom
 *
 * x-hit-testing for the value-counts column-header plot.
 *
 * The stacked bar draws a 1px border between neighbouring segments. Under
 * exact-bounds hit-testing that seam was an interaction dead zone, so scrubbing
 * across the bar made the hover highlight flash off at every seam. The same
 * ownership rule the histograms use applies here: every x inside
 * `barArea.x .. barArea.x + barArea.width` belongs to exactly one segment, and
 * the seam splits at its midpoint. x outside that extent still belongs to
 * nothing, which is what keeps click-to-clear reachable.
 *
 * Fixture geometry (150x60 container, two segments of 100 and 41):
 *   barArea {x: 4, width: 142}
 *   segment0 {x: 4, width: 100}   segment1 {x: 105, width: 41}
 *   seam [104, 105], boundary x = 104.5
 *
 * Canvas rects are all-zero under jsdom, so `clientX === x` on the canvas.
 *
 * @see src/visualizations/valuecounts/ValueCounts.ts handleMouseMove/handleClick
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

vi.mock('../../../src/visualizations/valuecounts/ValueCountsData', () => ({
  fetchValueCountsData: vi.fn(),
  fetchAlignedValueCountsData: vi.fn(),
}));

import { ValueCounts } from '../../../src/visualizations/valuecounts/ValueCounts';
import { fetchValueCountsData } from '../../../src/visualizations/valuecounts/ValueCountsData';
import type { ValueCountsData } from '../../../src/visualizations/valuecounts/ValueCountsData';
import type { ColumnSchema } from '../../../src/core/types';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';

// =========================================
// Fixtures and helpers
// =========================================

const WIDTH = 150;
const HEIGHT = 60;
/** Any y inside the bar band: [PADDING.top, height - PADDING.bottom] = [3, 38]. */
const IN_BAND_Y = 20;

function makeColumn(): ColumnSchema {
  return { name: 'country', type: 'string', nullable: false, originalType: 'VARCHAR' };
}

function makeBridge(): VisualizationOptions['bridge'] {
  return { query: vi.fn().mockResolvedValue([]) } as unknown as VisualizationOptions['bridge'];
}

function twoSegments(): ValueCountsData {
  return {
    segments: [
      { value: 'us', count: 100, isOther: false },
      { value: 'ca', count: 41, isOther: false },
    ],
    nullCount: 0,
    distinctCount: 2,
    total: 141,
    isAllUnique: false,
  } as ValueCountsData;
}

function emptyData(): ValueCountsData {
  return {
    segments: [],
    nullCount: 0,
    distinctCount: 0,
    total: 0,
    isAllUnique: false,
  } as ValueCountsData;
}

/** Reaches into the protected interaction state the handlers write. */
interface VizState {
  data: ValueCountsData | null;
  hoveredSegment: number | null;
  selectedSegments: Set<number>;
  barArea: { x: number; width: number };
  segmentPositions: { x: number; width: number; index: number }[];
  dataPromise: Promise<void>;
}

function stateOf(viz: ValueCounts): VizState {
  return viz as unknown as VizState;
}

let container: HTMLElement;
let canvas: HTMLCanvasElement;
let onFilterChange: ReturnType<typeof vi.fn>;
let nowMs: number;

async function mount(data: ValueCountsData): Promise<ValueCounts> {
  vi.mocked(fetchValueCountsData).mockResolvedValue(data);
  const viz = new ValueCounts(container, makeColumn(), {
    tableName: 't',
    bridge: makeBridge(),
    filters: [],
    onFilterChange,
  });
  await stateOf(viz).dataPromise;
  canvas = container.querySelector('canvas')!;
  return viz;
}

function move(x: number, y: number = IN_BAND_Y): void {
  canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
}

/** ValueCounts has no brush, so a click gesture is just the click event. */
function click(x: number, y: number = IN_BAND_Y): void {
  nowMs += 1000; // keep gestures out of the double-click window
  canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y }));
}

/** Midpoint of the 1px seam between two adjacent segments. */
function seamBoundary(viz: ValueCounts, leftIndex: number): number {
  const positions = stateOf(viz).segmentPositions;
  const left = positions[leftIndex]!;
  const right = positions[leftIndex + 1]!;
  return (left.x + left.width + right.x) / 2;
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

describe('ValueCounts — fixture layout', () => {
  it('lays the two-segment fixture out as the hand-computed geometry', async () => {
    const viz = await mount(twoSegments());
    const { barArea, segmentPositions } = stateOf(viz);

    expect(barArea.x).toBe(4);
    expect(barArea.width).toBe(142);
    expect(segmentPositions).toHaveLength(2);
    expect(segmentPositions[0]).toMatchObject({ x: 4, width: 100 });
    expect(segmentPositions[1]).toMatchObject({ x: 105, width: 41 });
    expect(seamBoundary(viz, 0)).toBe(104.5);

    viz.destroy();
  });
});

// =========================================
// Hover
// =========================================

describe('ValueCounts — hover', () => {
  it('never drops the highlight while scrubbing across the seam', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);
    const seamLeft = state.segmentPositions[0]!.x + state.segmentPositions[0]!.width;

    for (let x = seamLeft - 1; x <= seamLeft + 2; x += 0.1) {
      move(x);
      expect(state.hoveredSegment).not.toBeNull();
    }

    viz.destroy();
  });

  it('splits the seam at its midpoint', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);
    const boundary = seamBoundary(viz, 0);

    move(boundary - 0.01);
    expect(state.hoveredSegment).toBe(0);

    // The boundary itself belongs to the left segment.
    move(boundary);
    expect(state.hoveredSegment).toBe(0);

    move(boundary + 0.01);
    expect(state.hoveredSegment).toBe(1);

    viz.destroy();
  });

  it('resolves the side paddings and the bottom band to nothing', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);

    move(state.barArea.x - 0.01);
    expect(state.hoveredSegment).toBeNull();

    move(state.barArea.x + state.barArea.width + 0.01);
    expect(state.hoveredSegment).toBeNull();

    // Below the bar band (height - PADDING.bottom = 38).
    move(state.barArea.x + 10, 50);
    expect(state.hoveredSegment).toBeNull();

    viz.destroy();
  });
});

// =========================================
// Click
// =========================================

describe('ValueCounts — click', () => {
  it('selects the nearest segment when the click lands on the seam', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);

    click(seamBoundary(viz, 0));

    expect([...state.selectedSegments]).toEqual([0]);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ column: 'country', type: 'point', value: 'us' });

    viz.destroy();
  });

  it('assigns the far side of the same seam to the next segment', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);

    click(seamBoundary(viz, 0) + 0.01);

    expect([...state.selectedSegments]).toEqual([1]);
    expect(onFilterChange).toHaveBeenCalledWith({ column: 'country', type: 'point', value: 'ca' });

    viz.destroy();
  });

  it('still clears the selection when the click lands outside the bar area', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);

    click(state.barArea.x + 10);
    expect(state.selectedSegments.size).toBe(1);
    onFilterChange.mockClear();

    // Left padding.
    click(state.barArea.x - 1);
    expect(state.selectedSegments.size).toBe(0);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    // Right padding.
    click(state.barArea.x + 10);
    onFilterChange.mockClear();
    click(state.barArea.x + state.barArea.width + 1);
    expect(state.selectedSegments.size).toBe(0);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    // Bottom band.
    click(state.barArea.x + 10);
    onFilterChange.mockClear();
    click(state.barArea.x + 10, 50);
    expect(state.selectedSegments.size).toBe(0);
    expect(onFilterChange).toHaveBeenCalledWith(null);

    viz.destroy();
  });
});

// =========================================
// Stale layout state
// =========================================

describe('ValueCounts — stale layout state', () => {
  it('drops segment geometry when a re-render finds no data', async () => {
    const viz = await mount(twoSegments());
    const state = stateOf(viz);
    expect(state.segmentPositions).toHaveLength(2);

    state.data = emptyData();
    viz.render();

    expect(state.segmentPositions).toEqual([]);

    // Nothing left to hit: hover over the old segment region resolves to nothing.
    move(50);
    expect(state.hoveredSegment).toBeNull();

    viz.destroy();
  });
});
