/**
 * ValueCounts - Canvas-based stacked bar visualization for categorical columns
 *
 * Renders an elegant stacked horizontal bar in column headers with:
 * - Proportional segment widths based on category counts
 * - Consistent blue coloring (matching Histogram bars)
 * - Light borders between segments for clear demarcation
 * - Null segment integrated as amber category (labeled with ∅)
 * - Labels inside segments when space permits
 * - Hover highlighting and stats display
 * - Click-to-select behavior
 * - Responsive sizing
 */

import { BaseVisualization } from '../BaseVisualization';
import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import type { CategoricalColumnStats } from '../../statistics/ColumnStatsTypes';
import { fetchValueCountsData, fetchAlignedValueCountsData } from './ValueCountsData';
import type { ValueCountsData } from './ValueCountsData';
import { formatCount, formatPercent, truncateText, escapeHTML } from '../utils';

// =========================================
// Constants
// =========================================

/** Color palette for visualization elements - consistent with Histogram */
const COLORS = {
  // Category bars - consistent with Histogram
  barFill: '#3b82f6', // Blue-500 (same as Histogram)
  barHover: '#2563eb', // Blue-600 (hover state)
  barFaded: '#93c5fd', // Blue-300 (when other is hovered)

  // "Other" segment - neutral gray
  otherFill: '#94a3b8', // Slate-400
  otherHover: '#64748b', // Slate-500
  otherFaded: '#cbd5e1', // Slate-300

  // Null segment - amber (integrated as category)
  nullFill: '#f59e0b', // Amber-500
  nullHover: '#d97706', // Amber-600
  nullFaded: '#fcd34d', // Amber-300

  // Crossfilter ghost segments (unfilled portion).
  // 50% opacity (vs 25% in Histogram) so white segment labels remain legible.
  barFadedCrossfilter: 'rgba(59, 130, 246, 0.5)',
  otherFadedCrossfilter: 'rgba(148, 163, 184, 0.5)',
  nullFadedCrossfilter: 'rgba(245, 158, 11, 0.5)',

  // Segment borders for demarcation
  segmentBorder: '#e2e8f0', // Slate-200 (light border)

  // Text colors
  labelText: '#1e293b', // Slate-800 (dark text for light backgrounds)
  labelTextLight: '#ffffff', // White (for dark backgrounds)
  axisText: '#64748b', // Slate-500

  // Selection indicator
  selectionIndicator: '#2563eb', // Blue-600
  nullSelectionIndicator: '#d97706', // Amber-600
};

