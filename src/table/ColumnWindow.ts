/**
 * ColumnWindow — which columns a body row has to render, and how wide the
 * spacers standing in for the rest must be.
 *
 * Row virtualization bounds the row axis; nothing bounded the column axis, so
 * a 1,000-column table put ~30,000 cells in the DOM regardless of how many a
 * user could see. This module is the arithmetic half of the fix: given the
 * horizontal scroll offset and the viewport width, it answers "render
 * `visibleColumns[start, end)`, put `leftSpacerPx` before them and
 * `rightSpacerPx` after them".
 *
 * Deliberately pure and DOM-free — it measures nothing and reads no element.
 * Two things make that possible:
 *
 *  - `.dt-cell` and `.dt-col-header` are `box-sizing: border-box`, so a
 *    column's configured width *is* the width it occupies and the box
 *    overhead is the constant `0`. It stays an input (`boxOverheadPx`) rather
 *    than being baked in, so the model can still be driven — and tested —
 *    against a host that changes it.
 *  - Declared widths are rounded to integers before they are summed. A
 *    fractional width is reachable (`setColumnWidth` does not round, and the
 *    mouse resize path passes a fractional `clientX` under page zoom), and a
 *    uniform residue multiplies by M in the header — M snapped boxes — and by
 *    1 in the body, which is one snapped spacer. At 150.3 px the residue is
 *    0.003125 px per column under Chrome's 1/64 px layout unit: invisible at
 *    50 columns, 3.1 px across the ~990 a left spacer covers at 1,000. Round
 *    the inputs, sum exactly, and never round the spacer itself.
 *
 * Not exported from `src/index.ts` — `TableBody` owns the only instance. The
 * {@link ColumnWindow} *type* is re-exported from `/advanced` because
 * `TableBody.getColumnWindow()` returns it.
 */
import { clampUnpinnedIndex } from './ColumnReorder';

/** Width a column occupies when `columnWidths` has no entry for it. */
export const DEFAULT_COLUMN_WIDTH = 150;

/**
 * Columns of overscan forced on each side, on top of the pixel overscan.
 *
 * The pixel term alone collapses to nothing when the viewport is narrow or
 * unmeasured (jsdom reports `clientWidth === 0`), which would leave a window
 * that re-renders on every scroll step. Ten columns is ~1,500 px at the
 * default width — roughly a viewport — so it is the binding term only where
 * the pixel term has stopped meaning anything.
 */
export const MIN_OVERSCAN_COLUMNS = 10;

/** Viewports of overscan per side. One is a full screen of scroll headroom. */
export const OVERSCAN_VIEWPORTS = 1;

/**
 * Horizontal box overhead per column, in px.
 *
 * Zero, and it points at a CSS rule rather than at an assumption:
 * `.dt-cell` / `.dt-col-header` declare `box-sizing: border-box`, so the
 * 0.75rem side padding and the 1px right border sit *inside* the declared
 * width. Measured against a real mount: `offsetWidth − parseFloat(style.width)`
 * is `0` for every sampled cell as shipped, and `25` for every one of them
 * with `content-box` forced.
 */
export const BOX_OVERHEAD_PX = 0;

/**
 * The set of body columns to render, plus the geometry of everything skipped.
 *
 * `[0, pinnedCount)` is always rendered — pinned columns are sticky and stay
 * on screen at any scroll offset — followed by the left spacer, then
 * `[start, end)`, then the right spacer. So a row's children are
 * `[P cells][left spacer][W cells][right spacer]`, and
 * `childIndex(absIdx) = absIdx < P ? absIdx : absIdx - start + P + 1`.
 */
export interface ColumnWindow {
  /** First windowed index into `visibleColumns`. Always `>= pinnedCount`. */
  start: number;
  /** One past the last windowed index. Always `>= start`, `<= visibleColumns.length`. */
  end: number;
  /** Leading run of pinned columns, force-rendered outside the window. */
  pinnedCount: number;
  /** Σ occupied widths of `[pinnedCount, start)` — the left spacer. */
  leftSpacerPx: number;
  /** Σ occupied widths of `[end, N)` — the right spacer. */
  rightSpacerPx: number;
  /** Σ occupied widths of `[0, pinnedCount)` — where unpinned content starts. */
  pinnedWidthPx: number;
  /** Σ occupied widths of `[0, N)` — the horizontal scroll extent. */
  totalWidthPx: number;
  /**
   * `true` when the pinned columns were **not** a leading run of
   * `visibleColumns` and `pinnedCount` fell back to "through the last pinned
   * column". Correct, merely less economical. Reachable through public API:
   * `showColumn` splices into `visibleColumns` via `computeRestoreIndex`
   * without clamping to the pinned prefix, so
   * `hideColumn('C') → toggleColumnPin('D') → showColumn('C')` can leave a
   * pinned column behind an unpinned one.
   */
  pinnedPrefixViolated: boolean;
}

