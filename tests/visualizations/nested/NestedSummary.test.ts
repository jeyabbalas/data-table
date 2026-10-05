/**
 * @vitest-environment jsdom
 *
 * The summary chart of a nested column: a bar of its non-null and null
 * shares, the filters' share solid over a ghost, the type outline under it,
 * hover detail in the stats slot, and nothing on click.
 *
 * The canvas context records what is filled: each `fill()` as its fill style
 * and the bounding box of its path, each `fillText()` with its fill style.
 * `clearRect()` starts a new frame, so the records are the last render's.
 * Text measures 5 px a character. Canvas rects are all zero under jsdom, so
 * `clientX === x` on the canvas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Shape {
  fill: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface DrawnText {
  text: string;
  x: number;
  y: number;
  fill: string;
}

const shapes: Shape[] = [];
const texts: DrawnText[] = [];
let points: [number, number][] = [];

const context = {
  fillStyle: '' as string,
  strokeStyle: '' as string,
  lineWidth: 1,
  font: '',
  textAlign: 'left' as CanvasTextAlign,
  textBaseline: 'top' as CanvasTextBaseline,
  setTransform: vi.fn(),
  clearRect: vi.fn(() => {
    shapes.length = 0;
    texts.length = 0;
  }),
  beginPath: vi.fn(() => {
    points = [];
  }),
  moveTo: vi.fn((x: number, y: number) => points.push([x, y])),
  lineTo: vi.fn((x: number, y: number) => points.push([x, y])),
  quadraticCurveTo: vi.fn((_cx: number, _cy: number, x: number, y: number) => points.push([x, y])),
  rect: vi.fn((x: number, y: number, w: number, h: number) => {
    points.push([x, y], [x + w, y + h]);
  }),
  closePath: vi.fn(),
  fill: vi.fn(() => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    shapes.push({
      fill: context.fillStyle,
      x,
      y,
      width: Math.max(...xs) - x,
      height: Math.max(...ys) - y,
    });
  }),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn((text: string, x: number, y: number) => {
    texts.push({ text, x, y, fill: context.fillStyle });
  }),
  measureText: vi.fn((text: string) => ({ width: text.length * 5 })),
  save: vi.fn(),
  restore: vi.fn(),
};

HTMLCanvasElement.prototype.getContext = vi
  .fn()
  .mockReturnValue(context) as unknown as typeof HTMLCanvasElement.prototype.getContext;

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

import type { ColumnSchema, Filter } from '../../../src/core/types';
import type { NestedColumnStats } from '../../../src/statistics/ColumnStatsTypes';
import type { VisualizationOptions } from '../../../src/visualizations/BaseVisualization';
import { NestedSummaryVisualization } from '../../../src/visualizations/nested';
import { inkFor } from '../../../src/visualizations/palette';

// =========================================
// Fixtures and helpers
// =========================================

const WIDTH = 150;
const HEIGHT = 60;
/** barArea: x 4, width 142; y centres the 36 px bar + outline block: (60 - 36) / 2. */
const BAR = { x: 4, y: 12, width: 142, height: 18 };
const IN_BAR_Y = BAR.y + 9;

/** The light theme's fills, the palette's fallbacks without a stylesheet. */
const LIGHT = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryFaded: 'rgba(37, 99, 235, 0.3)',
  primaryGhost: 'rgba(37, 99, 235, 0.5)',
  accent: '#f59e0b',
  accentHover: '#d97706',
  accentSoft: 'rgba(245, 158, 11, 0.3)',
  text: '#111827',
  textSecondary: '#374151',
};

interface Counts {
  total: number;
  non_null: number;
  filtered_total?: number;
  filtered_non_null?: number;
}

