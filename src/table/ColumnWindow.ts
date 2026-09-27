/**
 * ColumnWindow — which columns to mount for the body's horizontal view.
 *
 * Pure arithmetic over a {@link ColumnLayout}: given where the body is
 * scrolled and how wide its viewport is, the run of unpinned columns worth
 * having in the DOM. The pinned block is not part of it; it is always in view,
 * so it is always mounted.
 *
 * The archived branch computed this over prefix sums of its own. The layout
 * already has every column's offset, so what is left is two binary searches
 * and the hysteresis.
 *
 * @internal
 */

import type { ColumnLayout } from './ColumnLayout';

/** A run of indices into {@link ColumnLayout.columns}, `[start, end)`. */
export interface ColumnRange {
  readonly start: number;
  readonly end: number;
}

/** The body's horizontal view. */
export interface HorizontalView {
  readonly scrollLeft: number;
  /** The body's client width, without its vertical scrollbar. 0 until it is laid out. */
  readonly width: number;
}

/**
 * How far the mounted run reaches past each edge of the view, in viewports.
 * A scroll of up to a viewport has its columns already there.
 */
export const OVERSCAN_VIEWPORTS = 1;

/**
 * How close the view may come to an edge of the mounted run, in viewports,
 * before a scroll recomputes it. Half the overscan, so the run is recomputed,
 * and rows re-rendered, about once per half viewport scrolled, never per
 * column.
 */
export const RECOMPUTE_MARGIN_VIEWPORTS = OVERSCAN_VIEWPORTS / 2;

/**
 * The unpinned columns whose span meets `[from, to)`, in content coordinates.
 * A column that only touches the band at one edge does not meet it, and a
 * band with nothing in it gives an empty range where it would start.
 */
export function unpinnedColumnsMeeting(
  layout: ColumnLayout,
  from: number,
  to: number,
): ColumnRange {
  const n = layout.columns.length;
  // The first unpinned column whose right edge is past `from`.
  let lo = layout.pinnedCount;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (layout.leftAt(mid) + layout.widthAt(mid) > from) hi = mid;
    else lo = mid + 1;
  }
  const start = lo;
  if (to <= from) return { start, end: start };
  // From there, the first column whose left edge is at or past `to`.
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (layout.leftAt(mid) >= to) hi = mid;
    else lo = mid + 1;
  }
  return { start, end: lo };
}

/**
 * The run of unpinned columns to mount for `view`.
 *
 * - With no width to go on (not laid out, hidden, jsdom), every column.
 *   Nothing can say what is in view, and a body with no size renders no rows
 *   to put them in.
 * - Otherwise the columns meeting the view right of the pinned block, and a
 *   viewport's worth either side.
 * - Given `current`, the run mounted now over the same layout, it is kept for
 *   as long as it still covers the view and half a viewport either side, so
 *   that a scroll of a few columns changes nothing.
 *
 * @example
 * ```typescript
 * // 150px columns, a 600px view scrolled to 3,000: columns 16 to 27.
 * columnWindow(layout, { scrollLeft: 3000, width: 600 });
 * ```
 */
export function columnWindow(
  layout: ColumnLayout,
  view: HorizontalView,
  current?: ColumnRange,
): ColumnRange {
  if (!(view.width > 0)) return { start: layout.pinnedCount, end: layout.columns.length };

  const from = view.scrollLeft + layout.pinnedWidth;
  const to = view.scrollLeft + view.width;
  if (current) {
    const margin = view.width * RECOMPUTE_MARGIN_VIEWPORTS;
    const needed = unpinnedColumnsMeeting(layout, from - margin, to + margin);
    if (
      current.start >= layout.pinnedCount &&
      current.end <= layout.columns.length &&
      current.start <= needed.start &&
      current.end >= needed.end
    ) {
      return current;
    }
  }
  const overscan = view.width * OVERSCAN_VIEWPORTS;
  return unpinnedColumnsMeeting(layout, from - overscan, to + overscan);
}