/** Everything {@link ColumnWindowModel.compute} needs, all of it plain data. */
export interface ColumnWindowOptions {
  visibleColumns: readonly string[];
  columnWidths: ReadonlyMap<string, number>;
  pinnedColumns: readonly string[];
  /** `.dt-body-scroll.scrollLeft`. Negative values (rubber-band) clamp to 0. */
  scrollLeft: number;
  /** `.dt-body-scroll.clientWidth`. `0` in jsdom, where the column floor takes over. */
  viewportWidth: number;
  /** Defaults to {@link MIN_OVERSCAN_COLUMNS}. */
  minOverscanColumns?: number;
  /** Defaults to {@link OVERSCAN_VIEWPORTS}. */
  overscanViewports?: number;
  /** Defaults to {@link BOX_OVERHEAD_PX}. */
  boxOverheadPx?: number;
}

/**
 * The length of the leading run of pinned columns in `columns`.
 *
 * Delegates to `clampUnpinnedIndex`, which already computes exactly this to
 * keep a dragged unpinned column out of the pinned block — one definition,
 * three consumers.
 */
export function pinnedPrefixLength(
  columns: readonly string[],
  pinnedColumns: readonly string[],
): number {
  return clampUnpinnedIndex(0, columns, pinnedColumns);
}

/**
 * How many leading columns must be force-rendered because they are pinned.
 *
 * `toggleColumnPin` moves pinned columns to the front, so the pinned group is
 * normally the leading run of `visibleColumns` and `P` is that run's length.
 * When it is not — see {@link ColumnWindow.pinnedPrefixViolated} for the
 * public-API sequence that gets there — fall back to "through the last pinned
 * column", which is still correct and merely renders more than it has to.
 *
 * Exported because the body, the header's sticky offsets and the keyboard
 * navigator all have to agree on `P`; a second definition is how they drift.
 */
export function resolvePinnedCount(
  visibleColumns: readonly string[],
  pinnedColumns: readonly string[],
): { pinnedCount: number; violated: boolean } {
  if (pinnedColumns.length === 0) return { pinnedCount: 0, violated: false };
  const prefixLength = pinnedPrefixLength(visibleColumns, pinnedColumns);

  const pinned = new Set(pinnedColumns);
  let lastPinnedIndex = -1;
  for (let i = visibleColumns.length - 1; i >= 0; i--) {
    if (pinned.has(visibleColumns[i]!)) {
      lastPinnedIndex = i;
      break;
    }
  }
  // No pinned column is visible at all — every one of them is hidden.
  if (lastPinnedIndex < 0) return { pinnedCount: 0, violated: false };
  if (lastPinnedIndex + 1 === prefixLength) return { pinnedCount: prefixLength, violated: false };
  return { pinnedCount: lastPinnedIndex + 1, violated: true };
}

/**
 * The integer width a declared column width occupies.
 *
 * Rounded (see the module header) and guarded: `setColumnWidth` validates
 * nothing, and a restored session snapshot copies `columnWidths` in wholesale
 * (`serialization.ts`), so anything a host can put in a `Map` is reachable
 * without malice. Two families have to fall back to the default:
 *
 *  - **Non-finite.** A `NaN` or an `Infinity` in the middle of the list
 *    poisons every prefix sum after it, and the failure is **silent** —
 *    `width: NaNpx`, `flex: 0 0 NaNpx` and `setContentWidth(NaN)` are all
 *    rejected by CSSOM, so the element quietly keeps whatever width it had
 *    (for a pooled row, some other column's) while the model believes 150.
 *  - **Negative.** `Number.isFinite(-50)` is `true`, so a negative width used
 *    to sum straight into `prefix` — and a decreasing step there breaks the
 *    sorted-array precondition `lowerBound` / `upperBound` are only correct
 *    under, which makes the window boundaries arbitrary rather than merely
 *    wrong. This failure mode did not exist before the prefix sums did.
 *
 * `0` is **not** rejected: it keeps `prefix` non-decreasing, ties leave both
 * binary searches correct, and `width: 0px` is a value CSSOM accepts — so a
 * host that collapses a column to nothing gets what it asked for on both
 * sides. See `compute`'s note on zero-width columns and the visible-range
 * suite's case for it.
 *
 * Falling back to the default keeps one bad column bad instead of taking the
 * table's geometry with it.
 *
 * Exported because every site that writes a width to the DOM has to resolve
 * it exactly the way the prefix sums do. A header, a cell, and the spacer
 * standing in for their neighbours disagreeing about one column's width is
 * the failure this whole module exists to prevent.
 */