let root: HTMLElement;
let container: HTMLElement;
let query: ReturnType<typeof vi.fn>;
let onFilterChange: ReturnType<typeof vi.fn>;
let onSelectionChange: ReturnType<typeof vi.fn>;
let onBrushCommit: ReturnType<typeof vi.fn>;
let onStatsChange: ReturnType<typeof vi.fn>;
let onDefaultStatsChange: ReturnType<typeof vi.fn>;
let onError: ReturnType<typeof vi.fn>;

function column(originalType = 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)'): ColumnSchema {
  return { name: 'point', type: 'nested', nullable: true, originalType };
}

async function mount(
  counts: Counts,
  options: { originalType?: string; filters?: Filter[] } = {},
): Promise<NestedSummaryVisualization> {
  query.mockResolvedValue([counts]);
  const viz = new NestedSummaryVisualization(container, column(options.originalType), {
    tableName: 't',
    bridge: { query } as unknown as VisualizationOptions['bridge'],
    filters: options.filters ?? [],
    onFilterChange,
    onSelectionChange,
    onBrushCommit,
    onStatsChange,
    onDefaultStatsChange,
    onError,
  });
  await viz.waitForData();
  return viz;
}

function canvasOf(viz: NestedSummaryVisualization): HTMLCanvasElement {
  return (viz as unknown as { canvas: HTMLCanvasElement }).canvas;
}

function move(viz: NestedSummaryVisualization, x: number, y: number = IN_BAR_Y): void {
  canvasOf(viz).dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
}

function segments(viz: NestedSummaryVisualization): { x: number; width: number; kind: string }[] {
  return (viz as unknown as { segmentPositions: { x: number; width: number; kind: string }[] })
    .segmentPositions;
}

/** The text drawn as `text`, if any. */
function drawn(text: string): DrawnText | undefined {
  return texts.find((t) => t.text === text);
}

/** The shapes filled in `fill`. */
function filled(fill: string): Shape[] {
  return shapes.filter((s) => s.fill === fill);
}

const lastDetail = (): unknown => onStatsChange.mock.calls.at(-1)?.[0];

