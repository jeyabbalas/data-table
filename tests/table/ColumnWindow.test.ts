/**
 * The window arithmetic on its own: which unpinned columns to mount for a
 * view, and when a scroll leaves them as they are.
 */
import { describe, expect, it } from 'vitest';
import { ColumnLayout } from '@/table/ColumnLayout';
import { columnWindow, unpinnedColumnsMeeting } from '@/table/ColumnWindow';

function layout(
  widths: number[],
  pinned: string[] = [],
): { layout: ColumnLayout; names: (range: { start: number; end: number }) => string } {
  const columns = widths.map((_, i) => `c${i}`);
  // Pinned columns lead the visible order, as the column actions keep them.
  const visible = [...pinned, ...columns.filter((c) => !pinned.includes(c))];
  const l = new ColumnLayout({
    visibleColumns: visible,
    pinnedColumns: pinned,
    columnWidths: new Map(columns.map((c, i) => [c, widths[i]!])),
    columnOrder: visible,
    schema: visible.map((name) => ({ name })),
  });
  return {
    layout: l,
    names: ({ start, end }) => l.columns.slice(start, end).join(' '),
  };
}

describe('unpinnedColumnsMeeting', () => {
  const { layout: l, names } = layout([100, 100, 100, 100, 100]);

  it('finds the columns a band meets, not the ones it only touches', () => {
    expect(names(unpinnedColumnsMeeting(l, 100, 300))).toBe('c1 c2');
    expect(names(unpinnedColumnsMeeting(l, 150, 250))).toBe('c1 c2');
    expect(names(unpinnedColumnsMeeting(l, 99, 301))).toBe('c0 c1 c2 c3');
  });

  it('clamps to the content, and is empty where a band holds nothing', () => {
    expect(names(unpinnedColumnsMeeting(l, -500, 50))).toBe('c0');
    expect(names(unpinnedColumnsMeeting(l, 450, 9000))).toBe('c4');
    expect(unpinnedColumnsMeeting(l, 600, 900)).toEqual({ start: 5, end: 5 });
    expect(unpinnedColumnsMeeting(l, 250, 250)).toEqual({ start: 2, end: 2 });
  });

  it('never returns a pinned column', () => {
    const pinned = layout([100, 100, 100, 100], ['c2']);
    expect(pinned.names(unpinnedColumnsMeeting(pinned.layout, 0, 250))).toBe('c0 c1');
  });

  it('handles columns of very different widths and zero widths', () => {
    const { layout: w, names: n } = layout([50, 0, 400, 0, 50]);
    // c0 0–50, c1 50–50, c2 50–450, c3 450–450, c4 450–500
    expect(n(unpinnedColumnsMeeting(w, 60, 100))).toBe('c2');
    expect(n(unpinnedColumnsMeeting(w, 0, 60))).toBe('c0 c1 c2');
  });
});

describe('columnWindow', () => {
  // Forty 150px columns: 6,000px of content.
  const { layout: l, names } = layout(Array.from({ length: 40 }, () => 150));

  it('mounts every column while the view has no width', () => {
    expect(columnWindow(l, { scrollLeft: 900, width: 0 })).toEqual({ start: 0, end: 40 });
  });

  it('reaches a viewport past each edge of the view', () => {
    // View 3,000–3,600; with 600 either side, 2,400–4,200: c16 … c27.
    expect(names(columnWindow(l, { scrollLeft: 3000, width: 600 }))).toBe(
      Array.from({ length: 12 }, (_, i) => `c${16 + i}`).join(' '),
    );
  });

  it('keeps the current run until the view is within half a viewport of its edge', () => {
    const current = columnWindow(l, { scrollLeft: 3000, width: 600 });
    // 300px on, the view needs up to 4,200: what the run already reaches.
    expect(columnWindow(l, { scrollLeft: 3300, width: 600 }, current)).toBe(current);
    // 301px on, it needs 4,201, so the run is recomputed around the view.
    const next = columnWindow(l, { scrollLeft: 3301, width: 600 }, current);
    expect(next).not.toBe(current);
    expect(next.start).toBeGreaterThan(current.start);
  });

  it('drops a current run that no longer fits the layout', () => {
    const { layout: short } = layout([150, 150, 150]);
    // Covers the view, but runs past the three columns there are.
    const stale = { start: 0, end: 30 };
    expect(columnWindow(short, { scrollLeft: 0, width: 300 }, stale)).toEqual({ start: 0, end: 3 });
  });

  it('measures the view from the right of the pinned block', () => {
    const { layout: p, names: n } = layout(
      Array.from({ length: 20 }, () => 100),
      ['c0', 'c1'],
    );
    // Pinned block 200px wide; a 400px view at 1,000 shows content
    // 1,200–1,400, and reaches 800–1,800 with the overscan.
    expect(n(columnWindow(p, { scrollLeft: 1000, width: 400 }))).toBe(
      'c8 c9 c10 c11 c12 c13 c14 c15 c16 c17',
    );
  });
});