/** Typography settings */
const FONTS = {
  axis: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  label: '500 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
const PADDING = {
  top: 3,
  right: 4,
  bottom: 22, // Space for selection indicator
  left: 4,
};

/** Spacing and sizing constants */
const LAYOUT = {
  segmentBorderWidth: 1, // Border width between segments
  barRadius: 2, // Rounded corner radius (ends only)
  minSegmentWidth: 3, // Minimum visible segment width
  selectionIndicatorHeight: 2, // Height of selection indicator line
  selectionIndicatorGap: 2, // Gap between bar and indicator
  labelPadding: 8, // Padding inside segment for label (4px each side)
};

/** Maximum categories before "Other" aggregation */
const MAX_CATEGORIES = 10;

/** Stable value key for "All unique" segments (avoids count-dependent mismatch in crossfilter) */
const ALL_UNIQUE_VALUE_KEY = 'All unique';

// =========================================
// Utility Functions
// =========================================


// =========================================
// Extended Segment Interface
// =========================================

/**
 * Extended segment for rendering that includes null as a segment
 */
interface RenderSegment {
  value: string;
  count: number;
  isOther: boolean;
  isNull: boolean;
  isAllUnique?: boolean;
  otherCount?: number;
}

// =========================================
// ValueCounts Class
// =========================================

export class ValueCounts extends BaseVisualization {
  // Data
  private data: ValueCountsData | null = null;
  private backgroundData: ValueCountsData | null = null;

  // Fetch sequence counter for stale result protection
  private fetchSequence = 0;

  // Promise for initial data load (used by waitForData)
  private dataPromise: Promise<void>;

  // Interaction state - index into renderSegments array
  private hoveredSegment: number | null = null;

  // Selection state (supports multi-select with Ctrl/Cmd+click)
  private selectedSegments: Set<number> = new Set();

  // Double-click detection for clearing selection
  private lastClickTime = 0;
  private lastClickX = 0;
  private lastClickY = 0;
  private readonly DOUBLE_CLICK_THRESHOLD = 300; // ms
  private readonly DOUBLE_CLICK_DISTANCE = 10; // pixels

  // Computed layout (updated on render)
  private barArea = { x: 0, y: 0, width: 0, height: 0 };
  private segmentPositions: Array<{ x: number; width: number; index: number }> = [];

  // Combined segments including null for rendering
  private renderSegments: RenderSegment[] = [];

  // Flag: sync visual state from filter on next render (after buildRenderSegments)
  private pendingFilterSync = false;

  // Background segments for crossfilter rendering
  private backgroundSegments: RenderSegment[] = [];

  // Top N category values for exclusion filter (used when clicking "Other")
  private topCategoryValues: string[] = [];

  // Cached initial (unfiltered) category order and counts for stable crossfilter rendering
  private initialCategoryOrder: string[] | null = null;
  private initialHasOther: boolean = false;
  private initialSegmentCounts: Map<string, number> | null = null;

  /** Cached initial (unfiltered) data for ghost background */
  private initialData: ValueCountsData | null = null;

  constructor(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ) {
    super(container, column, options);

    // Fetch data immediately and store the promise
    this.dataPromise = this.fetchData();
  }

  // =========================================
  // Data Fetching
  // =========================================

  /**
   * Fetch value counts data from DuckDB.
   *
   * Two-branch crossfilter pattern:
   * A) No filters: simple fetch, cache as initialData
   * B) Any filter active: ghost = initialData, foreground = allFilters aligned to initial order
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    const seq = ++this.fetchSequence;

    // Only reset selection on initial load, not on filter updates
    if (!this.isFilterUpdate) {
      this.selectedSegments.clear();
    }

    try {
      const allFilters = this.options.filters;
      const hasAnyFilter = allFilters.length > 0;

      if (hasAnyFilter) {
        // Ensure initial data is cached
        if (this.initialCategoryOrder === null) {
          const unfilteredData = await fetchValueCountsData(
            this.options.tableName, this.column.name, [], this.options.bridge, MAX_CATEGORIES
          );
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.initialCategoryOrder = unfilteredData.segments.filter(s => !s.isOther).map(s => s.value);
          this.initialHasOther = unfilteredData.segments.some(s => s.isOther);
          this.initialSegmentCounts = new Map();
          for (const seg of unfilteredData.segments) {
            this.initialSegmentCounts.set(seg.isOther ? 'Other' : seg.value, seg.count);
          }
          if (unfilteredData.nullCount > 0) {
            this.initialSegmentCounts.set('\u2205', unfilteredData.nullCount);
          }
          this.initialData = unfilteredData;
        }

        // Fetch foreground aligned to initial order
        const fgData = await fetchAlignedValueCountsData(
          this.options.tableName, this.column.name, this.initialCategoryOrder, this.initialHasOther, allFilters, this.options.bridge
        );
        if (seq !== this.fetchSequence || this.destroyed) return;

        this.data = fgData;
        // Any filter active → ghost = initial data
        this.backgroundData = this.initialData;
      } else {
        // Branch A: no filters → simple fetch, cache initial
        this.data = await fetchValueCountsData(
          this.options.tableName, this.column.name, allFilters, this.options.bridge, MAX_CATEGORIES
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;

        // Cache initial order and counts on first unfiltered fetch
        if (this.initialCategoryOrder === null) {
          this.initialCategoryOrder = this.data.segments.filter(s => !s.isOther).map(s => s.value);
          this.initialHasOther = this.data.segments.some(s => s.isOther);
          this.initialSegmentCounts = new Map();
          for (const seg of this.data.segments) {
            this.initialSegmentCounts.set(seg.isOther ? 'Other' : seg.value, seg.count);
          }
          if (this.data.nullCount > 0) {
            this.initialSegmentCounts.set('\u2205', this.data.nullCount);
          }
        }
        this.initialData = this.data;
      }
    } catch (error) {
      if (seq !== this.fetchSequence) return;
      console.error(`[ValueCounts] Failed to fetch data for ${this.column.name}:`, error);
      this.data = null;
      this.backgroundData = null;
    }

    // Emit column stats for default stats display
    this.emitDefaultStats();

    // Flag that the upcoming render should sync visual state from filter
    // (must happen after buildRenderSegments() inside render)
    this.pendingFilterSync = this.isFilterUpdate;

    this.render();
  }

  /**
   * Emit computed column stats via onDefaultStatsChange callback.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const bgTotal = this.backgroundData?.total ?? null;
    const nonNullCount = this.data.total - this.data.nullCount;

    // For boolean columns, extract true count from segments
    let trueCount: number | undefined;
    if (this.column.type === 'boolean') {
      const trueSegment = this.data.segments.find(
        (s) => s.value === 'true'
      );
      trueCount = trueSegment?.count ?? 0;
    }

    const stats: CategoricalColumnStats = {
      kind: 'categorical',
      totalRows: bgTotal ?? this.data.total,
      nonNullCount,
      nullCount: this.data.nullCount,
      filteredTotalRows: bgTotal !== null ? this.data.total : null,
      distinctCount: this.data.distinctCount,
      trueCount,
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

    this.clear();

    if (!this.data) {
      return;
    }

    // Use background data for rendering decisions in crossfilter mode
    const referenceData = this.backgroundData ?? this.data;

    // Handle empty state
    if (referenceData.segments.length === 0 && referenceData.nullCount === 0) {
      this.drawEmptyState();
      return;
    }

    // Handle all unique values special case
    if (referenceData.isAllUnique && referenceData.segments.length > 0) {
      this.drawAllUniqueState();
      return;
    }

    // Build combined segments array including null
    this.buildRenderSegments();

    // Sync visual state from filter after segments are built
    if (this.pendingFilterSync) {
      this.pendingFilterSync = false;
      this.syncVisualStateFromFilter();
    }

    // Calculate layout
    this.calculateLayout();

    // Draw components
    this.drawSegments();
    this.drawSelectionIndicators();
  }

  /**
   * Build the render segments array combining categories and null.
   * Also builds backgroundSegments when backgroundData exists.
   */
  private buildRenderSegments(): void {
    if (!this.data) {
      this.renderSegments = [];
      this.backgroundSegments = [];
      this.topCategoryValues = [];
      return;
    }

    // Start with category segments
    this.renderSegments = this.data.segments.map((seg) => ({
      value: seg.value,
      count: seg.count,
      isOther: seg.isOther,
      isNull: false,
      otherCount: seg.otherCount,
    }));

    // Store top N category values (non-Other) for exclusion filter
    // Use background categories in crossfilter mode for consistent "Other" exclusion
    const categorySource = this.backgroundData ?? this.data;
    this.topCategoryValues = categorySource.segments
      .filter((seg) => !seg.isOther)
      .map((seg) => seg.value);

    // Add null segment at the end if there are nulls
    if (this.data.nullCount > 0) {
      this.renderSegments.push({
        value: '\u2205', // Empty set symbol
        count: this.data.nullCount,
        isOther: false,
        isNull: true,
      });
    }

    // Build background segments when backgroundData exists
    if (this.backgroundData) {
      this.backgroundSegments = this.backgroundData.segments.map((seg) => ({
        value: seg.value,
        count: seg.count,
        isOther: seg.isOther,
        isNull: false,
        otherCount: seg.otherCount,
      }));

      if (this.backgroundData.nullCount > 0) {
        this.backgroundSegments.push({
          value: '\u2205',
          count: this.backgroundData.nullCount,
          isOther: false,
          isNull: true,
        });
      }
    } else {
      this.backgroundSegments = [];
    }
  }

  /**
   * Sync segment selection from the current column's filter.
   *
   * Maps PointFilter, SetFilter, PatternFilter, and NullFilter to
   * highlighted segments so the visualization reflects panel-created filters.
   */
  private syncVisualStateFromFilter(): void {
    const ownFilter = this.options.filters.find(f => f.column === this.column.name);

    if (!ownFilter) {
      this.selectedSegments.clear();
      return;
    }

    this.selectedSegments.clear();

    for (let i = 0; i < this.renderSegments.length; i++) {
      const seg = this.renderSegments[i];

      // Skip aggregate segments — they can't be directly matched
      if (seg.isOther || seg.isAllUnique) continue;

      switch (ownFilter.type) {
        case 'point':
          if (seg.isNull && ownFilter.value === null) {
            this.selectedSegments.add(i);
          } else if (!seg.isNull && seg.value === String(ownFilter.value)) {
            this.selectedSegments.add(i);
          }
          break;

        case 'set':
          if (!seg.isNull && ownFilter.values.map(String).includes(seg.value)) {
            this.selectedSegments.add(i);
          }
          break;

        case 'pattern':
          if (!seg.isNull && this.matchesPattern(seg.value, ownFilter.pattern, ownFilter.mode)) {
            this.selectedSegments.add(i);
          }
          break;

        case 'null':
          if (seg.isNull) {
            this.selectedSegments.add(i);
          }
          break;

        case 'not-null':
          // All non-null segments included — no visual selection needed
          break;

        default:
          break;
      }
    }
  }

  /**
   * Test if a string value matches a pattern filter mode.
   */
  private matchesPattern(value: string, pattern: string, mode: string): boolean {
    switch (mode) {
      case 'contains':
        return value.includes(pattern);
      case 'starts':
        return value.startsWith(pattern);
      case 'ends':
        return value.endsWith(pattern);
      case 'regex':
        try { return new RegExp(pattern).test(value); } catch { return false; }
      default:
        return false;
    }
  }

  /**
   * Calculate layout positions for segments
   */
  private calculateLayout(): void {
    if (!this.data) return;

    const chartWidth = this.width - PADDING.left - PADDING.right;
    const chartHeight = this.height - PADDING.top - PADDING.bottom;

    this.barArea = {
      x: PADDING.left,
      y: PADDING.top,
      width: chartWidth,
      height: chartHeight,
    };

    // Calculate segment positions
    this.calculateSegmentPositions();
  }

  /**
   * Calculate positions for each segment (including null).
   * When backgroundData exists, uses backgroundSegments for total count
   * and proportions (background determines segment widths).
   */
  private calculateSegmentPositions(): void {
    // Use background segments for layout when crossfilter is active
    const layoutSegments = this.backgroundData !== null && this.backgroundSegments.length > 0
      ? this.backgroundSegments
      : this.renderSegments;

    if (layoutSegments.length === 0) {
      this.segmentPositions = [];
      return;
    }

    const positions: Array<{ x: number; width: number; index: number }> = [];

    // Use initial segment counts for stable widths when available
    const useInitialCounts = this.initialSegmentCounts !== null;
    const getCount = (seg: RenderSegment): number => {
      if (useInitialCounts) {
        const key = seg.isOther ? 'Other' : seg.value;
        return this.initialSegmentCounts!.get(key) ?? seg.count;
      }
      return seg.count;
    };

    const totalCount = layoutSegments.reduce((sum, seg) => sum + getCount(seg), 0);

    if (totalCount === 0) {
      this.segmentPositions = [];
      return;
    }

    let currentX = this.barArea.x;
    const numSegments = layoutSegments.length;
    const totalBorderWidth = (numSegments - 1) * LAYOUT.segmentBorderWidth;
    const availableWidth = this.barArea.width - totalBorderWidth;

    for (let i = 0; i < numSegments; i++) {
      const segment = layoutSegments[i];
      const proportion = getCount(segment) / totalCount;
      let width = Math.max(proportion * availableWidth, LAYOUT.minSegmentWidth);

      // For last segment, ensure we fill to the end
      if (i === numSegments - 1) {
        width = this.barArea.x + this.barArea.width - currentX;
      }

      positions.push({
        x: currentX,
        width,
        index: i,
      });

      currentX += width + LAYOUT.segmentBorderWidth;
    }

    this.segmentPositions = positions;
  }

  /**
   * Draw all segments including null.
   * When backgroundData is present, renders "glass partially full" effect:
   * full segment width from background, left portion filled bright (foreground),
   * right remainder in faded crossfilter color.
   */
  private drawSegments(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const hasHover = this.hoveredSegment !== null;
    const hasSelection = this.selectedSegments.size > 0;
    const hasCrossfilter = this.backgroundData !== null;

    // When crossfilter is active, layout is based on backgroundSegments
    const layoutSegments = hasCrossfilter && this.backgroundSegments.length > 0
      ? this.backgroundSegments
      : this.renderSegments;
    const numSegments = layoutSegments.length;

    // Build a lookup map from foreground segments by value for crossfilter matching
    const fgByValue = new Map<string, RenderSegment>();
    if (hasCrossfilter) {
      for (const seg of this.renderSegments) {
        fgByValue.set(seg.value, seg);
      }
    }

    for (let i = 0; i < this.segmentPositions.length; i++) {
      const pos = this.segmentPositions[i];
      const bgSegment = layoutSegments[i];
      if (!bgSegment) continue;

      // For crossfilter, find matching foreground segment by value
      const fgSegment = hasCrossfilter ? fgByValue.get(bgSegment.value) : bgSegment;

      // For hover/selection, use the layout segment index
      const isHovered = this.hoveredSegment === i;
      const isSelected = this.selectedSegments.has(i);

      // Determine fill color based on segment type and state
      // Priority: hover > selected > (selection|hover) faded > normal
      let fillColor: string;
      let fadedCrossfilterColor: string;

      if (bgSegment.isNull) {
        fadedCrossfilterColor = COLORS.nullFadedCrossfilter;
        if (isHovered) {
          fillColor = COLORS.nullHover;
        } else if (isSelected) {
          fillColor = COLORS.nullHover;
        } else if (hasSelection || hasHover) {
          fillColor = COLORS.nullFaded;
        } else {
          fillColor = COLORS.nullFill;
        }
      } else if (bgSegment.isOther || bgSegment.isAllUnique) {
        fadedCrossfilterColor = COLORS.otherFadedCrossfilter;
        if (isHovered) {
          fillColor = COLORS.otherHover;
        } else if (isSelected) {
          fillColor = COLORS.otherHover;
        } else if (hasSelection || hasHover) {
          fillColor = COLORS.otherFaded;
        } else {
          fillColor = COLORS.otherFill;
        }
      } else {
        fadedCrossfilterColor = COLORS.barFadedCrossfilter;
        if (isHovered) {
          fillColor = COLORS.barHover;
        } else if (isSelected) {
          fillColor = COLORS.barHover;
        } else if (hasSelection || hasHover) {
          fillColor = COLORS.barFaded;
        } else {
          fillColor = COLORS.barFill;
        }
      }

      // Draw segment with rounded corners only on ends
      const isFirst = i === 0;
      const isLast = i === numSegments - 1;

      if (hasCrossfilter) {
        // Two-level crossfilter rendering (matching Histogram pattern):
        // 1. Faded color fills the FULL segment width (all initial samples)
        // 2. Solid color overlays the left portion (fgCount/initialCount)
        const fgCount = fgSegment ? fgSegment.count : 0;

        // Get initial count for this segment
        const segKey = bgSegment.isOther ? 'Other' : bgSegment.value;
        const initialCount = this.initialSegmentCounts?.get(segKey) ?? bgSegment.count;

        const fgProportion = initialCount > 0 ? Math.min(fgCount / initialCount, 1) : 0;

        // 1. Draw faded color at full segment width
        this.drawSegmentRect(
          pos.x,
          this.barArea.y,
          pos.width,
          this.barArea.height,
          fadedCrossfilterColor,
          isFirst,
          isLast
        );

        // 2. Overdraw solid at fgProportion of segment width
        if (fgProportion > 0) {
          const filledWidth = pos.width * fgProportion;
          const fillIsLast = fgProportion >= 1 && isLast;
          this.drawSegmentRect(
            pos.x,
            this.barArea.y,
            filledWidth,
            this.barArea.height,
            fillColor,
            isFirst,
            fillIsLast
          );
        }
      } else {
        // Normal rendering (no crossfilter)
        this.drawSegmentRect(
          pos.x,
          this.barArea.y,
          pos.width,
          this.barArea.height,
          fillColor,
          isFirst,
          isLast
        );
      }

      // Draw border on right edge (except for last segment)
      if (i < numSegments - 1) {
        ctx.strokeStyle = COLORS.segmentBorder;
        ctx.lineWidth = LAYOUT.segmentBorderWidth;
        ctx.beginPath();
        ctx.moveTo(pos.x + pos.width + 0.5, this.barArea.y);
        ctx.lineTo(pos.x + pos.width + 0.5, this.barArea.y + this.barArea.height);
        ctx.stroke();
      }

      // Draw label inside segment if wide enough
      // Use the background segment for label text in crossfilter mode
      this.drawSegmentLabel(pos, bgSegment);
    }
  }

  /**
   * Draw a single segment rectangle with optional rounded corners
   */
  private drawSegmentRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    roundLeft: boolean,
    roundRight: boolean
  ): void {
    const ctx = this.ctx;
    const radius = LAYOUT.barRadius;

    ctx.fillStyle = fill;
    ctx.beginPath();

    if (roundLeft && roundRight) {
      // Both corners rounded
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    } else if (roundLeft) {
      // Only left corners rounded
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    } else if (roundRight) {
      // Only right corners rounded
      ctx.moveTo(x, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x, y);
    } else {
      // No rounded corners
      ctx.rect(x, y, width, height);
    }

    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw label inside a segment if it fits
   */
  private drawSegmentLabel(
    pos: { x: number; width: number },
    segment: RenderSegment
  ): void {
    const ctx = this.ctx;
    const maxLabelWidth = pos.width - LAYOUT.labelPadding;

    if (maxLabelWidth <= 0) return;

    ctx.font = FONTS.label;

    // Determine label text
    let labelText: string;
    if (segment.isNull) {
      labelText = '\u2205'; // Empty set symbol for null
    } else if (segment.isAllUnique) {
      labelText = `All unique (${formatCount(segment.count)})`;
    } else if (segment.isOther) {
      labelText = 'Other';
    } else {
      labelText = segment.value;
    }

    // Truncate if needed
    const label = truncateText(ctx, labelText, maxLabelWidth);
    if (!label) return;

    // Use white text on dark backgrounds (blue, gray), dark text on amber
    ctx.fillStyle = segment.isNull ? COLORS.labelText : COLORS.labelTextLight;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(
      label,
      pos.x + pos.width / 2,
      this.barArea.y + this.barArea.height / 2
    );
  }

  /**
   * Draw selection indicators below selected segments
   */
  private drawSelectionIndicators(): void {
    if (!this.data || this.selectedSegments.size === 0) return;

    const ctx = this.ctx;
    const indicatorY =
      this.barArea.y + this.barArea.height + LAYOUT.selectionIndicatorGap;

    // Draw indicator for each selected segment
    for (const selectedIdx of this.selectedSegments) {
      const pos = this.segmentPositions[selectedIdx];
      if (!pos) continue;

      const layoutSegments = this.backgroundData !== null && this.backgroundSegments.length > 0
        ? this.backgroundSegments
        : this.renderSegments;
      const segment = layoutSegments[selectedIdx];
      ctx.fillStyle = segment?.isNull
        ? COLORS.nullSelectionIndicator
        : COLORS.selectionIndicator;

      ctx.fillRect(
        pos.x,
        indicatorY,
        pos.width,
        LAYOUT.selectionIndicatorHeight
      );
    }
  }

  /**
   * Draw empty state when no data available
   */
  private drawEmptyState(): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.axisText;
    ctx.font = FONTS.axis;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', this.width / 2, this.height / 2);
  }

  /**
   * Draw special state when all values are unique
   */
  private drawAllUniqueState(): void {
    if (!this.data) return;

    const barHeight = this.height - PADDING.top - PADDING.bottom;
    const barWidth = this.width - PADDING.left - PADDING.right;

    // Build render segments for all unique state
    this.renderSegments = [{
      value: ALL_UNIQUE_VALUE_KEY,
      count: this.data.distinctCount,
      isOther: false,
      isNull: false,
      isAllUnique: true,
    }];

    // Add null segment if present
    if (this.data.nullCount > 0) {
      this.renderSegments.push({
        value: '\u2205',
        count: this.data.nullCount,
        isOther: false,
        isNull: true,
      });
    }

    // Build background segments for crossfilter rendering
    if (this.backgroundData) {
      this.backgroundSegments = [{
        value: ALL_UNIQUE_VALUE_KEY,
        count: this.backgroundData.distinctCount,
        isOther: false,
        isNull: false,
        isAllUnique: true,
      }];
      if (this.backgroundData.nullCount > 0) {
        this.backgroundSegments.push({
          value: '\u2205',
          count: this.backgroundData.nullCount,
          isOther: false,
          isNull: true,
        });
      }
    } else {
      this.backgroundSegments = [];
    }

    this.barArea = {
      x: PADDING.left,
      y: PADDING.top,
      width: barWidth,
      height: barHeight,
    };

    this.calculateSegmentPositions();
    this.drawSegments();
    this.drawSelectionIndicators();
  }

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Handle mouse movement - detect which segment is under cursor and update stats
   */
  protected handleMouseMove(x: number, y: number): void {
    if (!this.data) return;

    const hasSelection = this.selectedSegments.size > 0;
    const prevHoveredSegment = this.hoveredSegment;

    // Reset hover state
    this.hoveredSegment = null;

    // Check if in bar area (vertically)
    if (y >= PADDING.top && y <= this.height - PADDING.bottom) {
      // Check all segments
      for (const pos of this.segmentPositions) {
        if (x >= pos.x && x <= pos.x + pos.width) {
          this.hoveredSegment = pos.index;
          break;
        }
      }
    }

    // Update cursor based on hover state
    this.canvas.style.cursor = this.hoveredSegment !== null ? 'pointer' : 'default';

    // Handle hover state changes
    if (this.hoveredSegment !== prevHoveredSegment) {
      // Re-render for segment highlighting
      this.render();

      // Update stats: show hover stats, or restore selection stats when hover ends
      if (this.hoveredSegment !== null) {
        this.updateHoverStats();
      } else if (hasSelection) {
        this.updateSelectedStats();
      } else {
        this.options.onStatsChange?.(null);
      }
    }
  }

  /**
   * Update stats line based on hover state
   */
  private updateHoverStats(): void {
    if (!this.data) return;

    if (this.hoveredSegment !== null) {
      const segment = this.renderSegments[this.hoveredSegment];
      if (segment) {
        let categoryLabel: string;
        if (segment.isNull) {
          categoryLabel = 'null';
        } else if (segment.isAllUnique) {
          categoryLabel = `All unique (${formatCount(segment.count)})`;
        } else if (segment.isOther) {
          categoryLabel = `Other (${segment.otherCount} values)`;
        } else {
          const raw = segment.value.length > 30
            ? segment.value.substring(0, 27) + '...'
            : segment.value;
          categoryLabel = escapeHTML(raw);
        }

        // Show crossfilter context when background data exists
        const bgSegment = this.backgroundSegments[this.hoveredSegment];
        let countLine: string;
        if (this.backgroundData && bgSegment && bgSegment.count > 0) {
          const ratio = formatPercent(segment.count / bgSegment.count);
          countLine = `<span class="stats-label">Count:</span> ${formatCount(segment.count)} / ${formatCount(bgSegment.count)} (${ratio})`;
        } else {
          const percent = formatPercent(segment.count / this.data.total);
          countLine = `<span class="stats-label">Count:</span> ${formatCount(segment.count)} (${percent})`;
        }

        this.options.onStatsChange?.(
          `<span class="stats-label">Category:</span><br>` +
          `${categoryLabel}<br>` +
          countLine
        );
      }
    } else {
      // Restore default stats
      this.options.onStatsChange?.(null);
    }
  }

  /**
   * Handle click - select segment(s) and create filter
   * Supports multi-select with Ctrl/Cmd+click for regular categories
   */
  protected handleClick(x: number, y: number, event?: MouseEvent): void {
    if (!this.data) return;

    const now = Date.now();
    const isMultiSelectKey = event?.metaKey || event?.ctrlKey;

    // Check if click is in the bar area (vertically)
    const inBarArea = y >= PADDING.top && y <= this.height - PADDING.bottom;

    // Find clicked segment (null if click is outside all segments)
    let clickedIndex: number | null = null;
    if (inBarArea) {
      for (const pos of this.segmentPositions) {
        if (x >= pos.x && x <= pos.x + pos.width) {
          clickedIndex = pos.index;
          break;
        }
      }
    }

    // Check if clicked segment is currently selected
    const clickedOnSelected = clickedIndex !== null && this.selectedSegments.has(clickedIndex);

    // Detect double-click on selected segment
    if (clickedOnSelected) {
      const timeSinceLastClick = now - this.lastClickTime;
      const distance = Math.hypot(x - this.lastClickX, y - this.lastClickY);

      if (timeSinceLastClick < this.DOUBLE_CLICK_THRESHOLD && distance < this.DOUBLE_CLICK_DISTANCE) {
        // Double-click on selected → clear all selection
        this.clearSelection();
        this.lastClickTime = 0; // Reset to prevent triple-click issues
        return;
      }
    }

    // Update click tracking
    this.lastClickTime = now;
    this.lastClickX = x;
    this.lastClickY = y;

    // If has selection and clicked outside all segments (anywhere on canvas) → clear
    if (this.selectedSegments.size > 0 && clickedIndex === null) {
      this.clearSelection();
      return;
    }

    // If has selection and clicked on a selected segment (single click without modifier) → clear
    // (consistent with histogram behavior: any click when selected = clear)
    if (this.selectedSegments.size > 0 && clickedOnSelected && !isMultiSelectKey) {
      this.clearSelection();
      return;
    }

    // Nothing clicked
    if (clickedIndex === null) return;

    const segment = this.renderSegments[clickedIndex];
    if (!segment) return;
    // Allow clicking segments visible in background (ghost) even if foreground count is 0
    const bgSegment = this.backgroundSegments[clickedIndex];
    if (segment.count === 0 && !(bgSegment && bgSegment.count > 0)) return;

    // Check if segment supports multi-select (only regular categories)
    const canMultiSelect = !segment.isNull && !segment.isOther && !segment.isAllUnique;

    if (isMultiSelectKey && canMultiSelect) {
      // Multi-select mode with Ctrl/Cmd
      if (this.selectedSegments.has(clickedIndex)) {
        // Ctrl+click on selected → remove from selection
        this.selectedSegments.delete(clickedIndex);
        if (this.selectedSegments.size === 0) {
          this.clearSelection();
          return;
        }
      } else {
        // Ctrl+click on unselected → add to selection
        // First clear any non-multi-selectable segments
        for (const idx of [...this.selectedSegments]) {
          const seg = this.renderSegments[idx];
          if (seg?.isNull || seg?.isOther || seg?.isAllUnique) {
            this.selectedSegments.delete(idx);
          }
        }
        this.selectedSegments.add(clickedIndex);
      }
    } else {
      // Single-select mode (no modifier, or clicked on non-multi-selectable)
      this.selectedSegments.clear();
      this.selectedSegments.add(clickedIndex);
    }

    this.hoveredSegment = null;
    this.render();
    this.updateSelectedStats();
    this.createFilterForSelection();
    this.options.onSelectionChange?.(this.column.name, true);
  }

  /**
   * Create and emit filter for clicked segment (single selection)
   */
  private createFilterForSegment(segment: RenderSegment): void {
    if (segment.isAllUnique) {
      // "All Unique" is a display-only segment, not a real filterable value
      return;
    }
    if (segment.isNull) {
      // Null filter
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'null',
      });
    } else if (segment.isOther) {
      // Exclusion filter - NOT IN top N values
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'not-set',
        values: this.topCategoryValues,
      });
    } else {
      // Point filter for category value
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'point',
        value: segment.value,
      });
    }
  }

  /**
   * Create and emit filter based on current selection (single or multi)
   */
  private createFilterForSelection(): void {
    if (this.selectedSegments.size === 0) {
      return;
    }

    if (this.selectedSegments.size === 1) {
      // Single selection - use existing logic
      const idx = [...this.selectedSegments][0];
      const segment = this.renderSegments[idx];
      if (segment) {
        this.createFilterForSegment(segment);
      }
      return;
    }

    // Multiple selections - create set filter
    const selectedValues: string[] = [];
    for (const idx of this.selectedSegments) {
      const segment = this.renderSegments[idx];
      if (segment && !segment.isNull && !segment.isOther && !segment.isAllUnique) {
        selectedValues.push(segment.value);
      }
    }

    if (selectedValues.length > 0) {
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'set',
        values: selectedValues,
      });
    }
  }

  /**
   * Update stats line to show selected segment info
   */
  private updateSelectedStats(): void {
    if (!this.data || this.selectedSegments.size === 0) return;

    // Single selection
    if (this.selectedSegments.size === 1) {
      const idx = [...this.selectedSegments][0];
      const segment = this.renderSegments[idx];
      if (segment) {
        let categoryLabel: string;
        if (segment.isNull) {
          categoryLabel = 'null';
        } else if (segment.isAllUnique) {
          categoryLabel = `All unique (${formatCount(segment.count)})`;
        } else if (segment.isOther) {
          categoryLabel = `Other (${segment.otherCount} values)`;
        } else {
          const raw = segment.value.length > 30
            ? segment.value.substring(0, 27) + '...'
            : segment.value;
          categoryLabel = escapeHTML(raw);
        }

        const bgSegment = this.backgroundSegments[idx];
        let countLine: string;
        if (this.backgroundData && bgSegment && bgSegment.count > 0) {
          const ratio = formatPercent(segment.count / bgSegment.count);
          countLine = `<span class="stats-label">Count:</span> ${formatCount(segment.count)} / ${formatCount(bgSegment.count)} (${ratio})`;
        } else {
          const percent = formatPercent(segment.count / this.data.total);
          countLine = `<span class="stats-label">Count:</span> ${formatCount(segment.count)} (${percent})`;
        }

        this.options.onStatsChange?.(
          `<span class="stats-label">Category:</span><br>` +
          `${categoryLabel}<br>` +
          countLine
        );
      }
      return;
    }

    // Multi-select stats
    const selectedSegmentsList = [...this.selectedSegments]
      .map(idx => this.renderSegments[idx])
      .filter(s => s && !s.isNull && !s.isOther && !s.isAllUnique);

    const totalCount = selectedSegmentsList.reduce((sum, s) => sum + s.count, 0);

    // Format value list (truncate if too long)
    const values = selectedSegmentsList.map(s => escapeHTML(s.value));
    let valueListStr = values.join(', ');
    if (valueListStr.length > 50) {
      valueListStr = values.slice(0, 3).join(', ') + `, ... (${values.length} values)`;
    }

    // Calculate background total for multi-select crossfilter context
    let countLine: string;
    if (this.backgroundData) {
      const bgTotal = [...this.selectedSegments]
        .map(idx => this.backgroundSegments[idx])
        .filter(s => s && !s.isNull && !s.isOther && !s.isAllUnique)
        .reduce((sum, s) => sum + s.count, 0);
      if (bgTotal > 0) {
        const ratio = formatPercent(totalCount / bgTotal);
        countLine = `<span class="stats-label">Count:</span> ${formatCount(totalCount)} / ${formatCount(bgTotal)} (${ratio})`;
      } else {
        const percent = formatPercent(totalCount / this.data.total);
        countLine = `<span class="stats-label">Count:</span> ${formatCount(totalCount)} (${percent})`;
      }
    } else {
      const percent = formatPercent(totalCount / this.data.total);
      countLine = `<span class="stats-label">Count:</span> ${formatCount(totalCount)} (${percent})`;
    }

    this.options.onStatsChange?.(
      `<span class="stats-label">Selected:</span><br>` +
      `${valueListStr}<br>` +
      countLine
    );
  }

  /**
   * Handle mouse leave - clear hover states
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';

    const hadHover = this.hoveredSegment !== null;
    this.hoveredSegment = null;

    // Restore appropriate stats
    if (this.selectedSegments.size > 0) {
      this.updateSelectedStats();
    } else {
      this.options.onStatsChange?.(null);
    }

    if (hadHover) {
      this.render();
    }
  }

  /**
   * Handle mouse down - no brush for value counts
   */
  protected handleMouseDown(_x: number, _y: number): void {
    // No brush selection for categorical data
  }

  /**
   * Handle mouse up - no brush for value counts
   */
  protected handleMouseUp(_x: number, _y: number): void {
    // No brush selection for categorical data
  }

  /**
   * Handle keyboard events - ESC handled globally
   */
  protected handleKeyDown(_key: string): void {
    // ESC key handling done at demo app level via LIFO stack
  }

  // =========================================
  // Public State Getters/Setters
  // =========================================

  /**
   * Wait for initial data to be loaded without triggering a new fetch.
   * Use this when you need to restore state after visualization creation.
   */
  public waitForData(): Promise<void> {
    return this.dataPromise;
  }

  /**
   * Get the current selection state for persistence
   * Returns array of selected segment indices
   */
  public getSelectionState(): {
    selectedSegments: number[];
    selectedNull: boolean;
  } {
    // Check if any selected segment is the null segment
    const selectedNull = [...this.selectedSegments].some(
      idx => this.renderSegments[idx]?.isNull === true
    );

    return {
      selectedSegments: [...this.selectedSegments],
      selectedNull,
    };
  }

  /**
   * Restore selection state from saved state
   * Call after data is loaded (fetchData completed)
   */
  public setSelectionState(state: {
    selectedSegments: number[];
    selectedNull: boolean;
  } | null): void {
    if (!this.data) return;

    // Rebuild render segments if not already built
    if (this.renderSegments.length === 0) {
      this.buildRenderSegments();
    }

    this.selectedSegments.clear();

    if (state?.selectedSegments) {
      for (const idx of state.selectedSegments) {
        // Validate index is within bounds
        if (idx >= 0 && idx < this.renderSegments.length) {
          this.selectedSegments.add(idx);
        }
      }
    }

    this.render();
    if (this.selectedSegments.size > 0) {
      this.updateSelectedStats();
    }
  }

  /**
   * Clear segment selection (public method for external LIFO handling)
   */
  public clearSelection(): void {
    const hadSelection = this.selectedSegments.size > 0;
    this.selectedSegments.clear();
    this.options.onStatsChange?.(null);
    this.render();
    if (hadSelection && !this.destroyed) {
      this.options.onSelectionChange?.(this.column.name, false);
      // Signal filter removal
      this.options.onFilterChange?.(null);
    }
  }

  /**
   * Get brush state - value counts doesn't support brush
   * Provided for interface compatibility
   */
  public getBrushState(): null {
    return null;
  }

  /**
   * Set brush state - no-op for value counts
   * Provided for interface compatibility
   */
  public setBrushState(_state: unknown): void {
    // Value counts doesn't support brush selection
  }

  /**
   * Clear brush - no-op for value counts
   * Provided for interface compatibility
   */
  public clearBrush(): void {
    // Value counts doesn't support brush selection
  }
}