beforeEach(() => {
  document.body.innerHTML = '';
  shapes.length = 0;
  texts.length = 0;
  query = vi.fn();
  onFilterChange = vi.fn();
  onSelectionChange = vi.fn();
  onBrushCommit = vi.fn();
  onStatsChange = vi.fn();
  onDefaultStatsChange = vi.fn();
  onError = vi.fn();
  root = document.createElement('div');
  root.className = 'dt-root';
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
  root.appendChild(container);
  document.body.appendChild(root);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// =========================================
// The bar
// =========================================

describe('NestedSummaryVisualization — the bar', () => {
  it('draws the non-null share in --dt-primary and the null share in --dt-accent', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });

    // 141 px between the two segments' 1 px border: 75% is 106 px.
    expect(segments(viz)).toMatchObject([
      { kind: 'value', x: 4, width: 106 },
      { kind: 'null', x: 111, width: 35 },
    ]);
    expect(filled(LIGHT.primary)).toEqual([
      { fill: LIGHT.primary, x: 4, y: 12, width: 106, height: 18 },
    ]);
    expect(filled(LIGHT.accent)).toEqual([
      { fill: LIGHT.accent, x: 111, y: 12, width: 35, height: 18 },
    ]);
    viz.destroy();
  });

  it('labels the non-null share with its percentage, and the null share ∅', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });

    const percent = drawn('75%')!;
    expect(percent).toBeDefined();
    expect(percent.x).toBe(4 + 106 / 2);
    expect(percent.y).toBe(BAR.y + BAR.height / 2);
    expect(drawn('∅')!.x).toBe(111 + 35 / 2);
    viz.destroy();
  });

  it('labels the non-null segment only from 30 px wide', async () => {
    // 20% of 141 px is 28 px: no room for the percentage.
    const narrow = await mount({ total: 1000, non_null: 200 });
    expect(segments(narrow)[0]!.width).toBe(28);
    expect(texts.some((t) => t.text.endsWith('%'))).toBe(false);
    narrow.destroy();

    // 22% is 31 px.
    const wide = await mount({ total: 1000, non_null: 220 });
    expect(segments(wide)[0]!.width).toBe(31);
    expect(drawn('22%')).toBeDefined();
    wide.destroy();
  });

  it('never says 100% while there are nulls', async () => {
    const viz = await mount({ total: 1000, non_null: 998 });
    expect(drawn('99%')).toBeDefined();
    expect(drawn('100%')).toBeUndefined();
    viz.destroy();
  });

  it('keeps a segment with rows at least 3 px wide', async () => {
    const viz = await mount({ total: 100_000, non_null: 99_999 });
    expect(segments(viz)).toMatchObject([
      { kind: 'value', width: 138 },
      { kind: 'null', x: 143, width: 3 },
    ]);
    // Too thin for its ∅.
    expect(drawn('∅')).toBeUndefined();
    viz.destroy();
  });

  it('draws an all-null column as one full accent bar', async () => {
    const viz = await mount({ total: 40, non_null: 0 });
    expect(segments(viz)).toMatchObject([{ kind: 'null', x: 4, width: 142 }]);
    expect(filled(LIGHT.accent)).toEqual([{ fill: LIGHT.accent, ...BAR }]);
    expect(filled(LIGHT.primary)).toEqual([]);
    expect(drawn('∅')).toBeDefined();
    viz.destroy();
  });

  it('draws a column without nulls as one full primary bar at 100%', async () => {
    const viz = await mount({ total: 40, non_null: 40 });
    expect(segments(viz)).toMatchObject([{ kind: 'value', x: 4, width: 142 }]);
    expect(filled(LIGHT.primary)).toEqual([{ fill: LIGHT.primary, ...BAR }]);
    expect(drawn('100%')).toBeDefined();
    viz.destroy();
  });

  it('draws the type outline under the bar in --dt-text-secondary', async () => {
    const viz = await mount({ total: 10, non_null: 9 });
    const outline = drawn('{x, y, tier}')!;
    expect(outline.fill).toBe(LIGHT.textSecondary);
    expect(outline.x).toBe(BAR.x + BAR.width / 2);
    expect(outline.y).toBeGreaterThan(BAR.y + BAR.height);
    expect(outline.y).toBeLessThan(HEIGHT);
    viz.destroy();
  });

  it('cuts a long outline to the bar’s width', async () => {
    const fields = Array.from({ length: 12 }, (_, i) => `field_${i} INTEGER`).join(', ');
    const viz = await mount({ total: 10, non_null: 10 }, { originalType: `STRUCT(${fields})` });
    const outline = texts.find((t) => t.text.startsWith('{field_0'))!;
    expect(outline.text.endsWith('…')).toBe(true);
    expect(outline.text.length * 5).toBeLessThanOrEqual(BAR.width);
    viz.destroy();
  });

  it('draws "No data" for an empty relation', async () => {
    const viz = await mount({ total: 0, non_null: 0 });
    expect(drawn('No data')).toBeDefined();
    expect(shapes).toEqual([]);
    expect(segments(viz)).toEqual([]);
    viz.destroy();
  });
});

// =========================================
// Label ink
// =========================================

describe('NestedSummaryVisualization — label ink', () => {
  it('draws each label in the ink inkFor picks for its fill', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    expect(drawn('75%')!.fill).toBe(inkFor(LIGHT.primary));
    expect(drawn('75%')!.fill).toBe('#ffffff');
    expect(drawn('∅')!.fill).toBe(inkFor(LIGHT.accent));
    expect(drawn('∅')!.fill).toBe('#111827');
    viz.destroy();
  });

  it('draws a label on a faded segment in the theme’s text color', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    move(viz, 120); // the null segment
    expect(drawn('75%')!.fill).toBe(LIGHT.text);
    viz.destroy();
  });

  it('repaints with the dark palette when the color scheme flips', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    root.style.setProperty('--dt-primary', '#60a5fa');
    root.style.setProperty('--dt-accent', '#fbbf24');
    root.setAttribute('data-dt-color-scheme', 'dark');
    await Promise.resolve();
    await Promise.resolve();

    expect(filled('#60a5fa')).toHaveLength(1);
    expect(filled('#fbbf24')).toHaveLength(1);
    // White would be 2.5:1 on the dark theme's primary.
    expect(drawn('75%')!.fill).toBe('#111827');
    viz.destroy();
  });
});