export function resolveColumnWidth(declared: number | undefined): number {
  return declared !== undefined && Number.isFinite(declared) && declared >= 0
    ? Math.round(declared)
    : DEFAULT_COLUMN_WIDTH;
}

/** Sticky placement for one pinned column. */
export interface PinnedOffset {
  /** `left` in px — Σ occupied widths of the pinned columns before it. */
  left: number;
  /** `z-index`, descending left to right so an earlier column paints on top. */
  zIndex: number;
}

/**
 * Sticky `left` / `z-index` for every pinned column, keyed by column name.
 *
 * Walks `visibleColumns[0, pinnedCount)` rather than `pinnedColumns`, and
 * that is a real fix: `hideColumn` never removes a column from
 * `pinnedColumns`, so a pinned-then-hidden column used to consume a slot in
 * the cumulative sum and push every later pinned column's `left`, and the
 * demarcation line, one column too far right. Header and body both did it, so
 * they agreed with each other and disagreed with the layout — which is why it
 * went unnoticed.
 *
 * It also *filters* that span by `pinnedColumns`, which matters only in the
 * {@link ColumnWindow.pinnedPrefixViolated} case. There `pinnedCount` is the
 * permissive "through the last pinned column", which is the right answer for
 * deciding what to **render** and the wrong one for deciding what to make
 * **sticky** — an unpinned column caught inside that span would freeze itself
 * to the viewport edge, and nothing the user did asked for that. Rendering
 * stays permissive; styling stays exact.
 *
 * Widths are rounded the same way the prefix sums round them, so a fractional
 * column width cannot make a sticky offset disagree with the cell it pins.
 */
export function pinnedOffsets(
  visibleColumns: readonly string[],
  columnWidths: ReadonlyMap<string, number>,
  pinnedCount: number,
  baseZ: number,
  pinnedColumns?: readonly string[],
): Map<string, PinnedOffset> {
  const offsets = new Map<string, PinnedOffset>();
  const pinned = pinnedColumns ? new Set(pinnedColumns) : null;
  let left = 0;
  for (let i = 0; i < pinnedCount && i < visibleColumns.length; i++) {
    const name = visibleColumns[i]!;
    const width = resolveColumnWidth(columnWidths.get(name));
    // An unpinned column inside the span still occupies its width — the
    // pinned columns after it sit that much further right — it just does not
    // become sticky itself.
    if (!pinned || pinned.has(name)) {
      offsets.set(name, { left, zIndex: baseZ + (pinnedCount - i) });
    }
    left += width;
  }
  return offsets;
}

