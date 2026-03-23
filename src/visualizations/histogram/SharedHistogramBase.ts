/**
 * SharedHistogramBase - Abstract base class for all histogram visualizations
 *
 * Extracts the ~80% of code shared identically across Histogram, DateHistogram,
 * and TimeHistogram. Subclasses implement only:
 * - fetchData() — type-specific data loading
 * - drawAxisLabels() — type-specific label formatting
 * - emitBrushFilter() — type-specific filter emission
 * - formatBinRange(binIndex) — type-specific bin range string
 * - formatBrushRange(startIdx, endIdx) — type-specific brush range string
 */

import { BaseVisualization } from '../BaseVisualization';
import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import { formatCount, formatPercent, truncateText } from '../utils';

// =========================================
// Constants
// =========================================

/** Color palette for histogram rendering */
export const COLORS = {
  // Bars
  barFill: '#3b82f6', // Blue-500 (primary bars)
  barHover: '#2563eb', // Blue-600 (hover state)
  barFaded: '#93c5fd', // Blue-300 (non-hovered bars when one is hovered)

  // Null bar
  nullFill: '#f59e0b', // Amber-500
  nullHover: '#d97706', // Amber-600
  nullFaded: '#fcd34d', // Amber-300 (when histogram bar is hovered)

  // Text
  axisText: '#64748b', // Slate-500
  axisTextHover: '#334155', // Slate-700 (hover stats)

  // Axis line
  axisLine: '#e2e8f0', // Slate-200 (light gray)

  // Background
  chartBg: 'transparent',

  // Brush selection
  brushOverlay: 'rgba(37, 99, 235, 0.2)', // Blue-600 with low alpha
  brushBorder: 'rgba(37, 99, 235, 0.6)', // Blue-600 with medium alpha

  // Selection indicator
  selectionIndicator: '#2563eb', // Blue-600 (same as barHover)
  nullSelectionIndicator: '#d97706', // Amber-600 (same as nullHover)

  // Crossfilter ghost bars (unfilled portion)
  barFadedCrossfilter: 'rgba(59, 130, 246, 0.25)', // Blue-500 at 25%
  nullFadedCrossfilter: 'rgba(245, 158, 11, 0.25)', // Amber-500 at 25%
};