// =========================================
// Filters
// =========================================

describe('NestedSummaryVisualization — crossfilter', () => {
  const FILTERS: Filter[] = [{ type: 'range', column: 'n', min: 1, max: 5 }];

  it('draws each segment as a ghost with the share passing the filters solid over it', async () => {
    const viz = await mount(
      { total: 1000, non_null: 800, filtered_total: 400, filtered_non_null: 300 },
      { filters: FILTERS },
    );
    // Widths from the unfiltered counts: 80% of 141 px.
    expect(segments(viz)).toMatchObject([
      { kind: 'value', x: 4, width: 113 },
      { kind: 'null', x: 118, width: 28 },
    ]);
    // Ghosts at full width, then 300 / 800 and 100 / 200 of each solid.
    expect(filled(LIGHT.primaryGhost)).toEqual([
      { fill: LIGHT.primaryGhost, x: 4, y: 12, width: 113, height: 18 },
    ]);
    expect(filled(LIGHT.primary)).toEqual([
      { fill: LIGHT.primary, x: 4, y: 12, width: 113 * (300 / 800), height: 18 },
    ]);
    expect(filled(LIGHT.accentSoft)).toEqual([
      { fill: LIGHT.accentSoft, x: 118, y: 12, width: 28, height: 18 },
    ]);
    expect(filled(LIGHT.accent)).toEqual([
      { fill: LIGHT.accent, x: 118, y: 12, width: 14, height: 18 },
    ]);
    // The label sits on the ghost past the solid share: the text color.
    expect(drawn('80%')!.fill).toBe(LIGHT.text);
    viz.destroy();
  });

  it('draws no solid part for a segment no row of which passes', async () => {
    const viz = await mount(
      { total: 100, non_null: 50, filtered_total: 10, filtered_non_null: 10 },
      { filters: FILTERS },
    );
    expect(filled(LIGHT.accentSoft)).toHaveLength(1);
    expect(filled(LIGHT.accent)).toEqual([]);
    viz.destroy();
  });

  it('refetches with new filters through updateFilters', async () => {
    const viz = await mount({ total: 100, non_null: 50 });
    expect(query.mock.calls[0]![0]).not.toContain('FILTER');

    query.mockResolvedValue([
      { total: 100, non_null: 50, filtered_total: 20, filtered_non_null: 5 },
    ]);
    await viz.updateFilters(FILTERS);
    expect(query.mock.calls[1]![0]).toContain('FILTER (WHERE');
    expect(filled(LIGHT.primaryGhost)).toHaveLength(1);
    viz.destroy();
  });
});

// =========================================
// Hover
// =========================================