/** First index `i` in `[0, n]` with `prefix[i] >= target`. */
function lowerBound(prefix: Float64Array, n: number, target: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (prefix[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index `i` in `[0, n]` with `prefix[i] > target`. */
function upperBound(prefix: Float64Array, n: number, target: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (prefix[mid]! <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Cached prefix sums over per-column occupied width, plus the window
 * computation that binary-searches them.
 *
 * `prefix[i]` is Σ occupied widths of `visibleColumns[0, i)`, so
 * `prefix[j] - prefix[i]` is the span of `[i, j)` in O(1). Rebuilt only when
 * the `visibleColumns` array identity, the `columnWidths` map identity, or
 * the box overhead changes — all three are replaced wholesale by the state
 * layer rather than mutated, so identity is a sound cache key.
 *
 * @example
 * ```typescript
 * const model = new ColumnWindowModel();
 * const win = model.compute({
 *   visibleColumns, columnWidths, pinnedColumns,
 *   scrollLeft: bodyScroll.scrollLeft,
 *   viewportWidth: bodyScroll.clientWidth,
 * });
 * // render visibleColumns[0, win.pinnedCount) and [win.start, win.end)
 * ```
 */
export class ColumnWindowModel {
  /** `prefix[i]` = Σ occupied widths of `[0, i)`; length `N + 1`. */
  private prefix = new Float64Array(1);
  private columnCount = 0;
  private cachedColumns: readonly string[] | null = null;
  private cachedWidths: ReadonlyMap<string, number> | null = null;
  private cachedOverhead = Number.NaN;

  /**
   * Rebuild the prefix sums if any input identity changed. O(N) on a miss,
   * a pointer comparison on a hit.
   *
   * Safe to call on every render pass and on every accessor — the hot paths
   * (`spanPx`, `columnLeftPx`) rely on it having been called first.
   */
  sync(
    visibleColumns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
    boxOverheadPx: number = BOX_OVERHEAD_PX,
  ): void {
    if (
      this.cachedColumns === visibleColumns &&
      this.cachedWidths === columnWidths &&
      this.cachedOverhead === boxOverheadPx
    ) {
      return;
    }
    const n = visibleColumns.length;
    if (this.prefix.length !== n + 1) this.prefix = new Float64Array(n + 1);
    let running = 0;
    this.prefix[0] = 0;
    for (let i = 0; i < n; i++) {
      // Round the declared width, then sum exactly — see the module header.
      running += resolveColumnWidth(columnWidths.get(visibleColumns[i]!));
      running += boxOverheadPx;
      this.prefix[i + 1] = running;
    }
    this.columnCount = n;
    this.cachedColumns = visibleColumns;
    this.cachedWidths = columnWidths;
    this.cachedOverhead = boxOverheadPx;
  }

  /** Drop the cache, e.g. when the owning body is torn down. */
  reset(): void {
    this.cachedColumns = null;
    this.cachedWidths = null;
    this.cachedOverhead = Number.NaN;
    this.columnCount = 0;
    this.prefix = new Float64Array(1);
  }

  /** Number of columns the cached prefix sums describe. */
  size(): number {
    return this.columnCount;
  }

  /** Σ occupied widths of `[from, to)`, with both bounds clamped. `0` if inverted. */
  spanPx(from: number, to: number): number {
    const n = this.columnCount;
    const a = Math.max(0, Math.min(n, from));
    const b = Math.max(0, Math.min(n, to));
    return b <= a ? 0 : this.prefix[b]! - this.prefix[a]!;
  }

  /** Left edge of column `index` in content coordinates. */
  columnLeftPx(index: number): number {
    return this.spanPx(0, index);
  }

  /** Occupied width of column `index`, or `0` when out of range. */
  columnWidthPx(index: number): number {
    return this.spanPx(index, index + 1);
  }

  /** Σ occupied widths of every visible column — the horizontal scroll extent. */
  totalWidthPx(): number {
    return this.spanPx(0, this.columnCount);
  }

  /**
   * The window to render at `scrollLeft`.
   *
   * A column intersects the viewport `[a, b)` iff `colLeft < b && colRight > a`
   * — a zero-width touch is *excluded*. At `scrollLeft = 3000` over 150 px
   * columns, `3600` lands exactly on column 24's left edge, so the visible
   * range ends at 24 and not 25.
   */
  compute(options: ColumnWindowOptions): ColumnWindow {
    const {
      visibleColumns,
      columnWidths,
      pinnedColumns,
      minOverscanColumns = MIN_OVERSCAN_COLUMNS,
      overscanViewports = OVERSCAN_VIEWPORTS,
      boxOverheadPx = BOX_OVERHEAD_PX,
    } = options;

    this.sync(visibleColumns, columnWidths, boxOverheadPx);
    const n = this.columnCount;

    const { pinnedCount, violated } = resolvePinnedCount(visibleColumns, pinnedColumns);

    if (n === 0) {
      return {
        start: 0,
        end: 0,
        pinnedCount: 0,
        leftSpacerPx: 0,
        rightSpacerPx: 0,
        pinnedWidthPx: 0,
        totalWidthPx: 0,
        pinnedPrefixViolated: violated,
      };
    }

    const scrollLeft = Math.max(0, options.scrollLeft || 0);
    const viewportWidth = Math.max(0, options.viewportWidth || 0);
    const pad = viewportWidth * Math.max(0, overscanViewports);

    // Pixel band, overscanned. `a` is where the rendered run may start, `b`
    // where it must have ended.
    const a = Math.max(0, scrollLeft - pad);
    const b = scrollLeft + viewportWidth + pad;

    // First column whose right edge is past `x`, or `n` when the content ends
    // at or before it. The `>= total` branch is not an optimization: the
    // binary search is bounded at `n`, so past-the-end it would answer `n - 1`
    // — "the last column" — for a band that intersects nothing.
    const total = this.prefix[n]!;
    const firstColumnEndingAfter = (x: number): number =>
      x >= total ? n : Math.max(0, upperBound(this.prefix, n, x) - 1);

    // First column whose left edge is at or past `b`.
    let start = firstColumnEndingAfter(a);
    let end = lowerBound(this.prefix, n, b);

    // Column floor, applied to the *un-overscanned* visible range so a wide
    // viewport does not get a second helping of overscan.
    const visStart = firstColumnEndingAfter(scrollLeft);
    const visEnd = lowerBound(this.prefix, n, scrollLeft + viewportWidth);
    const floor = Math.max(0, minOverscanColumns);
    start = Math.min(start, visStart - floor);
    end = Math.max(end, visEnd + floor);

    start = Math.max(pinnedCount, Math.min(n, start));
    end = Math.max(start, Math.min(n, end));

    return {
      start,
      end,
      pinnedCount,
      leftSpacerPx: this.spanPx(pinnedCount, start),
      rightSpacerPx: this.spanPx(end, n),
      pinnedWidthPx: this.spanPx(0, pinnedCount),
      totalWidthPx: this.spanPx(0, n),
      pinnedPrefixViolated: violated,
    };
  }
}
