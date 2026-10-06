/**
 * NestedSummaryVisualization - the column-header chart of a nested column
 *
 * A LIST, ARRAY, STRUCT, MAP, UNION or VARIANT column has no values a
 * histogram can bin, and grouping them by value as the value counts do is
 * slow: 18–21 seconds for a `FLOAT[768]` embedding column of 200k rows, with
 * the worker, and so the grid, frozen meanwhile. This chart reads two counts
 * instead, in one query with no GROUP BY and no cast of the values (see
 * `NestedSummaryData`), and draws:
 *
 * - an 18 px bar of the column's non-null share (`--dt-primary`, labelled
 *   with its percentage when the segment is at least 30 px wide) and its
 *   null share (`--dt-accent`, labelled `∅`), sized by the unfiltered counts,
 *   each at least 3 px wide; an all-null column is one full accent bar;
 * - with filters on, each segment as a faded ghost with the share of its
 *   rows passing them drawn solid over it, as the value counts draw theirs;
 * - under the bar, the column's type outline in `--dt-text-secondary`:
 *   `{x, y, tier}`, `[integer]`, `{varchar → integer}`.
 *
 * Hovering a segment fades the other one and puts its counts in the stats
 * slot. There is no click-to-filter, brush or keyboard selection: a nested
 * column is filtered from its filter panel. Before its first fetch lands the
 * chart draws nothing, a fetch that fails marks the canvas
 * `data-fetch-failed`, and an empty relation draws "No data", as the other
 * charts do.
 *
 * The default `VisualizationRegistry` picks it for `'nested'` columns.
 *
 * @see ValueCounts for the stacked bar it draws as
 * @see VisualizationRegistry for registering a replacement
 */

import { parseDuckDBType } from '../../core/duckdbType';
import { DataTableError, QueryError } from '../../core/errors';
import type { ColumnSchema } from '../../core/types';
import { typeOutline } from '../../nested/typeOutline';
import type { NestedColumnStats } from '../../statistics/ColumnStatsTypes';
import { BaseVisualization } from '../BaseVisualization';
import type { VisualizationOptions } from '../BaseVisualization';
import { inkFor, resolveColor, resolveScope } from '../palette';
import { drawSegmentRect, escapeHTML, findSlotAtX, formatPercent, truncateText } from '../utils';
import { fetchNestedSummaryData } from './NestedSummaryData';
import type { NestedSummaryData } from './NestedSummaryData';

// =========================================
// Palette
// =========================================

interface NestedSummaryColors {
  valueFill: string;
  valueHover: string;
  valueFaded: string;
  valueGhost: string;
  nullFill: string;
  nullHover: string;
  nullFaded: string;
  nullGhost: string;
  segmentBorder: string;
  /** The chart slot's background, which the canvas is drawn over. */
  slot: string;
  /** Labels on a faded or ghost fill, which are tints of the slot's background. */
  text: string;
  /** The type outline and the empty state. */
  secondaryText: string;
}

/**
 * Resolve the palette from CSS custom properties. Called once per render(),
 * as the other charts do, so host-app `--dt-*` overrides and dark-mode flips
 * show on the next paint. The faded and ghost fills are the ones the value
 * counts use.
 */
function getNestedSummaryColors(canvas: HTMLCanvasElement): NestedSummaryColors {
  const scope = resolveScope(canvas);
  const r = (cssVar: string, fallback: string) => resolveColor(scope, cssVar, fallback);
  return {
    valueFill: r('--dt-primary', '#2563eb'),
    valueHover: r('--dt-primary-hover', '#1d4ed8'),
    valueFaded: r('--dt-primary-alpha-30', 'rgba(37, 99, 235, 0.3)'),
    valueGhost: r('--dt-primary-alpha-50', 'rgba(37, 99, 235, 0.5)'),
    nullFill: r('--dt-accent', '#f59e0b'),
    nullHover: r('--dt-accent-hover', '#d97706'),
    nullFaded: r('--dt-accent-soft', 'rgba(245, 158, 11, 0.3)'),
    nullGhost: r('--dt-accent-soft', 'rgba(245, 158, 11, 0.3)'),
    segmentBorder: r('--dt-border', '#e5e7eb'),
    slot: r('--dt-bg-secondary', '#f9fafb'),
    text: r('--dt-text', '#111827'),
    secondaryText: r('--dt-text-secondary', '#374151'),
  };
}