describe('NestedSummaryVisualization — hover', () => {
  it('highlights the hovered segment, fades the other, and posts its detail', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    move(viz, 40);

    expect(filled(LIGHT.primaryHover)).toHaveLength(1);
    expect(filled(LIGHT.accentSoft)).toHaveLength(1);
    expect(lastDetail()).toBe(
      '<span class="stats-label">Category:</span> non-null · {x, y, tier}<br>750 rows (75.0%)',
    );

    move(viz, 120);
    expect(filled(LIGHT.primaryFaded)).toHaveLength(1);
    expect(filled(LIGHT.accentHover)).toHaveLength(1);
    expect(lastDetail()).toBe(
      '<span class="stats-label">Category:</span> null<br>250 rows (25.0%)',
    );
    viz.destroy();
  });

  it('adds how many rows pass the filters', async () => {
    const viz = await mount(
      { total: 1000, non_null: 800, filtered_total: 400, filtered_non_null: 300 },
      { filters: [{ type: 'null', column: 'point' }] },
    );
    move(viz, 40);
    expect(lastDetail()).toBe(
      '<span class="stats-label">Category:</span> non-null · {x, y, tier}<br>' +
        '800 rows (80.0%) · 300 match',
    );
    viz.destroy();
  });

  it('escapes field names in the detail', async () => {
    const viz = await mount(
      { total: 10, non_null: 9 },
      { originalType: 'STRUCT("<img src=x onerror=alert(1)>" INTEGER, "a&b" VARCHAR)' },
    );
    move(viz, 40);
    const detail = lastDetail() as string;
    expect(detail).toContain('{&lt;img src=x onerror=alert(1)&gt;, a&amp;b}');
    expect(detail).not.toContain('<img');

    // Written as the stats slot writes it: no element from the data.
    const slot = document.createElement('div');
    slot.innerHTML = detail;
    expect(slot.querySelector('img')).toBeNull();
    expect(slot.textContent).toContain('{<img src=x onerror=alert(1)>, a&b}');
    viz.destroy();
  });

  it('clears the detail when the pointer leaves, or moves off the bar', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    move(viz, 40);
    expect(lastDetail()).toEqual(expect.stringContaining('stats-label'));

    move(viz, 40, BAR.y + BAR.height + 10); // over the outline
    expect(lastDetail()).toBeNull();
    expect(filled(LIGHT.primary)).toHaveLength(1);

    move(viz, 40);
    canvasOf(viz).dispatchEvent(new MouseEvent('mouseleave'));
    expect(lastDetail()).toBeNull();
    expect(filled(LIGHT.primary)).toHaveLength(1);
    viz.destroy();
  });

  it('posts the hovered segment’s new counts when a refetch lands', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    move(viz, 40);
    query.mockResolvedValue([
      { total: 1000, non_null: 750, filtered_total: 10, filtered_non_null: 7 },
    ]);
    await viz.updateFilters([{ type: 'not-null', column: 'point' }]);
    expect(lastDetail()).toBe(
      '<span class="stats-label">Category:</span> non-null · {x, y, tier}<br>' +
        '750 rows (75.0%) · 7 match',
    );
    viz.destroy();
  });
});

// =========================================
// No click, no brush
// =========================================

describe('NestedSummaryVisualization — clicks', () => {
  it('never adds a filter or a selection', async () => {
    const viz = await mount({ total: 1000, non_null: 750 });
    const canvas = canvasOf(viz);
    for (const x of [20, 120, 1, 149]) {
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: IN_BAR_Y }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: x + 30, clientY: IN_BAR_Y }));
      canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: IN_BAR_Y }));
      canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: x, clientY: IN_BAR_Y }));
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onBrushCommit).not.toHaveBeenCalled();
    expect(canvas.style.cursor).not.toBe('pointer');
    viz.destroy();
  });
});

// =========================================
// Data and stats
// =========================================