/** Typography settings */
export const FONTS = {
  axis: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
export const PADDING = {
  top: 3,
  right: 4,
  bottom: 22, // Increased to accommodate selection indicator (18 + 2 gap + 2 indicator)
  left: 4,
};

/** Spacing and sizing constants */
export const LAYOUT = {
  nullBarGap: 4, // Gap between histogram and null bar
  barGap: 1, // Gap between histogram bars
  barRadius: 2, // Rounded corner radius
  minBarHeight: 2, // Minimum visible bar height
  selectionIndicatorHeight: 2, // Height of selection indicator line
  selectionIndicatorGap: 2, // Gap between x-axis and indicator
};

/** Adaptive spacing for histograms with few bins */
const FEW_BINS_THRESHOLD = 5;
const FEW_BINS_GAP_RATIO = 0.15; // 15% of bar width as gap

/** Double-click detection constants */
const DOUBLE_CLICK_THRESHOLD = 300; // ms
const DOUBLE_CLICK_DISTANCE = 20; // pixels

// Re-export shared utilities for backward compatibility
export { formatCount, formatPercent } from '../utils';

// =========================================
// Common Interfaces
// =========================================

/** Base bin interface — all histogram bin types must have at least a count */
export interface BaseBin {
  count: number;
}

/** Base histogram data interface — all histogram data types must have these fields */
export interface BaseHistogramData {
  bins: BaseBin[];
  nullCount: number;
  total: number;
  isSingleValue: boolean;
}

// =========================================
// SharedHistogramBase Class
// =========================================

export abstract class SharedHistogramBase<TData extends BaseHistogramData> extends BaseVisualization {
  // Data
  protected data: TData | null = null;
  protected backgroundData: TData | null = null;

  // Fetch sequence counter for stale result protection
  protected fetchSequence = 0;

  // Promise for initial data load (used by waitForData)
  protected dataPromise: Promise<void>;

  // Interaction state
  protected hoveredBin: number | null = null;
  protected hoveredNull: boolean = false;

  // Selection state (single bar click-to-select)
  protected selectedBin: number | null = null;
  protected selectedNull: boolean = false;

  // All-null state (when all data is null)
  protected isAllNullState = false;
  protected allNullHovered = false;

  // Flag to prevent handleClick from acting after handleMouseDown cleared something
  protected clickConsumedByMouseDown = false;

  // Brush state for range selection
  protected brushState = {
    active: false, // True while creating new brush (dragging)
    committed: false, // True after mouseup, brush stays visible
    sliding: false, // True while sliding existing brush
    slideStartX: 0, // X position where slide started
    slideVisualOffset: 0, // Pixel offset for smooth visual during slide
    slideClickOffset: 0, // Offset from click position to brush left edge
    startX: 0, // Pixel position where brush started
    currentX: 0, // Current pixel position (for smooth animation)
    startBinIndex: -1, // First bin fully within brush
    endBinIndex: -1, // Last bin fully within brush
    lastClickTime: 0, // For double-click detection
    lastClickX: 0,
    lastClickY: 0,
  };

  // Computed layout (updated on render)
  protected chartArea = { x: 0, y: 0, width: 0, height: 0 };
  protected nullBarArea = { x: 0, y: 0, width: 0, height: 0 };
  protected barPositions: Array<{ x: number; width: number; binIndex: number }> = [];

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
  // Abstract Methods - Subclasses Must Implement
  // =========================================

  /** Fetch type-specific data from DuckDB */
  abstract fetchData(): Promise<void>;

  /** Draw type-specific axis labels */
  protected abstract drawAxisLabels(): void;

  /** Emit type-specific filter for current brush state */
  protected abstract emitBrushFilter(): void;

  /** Format a single bin's range string for hover/selection stats */
  protected abstract formatBinRange(binIndex: number): string;

  /** Format a brush range string spanning startIdx to endIdx */
  protected abstract formatBrushRange(startIdx: number, endIdx: number): string;

  // =========================================
  // Rendering
  // =========================================

  /**
   * Main render method - draws the complete histogram
   */
  render(): void {
    if (this.destroyed || this.width === 0 || this.height === 0) return;

    this.clear();

    // Check for all-null state (bins empty but nulls exist)
    if (this.data && this.data.bins.length === 0 && this.data.nullCount > 0) {
      this.isAllNullState = true;
      this.drawAllNullState();
      return;
    }

    this.isAllNullState = false;

    // If no data at all, show empty state
    if (!this.data || this.data.bins.length === 0) {
      this.drawEmptyState();
      return;
    }

    // Calculate layout
    this.calculateLayout();

    // Draw components
    this.drawAxisLine();
    this.drawBars();
    this.drawNullBar();
    this.drawSelectionIndicators();
    this.drawAxisLabels();

    // Draw brush overlay if active or committed
    if (this.brushState.active || this.brushState.committed) {
      this.drawBrushOverlay();
    }
  }

  /**
   * Calculate chart area and bar positions based on current dimensions
   */
  private calculateLayout(): void {
    if (!this.data) return;

    // Use background data for layout when available (it has the wider/equal distribution)
    const layoutData = this.backgroundData ?? this.data;
    const hasNulls = layoutData.nullCount > 0;
    const numBins = layoutData.bins.length;

    // First, estimate bar width to size null bar appropriately
    // Initial estimate without null bar space
    const estimatedChartWidth = this.width - PADDING.left - PADDING.right;
    const estimatedTotalGaps = numBins > 0 ? (numBins - 1) * LAYOUT.barGap : 0;
    const estimatedBarWidth = numBins > 0
      ? Math.max(1, (estimatedChartWidth - estimatedTotalGaps) / numBins)
      : 8;

    // Null bar width: match histogram bar width (slightly wider, max 1.5x)
    const nullBarWidth = hasNulls
      ? Math.min(estimatedBarWidth * 1.2, estimatedBarWidth + 4, 16)
      : 0;
    const nullSpace = hasNulls ? nullBarWidth + LAYOUT.nullBarGap : 0;

    // Now calculate actual chart area
    this.chartArea = {
      x: PADDING.left,
      y: PADDING.top,
      width: this.width - PADDING.left - PADDING.right - nullSpace,
      height: this.height - PADDING.top - PADDING.bottom,
    };

    // Calculate null bar area (if nulls exist)
    if (hasNulls) {
      this.nullBarArea = {
        x: this.width - PADDING.right - nullBarWidth,
        y: PADDING.top,
        width: nullBarWidth,
        height: this.chartArea.height,
      };
    }

    // Calculate bar positions
    this.calculateBarPositions();
  }

  /**
   * Calculate x position and width for each bar
   * Uses adaptive spacing for histograms with few bins
   */
  private calculateBarPositions(): void {
    const layoutData = this.backgroundData ?? this.data;
    if (!layoutData) return;

    const numBins = layoutData.bins.length;
    if (numBins === 0) {
      this.barPositions = [];
      return;
    }

    // Special case: single value - use 40% width centered bar
    if (layoutData.isSingleValue && numBins === 1) {
      const singleBarWidth = Math.min(this.chartArea.width * 0.4, 60);
      const barX = this.chartArea.x + (this.chartArea.width - singleBarWidth) / 2;
      this.barPositions = [{
        x: barX,
        width: singleBarWidth,
        binIndex: 0,
      }];
      return;
    }

    // Use adaptive spacing for few bins to create visual separation
    // Bars extend edge-to-edge with gaps only between bars (not on sides)
    if (numBins <= FEW_BINS_THRESHOLD) {
      // Solve: numBins * barWidth + (numBins - 1) * gap = chartWidth
      //        gap = FEW_BINS_GAP_RATIO * barWidth
      // => barWidth = chartWidth / (numBins + (numBins - 1) * FEW_BINS_GAP_RATIO)
      const barWidth =
        this.chartArea.width / (numBins + (numBins - 1) * FEW_BINS_GAP_RATIO);
      const gap = barWidth * FEW_BINS_GAP_RATIO;

      this.barPositions = layoutData.bins.map((_, index) => ({
        x: this.chartArea.x + index * (barWidth + gap),
        width: barWidth,
        binIndex: index,
      }));
      return;
    }

    // Original logic for many bins (unchanged)
    const totalGaps = (numBins - 1) * LAYOUT.barGap;
    const availableWidth = this.chartArea.width - totalGaps;
    const barWidth = Math.max(1, availableWidth / numBins);

    this.barPositions = layoutData.bins.map((_, index) => ({
      x: this.chartArea.x + index * (barWidth + LAYOUT.barGap),
      width: barWidth,
      binIndex: index,
    }));
  }

  /**
   * Draw a thin x-axis line at the bottom of the chart area
   */
  private drawAxisLine(): void {
    const ctx = this.ctx;
    const y = this.chartArea.y + this.chartArea.height;

    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.chartArea.x, y);
    ctx.lineTo(this.chartArea.x + this.chartArea.width, y);
    ctx.stroke();
  }

  /**
   * Draw histogram bars with rounded top corners.
   * When backgroundData is present, renders "glass partially full" effect:
   * full bar in faded color (background), then overdraw bottom portion in bright color (foreground).
   */
  private drawBars(): void {
    if (!this.data || this.data.bins.length === 0) return;

    const ctx = this.ctx;
    const layoutData = this.backgroundData ?? this.data;
    const maxCount = Math.max(...layoutData.bins.map((b) => b.count), 1);
    const chartBottom = this.chartArea.y + this.chartArea.height;
    const hasCrossfilter = this.backgroundData !== null;

    // Check if any bar is hovered
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;

    // Check if a bar is selected (single-click selection)
    const hasSelection = this.selectedBin !== null || this.selectedNull;

    // Check if brush is active or committed
    const hasBrush = this.brushState.active || this.brushState.committed;
    let brushStartIdx = -1;
    let brushEndIdx = -1;

    if (hasBrush && this.brushState.startBinIndex !== -1) {
      brushStartIdx = Math.min(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
      brushEndIdx = Math.max(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
    }

    for (let i = 0; i < layoutData.bins.length; i++) {
      const bgBin = layoutData.bins[i];
      const fgBin = this.data.bins[i];
      const pos = this.barPositions[i];

      if (!pos) continue;

      // Determine color based on hover, selection, and brush state
      const isThisHovered = this.hoveredBin === i;
      const isThisSelected = this.selectedBin === i;
      const isInsideBrush = hasBrush && i >= brushStartIdx && i <= brushEndIdx;

      let fillColor: string;
      if (isThisHovered) {
        fillColor = COLORS.barHover;
      } else if (isThisSelected) {
        fillColor = COLORS.barHover;
      } else if (hasBrush && isInsideBrush) {
        fillColor = COLORS.barHover;
      } else if (hasSelection || hasBrush || isAnyHovered) {
        fillColor = COLORS.barFaded;
      } else {
        fillColor = COLORS.barFill;
      }

      if (hasCrossfilter) {
        // "Glass partially full" rendering
        // 1. Draw FULL bar (background height) in faded crossfilter color
        const bgHeightRatio = bgBin.count / maxCount;
        const bgBarHeight = Math.max(
          bgBin.count > 0 ? LAYOUT.minBarHeight : 0,
          bgHeightRatio * this.chartArea.height
        );

        if (bgBarHeight > 0) {
          this.drawRoundedBar(
            ctx,
            pos.x,
            chartBottom - bgBarHeight,
            pos.width,
            bgBarHeight,
            LAYOUT.barRadius,
            COLORS.barFadedCrossfilter
          );
        }

        // 2. Overdraw BOTTOM portion (foreground height) in bright color
        const fgCount = fgBin ? fgBin.count : 0;
        const fgHeightRatio = fgCount / maxCount;
        const fgBarHeight = Math.max(
          fgCount > 0 ? LAYOUT.minBarHeight : 0,
          fgHeightRatio * this.chartArea.height
        );

        if (fgBarHeight > 0) {
          this.drawRoundedBar(
            ctx,
            pos.x,
            chartBottom - fgBarHeight,
            pos.width,
            fgBarHeight,
            LAYOUT.barRadius,
            fillColor
          );
        }
      } else {
        // Normal rendering (no crossfilter)
        const fgCount = fgBin ? fgBin.count : 0;
        const heightRatio = fgCount / maxCount;
        const barHeight = Math.max(
          fgCount > 0 ? LAYOUT.minBarHeight : 0,
          heightRatio * this.chartArea.height
        );

        this.drawRoundedBar(
          ctx,
          pos.x,
          chartBottom - barHeight,
          pos.width,
          barHeight,
          LAYOUT.barRadius,
          fillColor
        );
      }
    }
  }

  /**
   * Draw a single bar with rounded top corners
   */
  protected drawRoundedBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: string
  ): void {
    if (height <= 0) return;

    ctx.fillStyle = color;

    // If bar is too short for rounded corners, just draw a rectangle
    if (height < radius * 2 || width < radius * 2) {
      ctx.fillRect(x, y, width, height);
      return;
    }

    // Draw rounded rectangle (top corners only)
    ctx.beginPath();
    ctx.moveTo(x, y + height); // Bottom left
    ctx.lineTo(x, y + radius); // Left edge up to corner
    ctx.quadraticCurveTo(x, y, x + radius, y); // Top left corner
    ctx.lineTo(x + width - radius, y); // Top edge
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius); // Top right corner
    ctx.lineTo(x + width, y + height); // Right edge down
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw the null bar (if nulls exist).
   * When backgroundData is present, renders "glass partially full" effect.
   */
  private drawNullBar(): void {
    const layoutData = this.backgroundData ?? this.data;
    if (!this.data || !layoutData || layoutData.nullCount === 0) return;

    const ctx = this.ctx;
    const hasCrossfilter = this.backgroundData !== null;
    const maxCount = Math.max(
      ...layoutData.bins.map((b) => b.count),
      layoutData.nullCount,
      1
    );
    const chartBottom = this.nullBarArea.y + this.nullBarArea.height;

    // Determine color: hover > selected > (selection|brush|hover) faded > normal
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;
    const hasSelection = this.selectedBin !== null || this.selectedNull;
    const hasBrush = this.brushState.active || this.brushState.committed;

    let fillColor: string;
    if (this.hoveredNull) {
      fillColor = COLORS.nullHover;
    } else if (this.selectedNull) {
      fillColor = COLORS.nullHover;
    } else if (hasSelection || hasBrush || isAnyHovered) {
      fillColor = COLORS.nullFaded;
    } else {
      fillColor = COLORS.nullFill;
    }

    if (hasCrossfilter) {
      // "Glass partially full" for null bar
      const bgHeightRatio = layoutData.nullCount / maxCount;
      const bgBarHeight = Math.max(LAYOUT.minBarHeight, bgHeightRatio * this.nullBarArea.height);

      this.drawRoundedBar(ctx, this.nullBarArea.x, chartBottom - bgBarHeight,
        this.nullBarArea.width, bgBarHeight, LAYOUT.barRadius, COLORS.nullFadedCrossfilter);

      const fgHeightRatio = this.data.nullCount / maxCount;
      const fgBarHeight = Math.max(
        this.data.nullCount > 0 ? LAYOUT.minBarHeight : 0,
        fgHeightRatio * this.nullBarArea.height
      );

      if (fgBarHeight > 0) {
        this.drawRoundedBar(ctx, this.nullBarArea.x, chartBottom - fgBarHeight,
          this.nullBarArea.width, fgBarHeight, LAYOUT.barRadius, fillColor);
      }
    } else {
      const heightRatio = this.data.nullCount / maxCount;
      const barHeight = Math.max(LAYOUT.minBarHeight, heightRatio * this.nullBarArea.height);

      this.drawRoundedBar(ctx, this.nullBarArea.x, chartBottom - barHeight,
        this.nullBarArea.width, barHeight, LAYOUT.barRadius, fillColor);
    }
  }

  /**
   * Draw underline indicators below selected/brushed bars
   */
  private drawSelectionIndicators(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const indicatorY =
      this.chartArea.y + this.chartArea.height + LAYOUT.selectionIndicatorGap;
    const indicatorHeight = LAYOUT.selectionIndicatorHeight;

    // Check for brush selection
    const hasBrush = this.brushState.active || this.brushState.committed;
    let brushStartIdx = -1;
    let brushEndIdx = -1;

    if (hasBrush && this.brushState.startBinIndex !== -1) {
      brushStartIdx = Math.min(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
      brushEndIdx = Math.max(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
    }

    // Draw indicators for histogram bars
    for (let i = 0; i < this.data.bins.length; i++) {
      const pos = this.barPositions[i];
      if (!pos) continue;

      const isSelected = this.selectedBin === i;
      const isInsideBrush = hasBrush && i >= brushStartIdx && i <= brushEndIdx;

      if (isSelected || isInsideBrush) {
        ctx.fillStyle = COLORS.selectionIndicator;
        ctx.fillRect(pos.x, indicatorY, pos.width, indicatorHeight);
      }
    }

    // Draw indicator for null bar if selected
    if (this.selectedNull && this.data.nullCount > 0) {
      ctx.fillStyle = COLORS.nullSelectionIndicator;
      ctx.fillRect(
        this.nullBarArea.x,
        indicatorY,
        this.nullBarArea.width,
        indicatorHeight
      );
    }
  }

  /**
   * Draw the empty set symbol (∅) below the null bar
   */
  protected drawNullSymbol(): void {
    if (!this.data || this.data.nullCount === 0) return;

    const ctx = this.ctx;
    const centerX = this.nullBarArea.x + this.nullBarArea.width / 2;
    const labelY = this.height - 3;

    ctx.fillStyle = COLORS.nullFill; // Amber color
    ctx.font = FONTS.axis;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('∅', centerX, labelY);
  }

  /**
   * Draw min/max axis labels with overlap detection and truncation.
   * If both labels fit, renders as-is; otherwise adaptively allocates
   * space and truncates the longer label with ellipsis.
   */
  protected drawMinMaxLabels(minLabel: string, maxLabel: string, maxX: number): void {
    const ctx = this.ctx;
    const labelY = this.height - 3;
    const MIN_GAP = 6;

    ctx.font = FONTS.axis;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.axisText;

    const minWidth = ctx.measureText(minLabel).width;
    const maxWidth = ctx.measureText(maxLabel).width;
    const availableWidth = maxX - PADDING.left;

    if (minWidth + maxWidth + MIN_GAP <= availableWidth) {
      // No overlap — render as-is
      ctx.textAlign = 'left';
      ctx.fillText(minLabel, PADDING.left, labelY);
      ctx.textAlign = 'right';
      ctx.fillText(maxLabel, maxX, labelY);
    } else {
      // Adaptive allocation: short label keeps its width, long one gets remainder
      const totalBudget = availableWidth - MIN_GAP;
      const halfBudget = totalBudget / 2;

      let minBudget: number, maxBudget: number;
      if (minWidth <= halfBudget) {
        minBudget = minWidth;
        maxBudget = totalBudget - minWidth;
      } else if (maxWidth <= halfBudget) {
        maxBudget = maxWidth;
        minBudget = totalBudget - maxWidth;
      } else {
        minBudget = halfBudget;
        maxBudget = halfBudget;
      }

      ctx.textAlign = 'left';
      ctx.fillText(truncateText(ctx, minLabel, minBudget), PADDING.left, labelY);
      ctx.textAlign = 'right';
      ctx.fillText(truncateText(ctx, maxLabel, maxBudget), maxX, labelY);
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
   * Draw all-null state - full-width amber bar when all values are null
   */
  private drawAllNullState(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const barX = PADDING.left;
    const barY = PADDING.top;
    const barWidth = this.width - PADDING.left - PADDING.right;
    const barHeight = this.height - PADDING.top - PADDING.bottom;

    // Determine color based on hover state
    const fillColor = this.allNullHovered ? COLORS.nullHover : COLORS.nullFill;

    // Draw full-width amber bar with rounded top corners
    this.drawRoundedBar(ctx, barX, barY, barWidth, barHeight, LAYOUT.barRadius, fillColor);

    // Draw axis line at bottom
    const axisY = barY + barHeight;
    ctx.strokeStyle = COLORS.axisLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX, axisY);
    ctx.lineTo(barX + barWidth, axisY);
    ctx.stroke();

    // Draw centered ∅ label below bar
    const labelY = this.height - 3;
    ctx.fillStyle = COLORS.nullFill;
    ctx.font = FONTS.axis;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('∅', this.width / 2, labelY);
  }

  // =========================================
  // Stats Formatting Helpers
  // =========================================

  /**
   * Format count stats with crossfilter context.
   * When backgroundData exists, shows "Count: fg / bg (ratio%)" instead of just "Count: fg (percent%)".
   */
  private formatCountLine(fgCount: number, binIndices?: { start: number; end: number }): string {
    if (this.backgroundData && this.data) {
      // Calculate background count for the same bin(s)
      let bgCount: number;
      if (binIndices) {
        bgCount = 0;
        for (let i = binIndices.start; i <= binIndices.end; i++) {
          bgCount += this.backgroundData.bins[i]?.count ?? 0;
        }
      } else {
        // null bar
        bgCount = this.backgroundData.nullCount;
      }
      if (bgCount > 0) {
        const ratio = formatPercent(fgCount / bgCount);
        return `<span class="stats-label">Count:</span> ${formatCount(fgCount)} / ${formatCount(bgCount)} (${ratio})`;
      }
    }
    const percent = formatPercent(fgCount / this.data!.total);
    return `<span class="stats-label">Count:</span> ${formatCount(fgCount)} (${percent})`;
  }

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Handle mouse movement - detect which bar is under cursor and update stats
   */
  protected handleMouseMove(x: number, y: number): void {
    // Handle all-null state specially
    if (this.isAllNullState && this.data) {
      const barX = PADDING.left;
      const barWidth = this.width - PADDING.left - PADDING.right;
      const inBar = y >= PADDING.top && y <= this.height - PADDING.bottom &&
                    x >= barX && x <= barX + barWidth;

      const prevHovered = this.allNullHovered;
      this.allNullHovered = inBar;
      this.canvas.style.cursor = inBar ? 'pointer' : 'default';

      if (this.allNullHovered !== prevHovered) {
        this.render();
        if (this.allNullHovered) {
          this.options.onStatsChange?.(
            `<span class="stats-label">Bin:</span><br>` +
            `null<br>` +
            this.formatCountLine(this.data.nullCount)
          );
        } else {
          this.options.onStatsChange?.(null);
        }
      }
      return;
    }

    // If sliding a committed brush
    if (this.brushState.sliding) {
      this.slideBrush(x);
      return;
    }

    // If creating a new brush (not yet committed)
    if (this.brushState.startX !== 0 && !this.brushState.committed) {
      this.updateBrush(x);
      // Skip hover logic while actively brushing
      if (this.brushState.active) return;
    }

    // Track whether we have a committed brush or selection (for stat restoration)
    const hasBrushOrSelection = this.brushState.committed ||
      this.selectedBin !== null || this.selectedNull;

    // If brush is committed, set cursor based on position but still allow hover
    if (this.brushState.committed) {
      // Cursor: grab inside brush, pointer on bars outside, default elsewhere
      if (this.isInsideBrush(x, y)) {
        this.canvas.style.cursor = 'grab';
      }
      // Don't return - fall through to hover detection
    }

    // --- Hover detection (always runs, even during selection/brush) ---
    const prevHoveredBin = this.hoveredBin;
    const prevHoveredNull = this.hoveredNull;

    // Reset hover states
    this.hoveredBin = null;
    this.hoveredNull = false;

    // Check if in chart area (vertically)
    if (y >= PADDING.top && y <= this.height - PADDING.bottom) {
      // Check null bar first (if exists)
      if (
        this.data?.nullCount &&
        x >= this.nullBarArea.x &&
        x <= this.nullBarArea.x + this.nullBarArea.width
      ) {
        this.hoveredNull = true;
      } else {
        // Check histogram bars
        for (const pos of this.barPositions) {
          if (x >= pos.x && x <= pos.x + pos.width) {
            this.hoveredBin = pos.binIndex;
            break;
          }
        }
      }
    }

    // Update cursor (unless brush committed already set it to 'grab')
    if (!this.brushState.committed || !this.isInsideBrush(x, y)) {
      const isHoveringBar = this.hoveredBin !== null || this.hoveredNull;
      this.canvas.style.cursor = isHoveringBar ? 'pointer' : 'default';
    }

    // Handle hover state changes
    const hoverChanged =
      this.hoveredBin !== prevHoveredBin ||
      this.hoveredNull !== prevHoveredNull;

    if (hoverChanged) {
      // Re-render for bar highlighting
      this.render();

      // Update stats line with formatted HTML
      if (this.hoveredBin !== null && this.data) {
        const bin = this.data.bins[this.hoveredBin];
        if (bin) {
          const rangeStr = this.formatBinRange(this.hoveredBin);
          this.options.onStatsChange?.(
            `<span class="stats-label">Bin:</span><br>` +
            `${rangeStr}<br>` +
            this.formatCountLine(bin.count, { start: this.hoveredBin, end: this.hoveredBin })
          );
        }
      } else if (this.hoveredNull && this.data) {
        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span><br>` +
          `null<br>` +
          this.formatCountLine(this.data.nullCount)
        );
      } else if (hasBrushOrSelection) {
        // Restore brush/selection stats when hover ends
        if (this.brushState.committed) {
          this.updateBrushStats();
        } else {
          this.updateSelectedStats();
        }
      } else {
        // Restore default stats
        this.options.onStatsChange?.(null);
      }
    }
  }

  /**
   * Check if a point is inside the committed brush area
   */
  private isInsideBrush(x: number, y: number): boolean {
    if (!this.brushState.committed) return false;
    if (y < PADDING.top || y > this.height - PADDING.bottom) return false;

    const startIdx = Math.min(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const endIdx = Math.max(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const startPos = this.barPositions[startIdx];
    const endPos = this.barPositions[endIdx];

    if (!startPos || !endPos) return false;
    return x >= startPos.x && x <= endPos.x + endPos.width;
  }

  /**
   * Handle click - create filter via one-bin brush or null selection
   *
   * Option A: A quick click on a histogram bar is treated as a one-bin brush,
   * creating a range filter. The brush is the sole interaction for continuous data.
   * Null bar click creates a null filter (separate from brush).
   */
  protected handleClick(x: number, y: number, _event?: MouseEvent): void {
    // If handleMouseDown already handled this click (double-click clear), skip
    if (this.clickConsumedByMouseDown) {
      this.clickConsumedByMouseDown = false;
      return;
    }

    if (!this.data) return;

    // Handle all-null state - clicking creates null filter
    if (this.isAllNullState) {
      const barX = PADDING.left;
      const barWidth = this.width - PADDING.left - PADDING.right;
      const inBar = y >= PADDING.top && y <= this.height - PADDING.bottom &&
                    x >= barX && x <= barX + barWidth;

      if (inBar) {
        this.options.onFilterChange?.({
          column: this.column.name,
          type: 'null',
        });
      }
      return;
    }

    // If brush is active or committed, clicks are handled by mousedown/mouseup
    if (this.brushState.committed || this.brushState.active) return;

    // Skip if brush was just started (will be handled by mouseup)
    if (this.brushState.startBinIndex !== -1) return;

    // Check if click is in the chart area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;

    // Check null bar click
    if (
      this.data.nullCount > 0 &&
      x >= this.nullBarArea.x &&
      x <= this.nullBarArea.x + this.nullBarArea.width
    ) {
      if (this.selectedNull) {
        // Already selected -> toggle off
        this.clearSelection();
      } else {
        // Select null and create null filter
        this.selectedBin = null;
        this.selectedNull = true;
        this.hoveredBin = null;
        this.hoveredNull = false;
        this.render();
        this.updateSelectedStats();
        this.options.onSelectionChange?.(this.column.name, true);
        this.options.onFilterChange?.({
          column: this.column.name,
          type: 'null',
        });
      }
      return;
    }

    // Check histogram bars - click creates a one-bin brush with range filter
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        const bin = this.data.bins[pos.binIndex];
        if (bin && bin.count > 0) {
          // Clear any null selection first
          if (this.selectedNull) {
            this.clearSelection();
          }

          // Create a committed one-bin brush
          this.brushState.committed = true;
          this.brushState.startBinIndex = pos.binIndex;
          this.brushState.endBinIndex = pos.binIndex;
          this.hoveredBin = null;
          this.hoveredNull = false;
          this.render();
          this.canvas.style.cursor = 'grab';
          this.updateBrushStats();
          this.options.onBrushCommit?.(this.column.name);
          this.emitBrushFilter();
        }
        return;
      }
    }

    // Clicked empty area in chart -> clear any selection
    if (this.selectedNull) {
      this.clearSelection();
    }
  }

  /**
   * Update stats line to show selected bar info
   */
  private updateSelectedStats(): void {
    if (!this.data) return;

    if (this.selectedBin !== null) {
      const bin = this.data.bins[this.selectedBin];
      if (bin) {
        const rangeStr = this.formatBinRange(this.selectedBin);
        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span><br>` +
          `${rangeStr}<br>` +
          this.formatCountLine(bin.count, { start: this.selectedBin, end: this.selectedBin })
        );
      }
    } else if (this.selectedNull) {
      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span><br>` +
        `null<br>` +
        this.formatCountLine(this.data.nullCount)
      );
    }
  }

  /**
   * Clear single bar selection (public for LIFO handling)
   */
  public clearSelection(): void {
    const hadSelection = this.selectedBin !== null || this.selectedNull;
    this.selectedBin = null;
    this.selectedNull = false;
    this.options.onStatsChange?.(null);
    this.render();
    if (hadSelection) {
      this.options.onSelectionChange?.(this.column.name, false);
      // Signal filter removal
      this.options.onFilterChange?.(null);
    }
  }

  /**
   * Handle mouse leave - clear hover states
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';

    // Handle all-null state
    if (this.isAllNullState) {
      if (this.allNullHovered) {
        this.allNullHovered = false;
        this.options.onStatsChange?.(null);
        this.render();
      }
      return;
    }

    // Clear hover and restore appropriate stats
    const hadHover = this.hoveredBin !== null || this.hoveredNull;
    this.hoveredBin = null;
    this.hoveredNull = false;

    if (this.brushState.committed) {
      // Restore brush stats
      this.updateBrushStats();
    } else if (this.selectedBin !== null || this.selectedNull) {
      // Restore selection stats
      this.updateSelectedStats();
    } else {
      this.options.onStatsChange?.(null);
    }

    if (hadHover) {
      this.render();
    }
  }

  // =========================================
  // Brush Selection
  // =========================================

  /**
   * Handle mouse down - start potential brush selection or start sliding
   */
  protected handleMouseDown(x: number, y: number): void {
    if (!this.data || this.data.bins.length === 0) return;

    const now = Date.now();

    // If null is selected, let handleClick handle toggle on null bar;
    // for other areas, clear null selection so brush can start
    if (this.selectedNull) {
      const onNullBar = this.data.nullCount > 0 &&
        x >= this.nullBarArea.x &&
        x <= this.nullBarArea.x + this.nullBarArea.width &&
        y >= PADDING.top && y <= this.height - PADDING.bottom;
      if (onNullBar) {
        // Let handleClick toggle null selection
        return;
      }
      // Clear null selection to allow brush/new interaction
      this.clearSelection();
    }

    // Check for double-click inside committed brush to clear it
    if (this.brushState.committed && this.isInsideBrush(x, y)) {
      const timeSinceLastClick = now - this.brushState.lastClickTime;
      const distance = Math.hypot(
        x - this.brushState.lastClickX,
        y - this.brushState.lastClickY
      );

      if (
        timeSinceLastClick < DOUBLE_CLICK_THRESHOLD &&
        distance < DOUBLE_CLICK_DISTANCE
      ) {
        // Double-click detected - clear brush
        this.resetBrush();
        this.render();
        this.clickConsumedByMouseDown = true; // Prevent bar selection
        return;
      }

      // Not a double-click, start sliding
      this.brushState.sliding = true;
      this.brushState.slideStartX = x;
      this.brushState.lastClickTime = now;
      this.brushState.lastClickX = x;
      this.brushState.lastClickY = y;

      // Calculate offset from click position to brush left edge for cursor sync
      const startIdx = Math.min(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
      const startPos = this.barPositions[startIdx];
      if (startPos) {
        this.brushState.slideClickOffset = x - startPos.x;
      }

      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // Update click tracking for potential future double-click
    this.brushState.lastClickTime = now;
    this.brushState.lastClickX = x;
    this.brushState.lastClickY = y;

    // If clicking outside committed brush, clear it and let handleClick create new interaction
    if (this.brushState.committed) {
      this.resetBrush();
      this.render();
      // Don't consume click - let handleClick create a new one-bin brush or null selection
      return;
    }

    // Only start brush in chart area (not on null bar or outside)
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;
    if (this.data.nullCount > 0 && x >= this.nullBarArea.x) return;

    // Find which bin we're starting on
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        this.brushState = {
          active: false, // Becomes true on first mouse move
          committed: false,
          sliding: false,
          slideStartX: 0,
          slideVisualOffset: 0,
          slideClickOffset: 0,
          startX: x,
          currentX: x, // Track current position for smooth animation
          startBinIndex: -1, // Will be set when brush becomes active
          endBinIndex: -1,
          lastClickTime: now,
          lastClickX: x,
          lastClickY: y,
        };
        // Immediate cursor feedback for brush creation
        this.canvas.style.cursor = 'crosshair';
        return;
      }
    }
  }

  /**
   * Handle mouse up - stop sliding or commit brush
   */
  protected handleMouseUp(_x: number, _y: number): void {
    // Stop sliding
    if (this.brushState.sliding) {
      this.brushState.sliding = false;
      this.brushState.slideVisualOffset = 0; // Reset visual offset to snap to bin
      this.canvas.style.cursor = 'grab';
      this.render(); // Re-render to show snapped position
      // Emit updated range filter after slide completes
      this.emitBrushFilter();
      return;
    }

    // Commit brush after creating it - only if at least one full bin is selected
    if (this.brushState.active) {
      if (this.brushState.startBinIndex !== -1 && this.brushState.endBinIndex !== -1) {
        // At least one bin is fully within the brush - commit it
        this.brushState.active = false;
        this.brushState.committed = true;
        // Clear any hover state so bars render uniformly within brush
        this.hoveredBin = null;
        this.hoveredNull = false;
        this.render();
        this.canvas.style.cursor = 'grab';
        this.updateBrushStats();
        // Notify callback that brush was committed
        this.options.onBrushCommit?.(this.column.name);
        // Emit range filter for the brushed range
        this.emitBrushFilter();
        return;
      } else {
        // No full bin selected - cancel the brush
        this.resetBrush();
        this.render();
        return;
      }
    }

    // Was just a click (no drag), reset brush state
    // Note: Also check !committed to prevent clearing committed brushes from
    // window mouseup events triggered by clicks on other histograms
    if (this.brushState.startX !== 0 && !this.brushState.committed) {
      this.resetBrush();
    }
  }

  /**
   * Handle keyboard events
   * Note: Escape is handled by InteractionManager for LIFO behavior across columns
   */
  protected handleKeyDown(_key: string): void {
    // Escape handling moved to global handler for LIFO behavior
    // Other keys can be handled here if needed
  }

  /**
   * Update brush selection during mouse move
   */
  private updateBrush(x: number): void {
    // Check if we have a potential brush started (startX is set but not active yet)
    const hasPotentialBrush = this.brushState.startX !== 0 && !this.brushState.committed;

    if (!hasPotentialBrush && !this.brushState.active) return;

    // Activate brush on first mouse move (any distance)
    if (!this.brushState.active) {
      this.brushState.active = true;
      this.canvas.style.cursor = 'crosshair';
    }

    // Update current position for smooth overlay
    this.brushState.currentX = x;

    // Calculate which bins overlap with the brush range
    const minX = Math.min(this.brushState.startX, x);
    const maxX = Math.max(this.brushState.startX, x);

    // Find bins that have ANY overlap with the brush
    let newStartIdx = -1;
    let newEndIdx = -1;

    for (const pos of this.barPositions) {
      const barLeft = pos.x;
      const barRight = pos.x + pos.width;

      // A bin is selected if ANY part of it overlaps with [minX, maxX]
      // Overlap exists when: barLeft < maxX AND barRight > minX
      if (barLeft < maxX && barRight > minX) {
        if (newStartIdx === -1) {
          newStartIdx = pos.binIndex;
        }
        newEndIdx = pos.binIndex;
      }
    }

    // Update indices
    this.brushState.startBinIndex = newStartIdx;
    this.brushState.endBinIndex = newEndIdx;

    // Always re-render to show smooth overlay animation
    this.render();
  }

  /**
   * Reset brush state
   */
  protected resetBrush(): void {
    const wasCommitted = this.brushState.committed; // Check BEFORE clearing

    this.brushState = {
      active: false,
      committed: false,
      sliding: false,
      slideStartX: 0,
      slideVisualOffset: 0,
      slideClickOffset: 0,
      startX: 0,
      currentX: 0,
      startBinIndex: -1,
      endBinIndex: -1,
      lastClickTime: 0,
      lastClickX: 0,
      lastClickY: 0,
    };
    this.canvas.style.cursor = 'default';
    this.options.onStatsChange?.(null); // Restore default stats

    // Notify callback if brush was committed (for state cleanup in demo)
    if (wasCommitted && !this.destroyed) {
      this.options.onBrushClear?.(this.column.name);
      // Signal filter removal
      this.options.onFilterChange?.(null);
    }
  }

  /**
   * Slide the brush horizontally
   */
  private slideBrush(x: number): void {
    if (!this.brushState.sliding || !this.data) return;

    // Calculate where brush left edge should be based on cursor position and click offset
    const brushLeftX = x - this.brushState.slideClickOffset;

    const binWidth = this.barPositions[0]?.width ?? 0;
    const binStep = binWidth + LAYOUT.barGap;
    const chartLeft = this.chartArea.x;

    // Calculate which bin the brush left edge should snap to
    const targetBinFloat = (brushLeftX - chartLeft) / binStep;
    const targetBinIndex = Math.round(targetBinFloat);

    // Calculate bin shift from current position
    const currentStartIdx = Math.min(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const binShift = targetBinIndex - currentStartIdx;

    // Calculate visual offset for smooth rendering (difference from snapped position)
    const snappedBrushLeft = chartLeft + targetBinIndex * binStep;
    this.brushState.slideVisualOffset = brushLeftX - snappedBrushLeft;

    if (binShift !== 0) {
      // Calculate new indices
      const brushSize = Math.abs(
        this.brushState.endBinIndex - this.brushState.startBinIndex
      );
      let newStart = this.brushState.startBinIndex + binShift;
      let newEnd = this.brushState.endBinIndex + binShift;

      // Clamp to valid range
      const maxBin = this.data.bins.length - 1;
      if (newStart < 0) {
        newStart = 0;
        newEnd = brushSize;
      }
      if (newEnd > maxBin) {
        newEnd = maxBin;
        newStart = maxBin - brushSize;
      }

      // Only update indices if we actually moved (prevents drift when clamped)
      const actualShift = newStart - this.brushState.startBinIndex;
      if (actualShift !== 0) {
        this.brushState.startBinIndex = newStart;
        this.brushState.endBinIndex = newEnd;
        // Recalculate visual offset after index change
        const newSnappedLeft = chartLeft + newStart * binStep;
        this.brushState.slideVisualOffset = brushLeftX - newSnappedLeft;
        this.updateBrushStats();
      }
    }

    // Always re-render for smooth visual (even if bin indices haven't changed)
    this.render();
  }

  /**
   * Update stats line to show current brush selection
   */
  private updateBrushStats(): void {
    if (!this.data) return;

    const startIdx = Math.min(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const endIdx = Math.max(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];

    if (startBin && endBin) {
      // Sum counts in range
      let rangeCount = 0;
      for (let i = startIdx; i <= endIdx; i++) {
        rangeCount += this.data.bins[i].count;
      }
      const rangeStr = this.formatBrushRange(startIdx, endIdx);

      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span><br>` +
        `${rangeStr}<br>` +
        this.formatCountLine(rangeCount, { start: startIdx, end: endIdx })
      );
    }
  }

  /**
   * Draw brush selection overlay
   */
  private drawBrushOverlay(): void {
    if ((!this.brushState.active && !this.brushState.committed) || !this.data) {
      return;
    }

    const ctx = this.ctx;
    const y = this.chartArea.y;
    const height = this.chartArea.height;

    // For active brush (being created): use pixel positions for smooth animation
    // For committed brush: use bar positions for precise alignment
    let x: number;
    let width: number;

    if (this.brushState.committed) {
      // Committed brush: calculate base position from bar positions
      const startIdx = Math.min(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );
      const endIdx = Math.max(
        this.brushState.startBinIndex,
        this.brushState.endBinIndex
      );

      const startPos = this.barPositions[startIdx];
      const endPos = this.barPositions[endIdx];

      if (!startPos || !endPos) return;

      x = startPos.x;
      width = endPos.x + endPos.width - startPos.x;

      // Apply visual offset during sliding for smooth animation
      if (this.brushState.sliding) {
        x += this.brushState.slideVisualOffset;

        // Clamp to chart area bounds
        const chartLeft = this.chartArea.x;
        const chartRight = this.chartArea.x + this.chartArea.width;

        if (x < chartLeft) {
          x = chartLeft;
        }
        if (x + width > chartRight) {
          x = chartRight - width;
        }
      }
    } else {
      // Active brush: use pixel positions for smooth animation
      x = Math.min(this.brushState.startX, this.brushState.currentX);
      width = Math.abs(this.brushState.currentX - this.brushState.startX);

      // Clamp to chart area
      const chartRight = this.chartArea.x + this.chartArea.width;
      if (x < this.chartArea.x) {
        width -= this.chartArea.x - x;
        x = this.chartArea.x;
      }
      if (x + width > chartRight) {
        width = chartRight - x;
      }
    }

    if (width <= 0) return;

    // Draw semi-transparent overlay
    ctx.fillStyle = COLORS.brushOverlay;
    ctx.fillRect(x, y, width, height);

    // Draw border
    ctx.strokeStyle = COLORS.brushBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }

  // =========================================
  // Public State Getters/Setters
  // =========================================

  /**
   * Wait for initial data to be loaded without triggering a new fetch.
   * Use this when you need to restore state after histogram creation.
   */
  public waitForData(): Promise<void> {
    return this.dataPromise;
  }

  /**
   * Get the current brush state for persistence
   * Returns null if no brush is committed
   */
  public getBrushState(): { startBinIndex: number; endBinIndex: number } | null {
    if (!this.brushState.committed) return null;
    return {
      startBinIndex: this.brushState.startBinIndex,
      endBinIndex: this.brushState.endBinIndex,
    };
  }

  /**
   * Restore brush state from saved state
   * Call after data is loaded (fetchData completed)
   */
  public setBrushState(
    state: { startBinIndex: number; endBinIndex: number } | null
  ): void {
    if (!state || !this.data) {
      return;
    }
    // Validate indices are within bounds
    const maxBin = this.data.bins.length - 1;
    if (state.startBinIndex < 0 || state.endBinIndex > maxBin) {
      return;
    }

    this.brushState.committed = true;
    this.brushState.startBinIndex = state.startBinIndex;
    this.brushState.endBinIndex = state.endBinIndex;
    this.canvas.style.cursor = 'grab';
    this.render();
    this.updateBrushStats();
  }

  /**
   * Get the current selection state for persistence
   */
  public getSelectionState(): {
    selectedBin: number | null;
    selectedNull: boolean;
  } {
    return {
      selectedBin: this.selectedBin,
      selectedNull: this.selectedNull,
    };
  }

  /**
   * Restore selection state from saved state
   * Call after data is loaded (fetchData completed)
   */
  public setSelectionState(state: {
    selectedBin: number | null;
    selectedNull: boolean;
  }): void {
    if (!this.data) return;

    // Validate selectedBin is within bounds
    if (
      state.selectedBin !== null &&
      (state.selectedBin < 0 || state.selectedBin >= this.data.bins.length)
    ) {
      return;
    }

    this.selectedBin = state.selectedBin;
    this.selectedNull = state.selectedNull;
    this.render();
    if (this.selectedBin !== null || this.selectedNull) {
      this.updateSelectedStats();
    }
  }

  // =========================================
  // Filter → Visual State Sync
  // =========================================

  /**
   * Sync brush/selection visual state from the current column's filter.
   *
   * When a filter is created via the filter panel (or any external source),
   * this method maps it to the appropriate visual indicator (brush overlay,
   * selected bin, or selected null bar) so the histogram visually reflects
   * the active filter.
   *
   * This is idempotent: when a brush creates a filter and the filter propagates
   * back, re-syncing produces the same brush state.
   *
   * Subclasses (DateHistogram, TimeHistogram) override to handle their
   * specific bin boundary types.
   */
  /**
   * Base implementation handles null/default cases.
   * Subclasses override for range/point with type-specific bin boundaries.
   */
  protected syncVisualStateFromFilter(): void {
    const filters = this.options.filters;
    const ownFilter = filters.find(f => f.column === this.column.name);
    const data = this.backgroundData ?? this.data;

    if (!ownFilter || !data || data.bins.length === 0) {
      // No filter for this column — clear visual state
      if (this.brushState.committed) {
        this.resetBrush();
      }
      this.selectedBin = null;
      this.selectedNull = false;
      return;
    }

    switch (ownFilter.type) {
      case 'null':
        this.resetBrush();
        this.selectedBin = null;
        this.selectedNull = true;
        break;
      default:
        // Base class cannot handle range/point — subclasses override for those.
        // For not-null, not-set, set, pattern — no direct histogram mapping.
        if (this.brushState.committed) {
          this.resetBrush();
        }
        this.selectedBin = null;
        this.selectedNull = false;
        break;
    }
  }

  /**
   * Helper: set brush state to span bins [startIdx, endIdx].
   */
  protected setBrushFromBinRange(startIdx: number, endIdx: number): void {
    this.selectedBin = null;
    this.selectedNull = false;
    this.brushState.committed = true;
    this.brushState.active = false;
    this.brushState.sliding = false;
    this.brushState.startBinIndex = startIdx;
    this.brushState.endBinIndex = endIdx;
  }

  /**
   * Clear the brush (public method for external LIFO handling)
   */
  public clearBrush(): void {
    this.resetBrush(); // This now calls onBrushClear if brush was committed
    this.render();
  }
}