/** Typography settings, as the value counts' segment labels and the axes. */
const FONTS = {
  label: '500 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  outline: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
const PADDING = {
  top: 3,
  right: 4,
  left: 4,
};

/** Spacing and sizing constants */
const LAYOUT = {
  barHeight: 18,
  barRadius: 2,
  segmentBorderWidth: 1, // Border between the two segments
  minSegmentWidth: 3, // A segment with rows is never thinner
  minPercentWidth: 30, // The non-null segment shows its percentage from this width
  labelPadding: 8, // Room around a label inside its segment (4px each side)
  outlineGap: 6, // Between the bar and the outline
  outlineLineHeight: 12,
  hoverSlack: 3, // Pixels above and below the bar that still hover it
};

/** The null segment's label, as the value counts' and histograms'. */
const NULL_SYMBOL = '∅';

// =========================================
// Segments
// =========================================

/** One segment of the bar: the column's non-null values, or its nulls. */
interface Segment {
  kind: 'value' | 'null';
  /** Its rows, filters aside. Sizes it. */
  count: number;
  /** Of them, rows passing the filters (`count` without filters). */
  matched: number;
  x: number;
  width: number;
}

type SegmentState = 'normal' | 'hover' | 'faded';

// =========================================
// NestedSummaryVisualization Class
// =========================================

/**
 * The header chart the default registry gives a nested column (`'nested'`:
 * LIST, ARRAY, STRUCT, MAP, UNION, VARIANT): a bar of its non-null and null
 * shares with the active filters' share drawn solid over each, and its type
 * outline. Built from one cheap count query; hover shows a segment's counts
 * in the stats slot; clicking does nothing.
 *
 * Only instantiate it directly when composing a custom visualization
 * pipeline, or to give it a column type of your own choosing.
 *
 * @example
 * ```ts
 * import { VisualizationRegistry, createDataTable } from '@jeyabbalas/data-table';
 * import { NestedSummaryVisualization } from '@jeyabbalas/data-table/advanced';
 *
 * // Give text columns (JSON ones included) the cheap summary bar instead of
 * // value counts, which group every value.
 * const visualizationRegistry = new VisualizationRegistry();
 * visualizationRegistry.register({
 *   name: 'text-summary',
 *   isApplicable: (type) => type === 'string',
 *   constructor: NestedSummaryVisualization,
 *   priority: 10,
 * });
 * await createDataTable({ container, source, visualizationRegistry });
 * ```
 */
export class NestedSummaryVisualization extends BaseVisualization {
  /** The summary reports its stats each time a fetch lands. */
  override readonly reportsDefaultStats: boolean = true;

  private data: NestedSummaryData | null = null;

  /**
   * Whether the latest fetch to settle failed. Read only while there is no
   * data, which a fetch that settles leaves only by failing.
   */
  private fetchFailed = false;

  // Fetch sequence counter for stale result protection
  private fetchSequence = 0;

  /** Index into `segmentPositions` of the segment under the pointer. */
  private hoveredSegment: number | null = null;

  /** The drawn segments, left to right (computed on render). */
  private segmentPositions: Segment[] = [];
  private barArea = { x: 0, y: 0, width: 0, height: 0 };

  // Palette resolved from CSS custom properties at the top of each render().
  private colors!: NestedSummaryColors;

  /** The type outline under the bar: `{x, y, tier}`. */
  private readonly outline: string;
  /** The type summary the stats line shows: `x double · y double · tier varchar`. */
  private readonly summary: string;

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    const type = parseDuckDBType(column.originalType ?? '');
    this.outline = typeOutline(type, 'outline');
    this.summary = typeOutline(type, 'summary');

    // Fetch data immediately and store the promise
    this.dataPromise = this.fetchData();
  }

  // =========================================
  // Data Fetching
  // =========================================

  /**
   * Count the column's rows and non-null values, filtered and not, in one
   * query. The latest fetch wins: one that settles after a newer one started
   * is dropped.
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    const seq = ++this.fetchSequence;

    try {
      const data = await fetchNestedSummaryData(
        this.options.tableName,
        this.column.name,
        this.options.filters,
        this.options.bridge,
      );
      if (seq !== this.fetchSequence || this.destroyed) return;
      this.data = data;
      this.fetchFailed = false;
    } catch (error) {
      if (seq !== this.fetchSequence || this.destroyed) return;
      const typed =
        error instanceof DataTableError
          ? error
          : new QueryError(error instanceof Error ? error.message : String(error), {
              code: 'QUERY_RUNTIME',
              cause: error,
            });
      this.options.onError?.(typed, {
        columnName: this.column.name,
        stage: 'fetch',
      });
      // No segments are drawn now, and so none is hovered.
      this.data = null;
      this.fetchFailed = true;
      this.hoveredSegment = null;
    }

    this.emitDefaultStats();
    this.render();
    // The hovered segment's detail with the new counts, or none.
    this.emitDetail();
  }

  /**
   * Emit the column's stats: rows and nulls as the filters leave them, and
   * the type summary for line 2.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const { total, nonNullCount, filtered } = this.data;
    const shown = filtered ?? { total, nonNullCount };
    const stats: NestedColumnStats = {
      kind: 'nested',
      totalRows: total,
      nonNullCount: shown.nonNullCount,
      nullCount: shown.total - shown.nonNullCount,
      filteredTotalRows: filtered ? filtered.total : null,
      outline: this.summary,
    };
    this.options.onDefaultStatsChange(stats);
  }

  // =========================================
  // Rendering
  // =========================================

  /**
   * Main render function - orchestrates all drawing
   */
  render(): void {
    if (this.destroyed) return;
    // Tells a chart whose fetch failed from one whose first fetch is still in
    // flight, both of which draw nothing. The stats slot says it in text.
    this.canvas.toggleAttribute('data-fetch-failed', !this.data && this.fetchFailed);

    this.clear();

    // Resolve palette fresh so host-app --dt-* overrides and dark-mode
    // flips propagate on the next render cycle.
    this.colors = getNestedSummaryColors(this.canvas);

    if (!this.data) {
      this.segmentPositions = [];
      return;
    }

    if (this.data.total === 0) {
      this.segmentPositions = [];
      this.hoveredSegment = null;
      this.drawEmptyState();
      return;
    }

    this.calculateLayout();
    this.drawSegments();
    this.drawOutline();
  }

  /**
   * Place the bar, centred with the outline under it, and its segments:
   * non-null first, then null, sized by the unfiltered counts.
   */
  private calculateLayout(): void {
    const data = this.data!;
    const width = Math.max(0, this.width - PADDING.left - PADDING.right);
    const block = LAYOUT.barHeight + LAYOUT.outlineGap + LAYOUT.outlineLineHeight;
    const y = Math.max(PADDING.top, Math.floor((this.height - block) / 2));
    this.barArea = { x: PADDING.left, y, width, height: LAYOUT.barHeight };

    const nullCount = data.total - data.nonNullCount;
    const filtered = data.filtered;
    const parts: Omit<Segment, 'x' | 'width'>[] = [];
    if (data.nonNullCount > 0) {
      parts.push({
        kind: 'value',
        count: data.nonNullCount,
        matched: filtered ? filtered.nonNullCount : data.nonNullCount,
      });
    }
    if (nullCount > 0) {
      parts.push({
        kind: 'null',
        count: nullCount,
        matched: filtered ? filtered.total - filtered.nonNullCount : nullCount,
      });
    }

    if (parts.length === 2) {
      // Whole pixels, for crisp edges; neither segment thinner than the minimum.
      const available = Math.max(0, width - LAYOUT.segmentBorderWidth);
      const min = LAYOUT.minSegmentWidth;
      const ideal = Math.round((available * data.nonNullCount) / data.total);
      const valueWidth = Math.min(Math.max(ideal, min), Math.max(min, available - min));
      this.segmentPositions = [
        { ...parts[0]!, x: PADDING.left, width: valueWidth },
        {
          ...parts[1]!,
          x: PADDING.left + valueWidth + LAYOUT.segmentBorderWidth,
          width: Math.max(0, available - valueWidth),
        },
      ];
    } else {
      this.segmentPositions = parts.map((part) => ({ ...part, x: PADDING.left, width }));
    }

    if (this.hoveredSegment !== null && this.hoveredSegment >= this.segmentPositions.length) {
      this.hoveredSegment = null;
    }
  }

  /**
   * Draw both segments. With filters on, each is a faded ghost of its full
   * width with the share of its rows that pass them drawn solid over it, as
   * the value counts draw theirs.
   */
  private drawSegments(): void {
    const ctx = this.ctx;
    const crossfilter = this.data!.filtered !== null;
    const { y, height } = this.barArea;
    const segments = this.segmentPositions;

    segments.forEach((segment, i) => {
      const isFirst = i === 0;
      const isLast = i === segments.length - 1;
      const state: SegmentState =
        this.hoveredSegment === null ? 'normal' : this.hoveredSegment === i ? 'hover' : 'faded';
      const fill = this.fillOf(segment.kind, state);

      // Where the solid fill ends: the whole segment, or with filters the
      // share of its rows passing them.
      let solidTo = segment.x + segment.width;
      if (crossfilter) {
        const ghost = segment.kind === 'value' ? this.colors.valueGhost : this.colors.nullGhost;
        drawSegmentRect(
          ctx,
          segment.x,
          y,
          segment.width,
          height,
          ghost,
          isFirst,
          isLast,
          LAYOUT.barRadius,
        );
        const share = segment.count > 0 ? Math.min(segment.matched / segment.count, 1) : 0;
        solidTo = segment.x + segment.width * share;
        if (share > 0) {
          drawSegmentRect(
            ctx,
            segment.x,
            y,
            segment.width * share,
            height,
            fill,
            isFirst,
            share >= 1 && isLast,
            LAYOUT.barRadius,
          );
        }
      } else {
        drawSegmentRect(
          ctx,
          segment.x,
          y,
          segment.width,
          height,
          fill,
          isFirst,
          isLast,
          LAYOUT.barRadius,
        );
      }

      // Border between the segments
      if (!isLast) {
        ctx.strokeStyle = this.colors.segmentBorder;
        ctx.lineWidth = LAYOUT.segmentBorderWidth;
        ctx.beginPath();
        ctx.moveTo(segment.x + segment.width + 0.5, y);
        ctx.lineTo(segment.x + segment.width + 0.5, y + height);
        ctx.stroke();
      }

      this.drawSegmentLabel(segment, state, solidTo);
    });
  }

  /** A segment's fill: hovered > faded (another one is hovered) > normal. */
  private fillOf(kind: Segment['kind'], state: SegmentState): string {
    const c = this.colors;
    if (kind === 'value') {
      return state === 'hover' ? c.valueHover : state === 'faded' ? c.valueFaded : c.valueFill;
    }
    return state === 'hover' ? c.nullHover : state === 'faded' ? c.nullFaded : c.nullFill;
  }

  /**
   * Label a segment, when the label fits: the non-null segment with its
   * share of the rows ("99%") from 30 px wide, the null one with `∅`. The
   * ink is for the fill under the label's middle: one that clears 4.5:1 on a
   * solid fill ({@link inkFor}), and the theme's text color on a faded or
   * ghost one, which are tints of the slot's background. A host's solid fill
   * can be translucent too, and then it reads as painted over the slot, and
   * with filters on over the segment's ghost.
   */
  private drawSegmentLabel(segment: Segment, state: SegmentState, solidTo: number): void {
    const ctx = this.ctx;
    let text: string;
    if (segment.kind === 'value') {
      if (segment.width < LAYOUT.minPercentWidth) return;
      text = this.shareText(segment.count);
    } else {
      text = NULL_SYMBOL;
    }

    ctx.font = FONTS.label;
    const room = segment.width - LAYOUT.labelPadding;
    if (room <= 0 || ctx.measureText(text).width > room) return;

    const middle = segment.x + segment.width / 2;
    const onSolid = state !== 'faded' && middle <= solidTo;
    if (onSolid) {
      const fill = this.fillOf(segment.kind, state);
      // Under the solid fill, bottom up: the slot, and with filters on the
      // segment's ghost, as drawSegments paints them.
      const ghost = segment.kind === 'value' ? this.colors.valueGhost : this.colors.nullGhost;
      const under = this.data!.filtered ? [this.colors.slot, ghost] : [this.colors.slot];
      // A fill inkFor cannot read keeps the value counts' inks: white on
      // the primary, the text color on the accent.
      ctx.fillStyle = inkFor(fill, {
        backdrop: under,
        fallback: segment.kind === 'value' ? '#ffffff' : this.colors.text,
      });
    } else {
      ctx.fillStyle = this.colors.text;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, middle, this.barArea.y + this.barArea.height / 2);
  }

  /**
   * A share of the rows as a whole percentage, never 0% for a segment with
   * rows nor 100% for one without all of them.
   */
  private shareText(count: number): string {
    const total = this.data!.total;
    let percent = Math.round((count / total) * 100);
    if (count < total) percent = Math.min(percent, 99);
    if (count > 0) percent = Math.max(percent, 1);
    return (percent / 100).toLocaleString(undefined, { style: 'percent' });
  }

  /** Draw the type outline under the bar, cut to its width. */
  private drawOutline(): void {
    if (!this.outline) return;
    const ctx = this.ctx;
    ctx.font = FONTS.outline;
    const text = truncateText(ctx, this.outline, this.barArea.width);
    if (!text) return;
    ctx.fillStyle = this.colors.secondaryText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      text,
      this.barArea.x + this.barArea.width / 2,
      this.barArea.y + LAYOUT.barHeight + LAYOUT.outlineGap + LAYOUT.outlineLineHeight / 2,
    );
  }

  /**
   * Draw empty state when no data available
   */
  private drawEmptyState(): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.colors.secondaryText;
    ctx.font = FONTS.outline;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', this.width / 2, this.height / 2);
  }

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Hover a segment: highlight it, fade the other one, and show its counts
   * in the stats slot.
   */
  protected handleMouseMove(x: number, y: number): void {
    if (!this.data) return;

    const previous = this.hoveredSegment;
    this.hoveredSegment = null;
    const { y: top, height } = this.barArea;
    if (y >= top - LAYOUT.hoverSlack && y <= top + height + LAYOUT.hoverSlack) {
      // The border between the segments belongs to the nearer one.
      this.hoveredSegment = findSlotAtX(
        this.segmentPositions,
        x,
        this.barArea.x,
        this.barArea.x + this.barArea.width,
      );
    }

    if (this.hoveredSegment === previous) return;
    this.render();
    this.emitDetail();
  }

  /**
   * Handle mouse leave - clear hover states
   */
  protected handleMouseLeave(): void {
    if (this.hoveredSegment === null) return;
    this.hoveredSegment = null;
    this.render();
    this.emitDetail();
  }

  /**
   * Put the hovered segment's detail in the stats slot, or clear it: what
   * it is (non-null values, with the type outline, or nulls), its rows out
   * of all of them, and with filters on, how many pass them. The outline is
   * escaped: field names come from the data file, and the slot is HTML.
   */
  private emitDetail(): void {
    const segment =
      this.hoveredSegment === null ? undefined : this.segmentPositions[this.hoveredSegment];
    if (!this.data || !segment) {
      this.options.onStatsChange?.(null);
      return;
    }

    const s = this.statsMessages;
    const name =
      segment.kind === 'value'
        ? this.outline
          ? `${s.nonNullCategory}${s.separator}${escapeHTML(this.outline)}`
          : s.nonNullCategory
        : s.nullBinLabel;
    let counts = s.selectionRowCount(
      segment.count,
      formatPercent(this.data.total > 0 ? segment.count / this.data.total : 0),
    );
    if (this.data.filtered) {
      counts += `${s.separator}${s.matchCount(segment.matched)}`;
    }
    this.options.onStatsChange?.(
      `<span class="stats-label">${s.categoryLabel}</span> ${name}<br>${counts}`,
    );
  }

  /** Clicking does nothing: a nested column is filtered from its filter panel. */
  protected handleClick(): void {
    // No click-to-filter: the segments are "has a value" and "is null", which
    // the filter panel's null toggle already sets.
  }

  /** No brush on the summary bar. */
  protected handleMouseDown(): void {
    // Nothing to drag.
  }

  /** No brush on the summary bar. */
  protected handleMouseUp(): void {
    // Nothing to drag.
  }

  /** No keyboard selection on the summary bar. */
  protected handleKeyDown(): void {
    // Nothing to select.
  }
}