describe('NestedSummaryVisualization — data and stats', () => {
  it('reports nested stats: rows and nulls as filtered, and the type summary', async () => {
    const viz = await mount({ total: 1000, non_null: 990 });
    expect(viz.reportsDefaultStats).toBe(true);
    expect(onDefaultStatsChange).toHaveBeenLastCalledWith({
      kind: 'nested',
      totalRows: 1000,
      nonNullCount: 990,
      nullCount: 10,
      filteredTotalRows: null,
      outline: 'x double · y double · tier varchar',
    } satisfies NestedColumnStats);

    query.mockResolvedValue([
      { total: 1000, non_null: 990, filtered_total: 120, filtered_non_null: 118 },
    ]);
    await viz.updateFilters([{ type: 'range', column: 'n', min: 0, max: 1 }]);
    expect(onDefaultStatsChange).toHaveBeenLastCalledWith({
      kind: 'nested',
      totalRows: 1000,
      nonNullCount: 118,
      nullCount: 2,
      filteredTotalRows: 120,
      outline: 'x double · y double · tier varchar',
    } satisfies NestedColumnStats);
    viz.destroy();
  });

  it('counts with one query, with no GROUP BY and no cast of the values', async () => {
    const viz = await mount(
      { total: 1, non_null: 1, filtered_total: 1, filtered_non_null: 1 },
      { filters: [{ type: 'range', column: 'n', min: 1, max: 2 }] },
    );
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).not.toMatch(/GROUP BY/i);
    expect(sql).not.toMatch(/CAST\(/i);
    expect(sql).toMatch(/COUNT\("point"\) FILTER \(WHERE/);
    viz.destroy();
  });

  it('marks the canvas data-fetch-failed and reports a rejected query', async () => {
    query.mockRejectedValue(new Error('Out of Memory Error'));
    const viz = new NestedSummaryVisualization(container, column(), {
      tableName: 't',
      bridge: { query } as unknown as VisualizationOptions['bridge'],
      filters: [],
      onStatsChange,
      onDefaultStatsChange,
      onError,
    });
    await viz.waitForData();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'QUERY_RUNTIME' }), {
      columnName: 'point',
      stage: 'fetch',
    });
    expect(canvasOf(viz).hasAttribute('data-fetch-failed')).toBe(true);
    expect(onDefaultStatsChange).not.toHaveBeenCalled();
    expect(shapes).toEqual([]);
    expect(texts).toEqual([]);

    // A later fetch that lands clears the mark.
    query.mockResolvedValue([{ total: 5, non_null: 5 }]);
    await viz.fetchData();
    expect(canvasOf(viz).hasAttribute('data-fetch-failed')).toBe(false);
    expect(filled(LIGHT.primary)).toHaveLength(1);
    viz.destroy();
  });

  it('drops a fetch that lands after a newer one', async () => {
    let resolveFirst!: (rows: Counts[]) => void;
    query.mockImplementationOnce(
      () =>
        new Promise<Counts[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const viz = new NestedSummaryVisualization(container, column(), {
      tableName: 't',
      bridge: { query } as unknown as VisualizationOptions['bridge'],
      filters: [],
      onDefaultStatsChange,
    });
    const first = viz.waitForData();

    query.mockResolvedValueOnce([{ total: 10, non_null: 10 }]);
    await viz.fetchData();
    expect(onDefaultStatsChange).toHaveBeenCalledTimes(1);

    resolveFirst([{ total: 99, non_null: 1 }]);
    await first;
    expect(onDefaultStatsChange).toHaveBeenCalledTimes(1);
    expect(segments(viz)).toMatchObject([{ kind: 'value', width: 142 }]);
    viz.destroy();
  });

  it('draws nothing before its first fetch lands', () => {
    query.mockReturnValue(new Promise(() => {}));
    const viz = new NestedSummaryVisualization(container, column(), {
      tableName: 't',
      bridge: { query } as unknown as VisualizationOptions['bridge'],
      filters: [],
    });
    viz.render();
    expect(shapes).toEqual([]);
    expect(texts).toEqual([]);
    expect(canvasOf(viz).hasAttribute('data-fetch-failed')).toBe(false);
    viz.destroy();
  });

  it('stops after destroy', async () => {
    let resolve!: (rows: Counts[]) => void;
    query.mockReturnValue(new Promise<Counts[]>((r) => (resolve = r)));
    const viz = new NestedSummaryVisualization(container, column(), {
      tableName: 't',
      bridge: { query } as unknown as VisualizationOptions['bridge'],
      filters: [],
      onDefaultStatsChange,
      onStatsChange,
    });
    viz.destroy();
    resolve([{ total: 10, non_null: 10 }]);
    await viz.waitForData();
    expect(onDefaultStatsChange).not.toHaveBeenCalled();
    expect(onStatsChange).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
