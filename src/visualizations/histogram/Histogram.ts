/**
 * Histogram - Canvas-based histogram visualization for numeric columns
 *
 * Renders an elegant histogram in column headers with:
 * - Proportional bar heights based on bin counts
 * - Rounded top corners for visual polish
 * - Separate null bar in amber color
 * - In-place axis label hover stats
 * - Responsive sizing
 */

import { BaseVisualization } from '../BaseVisualization';
import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import {
  fetchHistogramData,
  fetchColumnStats,
  fetchHistogramBins,
  fetchDiscreteValues,
  fetchDiscreteBins,
  calculateOptimalBins,
} from './HistogramData';
import type { HistogramData } from './HistogramData';

// =========================================
// Constants
// =========================================

/** Color palette for histogram rendering */
const COLORS = {
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
const FONTS = {
  axis: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
const PADDING = {
  top: 3,
  right: 4,
  bottom: 22, // Increased to accommodate selection indicator (18 + 2 gap + 2 indicator)
  left: 4,
};

/** Spacing and sizing constants */
const LAYOUT = {
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

// =========================================
// Utility Functions
// =========================================

/**
 * Format a number for display with improved readability
 *
 * Rules:
 * - Scientific notation for |value| >= 1e6 or |value| < 0.01 (except 0)
 * - Locale-formatted integers for whole numbers
 * - Up to 2 decimal places for regular decimals
 */
function formatAxisValue(value: number): string {
  // Handle special cases
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (value === 0) {
    return '0';
  }

  const abs = Math.abs(value);

  // Scientific notation for very large numbers
  if (abs >= 1e6) {
    return value.toExponential(2);
  }

  // Scientific notation for very small numbers
  if (abs < 0.01) {
    return value.toExponential(2);
  }

  // Integer formatting with thousands separators
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  // Decimal formatting: up to 2 decimal places
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format count with thousands separator
 */
function formatCount(count: number): string {
  return count.toLocaleString();
}

/**
 * Format percentage
 */
function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%';
}

// =========================================
// Histogram Class
// =========================================

export class Histogram extends BaseVisualization {
  // Data
  private data: HistogramData | null = null;
  private backgroundData: HistogramData | null = null;

  // Promise for initial data load (used by waitForData)
  private dataPromise: Promise<void>;

  // Interaction state
  private hoveredBin: number | null = null;
  private hoveredNull: boolean = false;

  // Selection state (single bar click-to-select)
  private selectedBin: number | null = null;
  private selectedNull: boolean = false;

  // All-null state (when all data is null)
  private isAllNullState = false;
  private allNullHovered = false;

  // Flag to prevent handleClick from acting after handleMouseDown cleared something
  private clickConsumedByMouseDown = false;

  // Brush state for range selection
  private brushState = {
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
  private chartArea = { x: 0, y: 0, width: 0, height: 0 };
  private nullBarArea = { x: 0, y: 0, width: 0, height: 0 };
  private barPositions: Array<{ x: number; width: number; binIndex: number }> =
    [];

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
   * Fetch histogram data from DuckDB.
   * When crossfilter is active (own column has a filter), fetches both
   * background (excluding own filter) and foreground (all filters) data
   * with aligned bin structure.
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    // Only reset brush/selection on initial load, not on filter updates
    if (!this.isFilterUpdate) {
      this.resetBrush();
      this.selectedBin = null;
      this.selectedNull = false;
    }

    try {
      const maxBins = this.options.maxBins ?? 15;
      const allFilters = this.options.filters;
      const hasOwnFilter = allFilters.some(
        (f) => f.column === this.column.name
      );
      const hasAnyFilter = allFilters.length > 0;

      if (hasAnyFilter) {
        // Crossfilter dual-fetch:
        // - If column HAS own filter: background = other columns' filters (own-filter exclusion)
        // - If column has NO own filter: background = no filters (total unfiltered reference)
        const bgFilters = hasOwnFilter
          ? allFilters.filter((f) => f.column !== this.column.name)
          : [];
        const { tableName, bridge } = this.options;
        const col = this.column.name;

        // Step 1: Fetch stats using background filters (the reference distribution)
        const bgStats = await fetchColumnStats(tableName, col, bgFilters, bridge);

        if (bgStats.count === 0 || bgStats.min === null || bgStats.max === null) {
          // No background data — fall through to single fetch
          this.data = await fetchHistogramData(tableName, col, maxBins, allFilters, bridge);
          this.backgroundData = null;
        } else if (bgStats.min === bgStats.max) {
          // Single value — no need for dual-fetch
          this.data = await fetchHistogramData(tableName, col, maxBins, allFilters, bridge);
          this.backgroundData = null;
        } else {
          // Check for discrete binning
          const DISCRETE_THRESHOLD = 5;
          if (bgStats.distinctCount <= DISCRETE_THRESHOLD) {
            // Discrete mode: use same discrete values for both
            const bgDiscreteValues = await fetchDiscreteValues(tableName, col, bgFilters, bridge);
            const discreteVals = bgDiscreteValues.map((dv) => dv.value);

            const [fgDiscreteBins, fgStats] = await Promise.all([
              fetchDiscreteBins(tableName, col, discreteVals, allFilters, bridge),
              fetchColumnStats(tableName, col, allFilters, bridge),
            ]);

            const bgBins = bgDiscreteValues.map((dv) => ({
              x0: dv.value,
              x1: dv.value,
              count: Number(dv.count),
            }));

            this.backgroundData = {
              bins: bgBins,
              nullCount: bgStats.nullCount,
              min: bgStats.min,
              max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              isSingleValue: false,
              isDiscrete: true,
            };
            this.data = {
              bins: fgDiscreteBins,
              nullCount: fgStats.nullCount,
              min: bgStats.min,
              max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              isSingleValue: false,
              isDiscrete: true,
            };
          } else {
            // Continuous mode: compute bin structure from background stats
            const iqr =
              bgStats.q1 !== null && bgStats.q3 !== null
                ? bgStats.q3 - bgStats.q1
                : 0;
            const numBins = calculateOptimalBins(
              bgStats.min,
              bgStats.max,
              bgStats.count,
              iqr,
              maxBins
            );

            // Fetch both bin sets + foreground stats in parallel
            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchHistogramBins(tableName, col, bgStats.min, bgStats.max, numBins, bgFilters, bridge),
              fetchHistogramBins(tableName, col, bgStats.min, bgStats.max, numBins, allFilters, bridge),
              fetchColumnStats(tableName, col, allFilters, bridge),
            ]);

            this.backgroundData = {
              bins: bgBins,
              nullCount: bgStats.nullCount,
              min: bgStats.min,
              max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              isSingleValue: false,
              isDiscrete: false,
            };
            this.data = {
              bins: fgBins,
              nullCount: fgStats.nullCount,
              min: bgStats.min,
              max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              isSingleValue: false,
              isDiscrete: false,
            };
          }
        }
      } else {
        // No filters at all: single fetch, no background
        this.data = await fetchHistogramData(
          this.options.tableName,
          this.column.name,
          maxBins,
          allFilters,
          this.options.bridge
        );
        this.backgroundData = null;
      }

      this.render();
    } catch (error) {
      console.error(
        `[Histogram] Failed to fetch data for ${this.column.name}:`,
        error
      );
      this.data = null;
      this.backgroundData = null;
      this.render();
    }
  }

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
    if (!this.data) return;

    const numBins = this.data.bins.length;
    if (numBins === 0) {
      this.barPositions = [];
      return;
    }

    // Special case: single value - use 40% width centered bar
    if (this.data.isSingleValue && numBins === 1) {
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

      this.barPositions = this.data.bins.map((_, index) => ({
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

    this.barPositions = this.data.bins.map((_, index) => ({
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
  private drawRoundedBar(
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
   * Draw axis labels (min/max always visible, hover stats shown via tooltip)
   */
  private drawAxisLabels(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const labelY = this.height - 3; // Position near bottom

    ctx.font = FONTS.axis;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.axisText;

    // Handle single value case - show centered label instead of "X – X"
    if (this.data.isSingleValue) {
      ctx.textAlign = 'center';
      const label = formatAxisValue(this.data.min);
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    }
    // Handle discrete bins - show first and last value labels
    else if (this.data.isDiscrete && this.data.bins.length > 0) {
      const firstBin = this.data.bins[0];
      const lastBin = this.data.bins[this.data.bins.length - 1];

      ctx.textAlign = 'left';
      ctx.fillText(formatAxisValue(firstBin.x0), PADDING.left, labelY);

      ctx.textAlign = 'right';
      const maxX = this.data.nullCount > 0
        ? this.nullBarArea.x - LAYOUT.nullBarGap
        : this.width - PADDING.right;
      ctx.fillText(formatAxisValue(lastBin.x0), maxX, labelY);
    }
    // Normal continuous case: min on left, max on right
    else {
      ctx.textAlign = 'left';
      const minLabel = formatAxisValue(this.data.min);
      ctx.fillText(minLabel, PADDING.left, labelY);

      ctx.textAlign = 'right';
      const maxLabel = formatAxisValue(this.data.max);
      const maxX = this.data.nullCount > 0
        ? this.nullBarArea.x - LAYOUT.nullBarGap
        : this.width - PADDING.right;
      ctx.fillText(maxLabel, maxX, labelY);
    }

    // Draw null symbol if nulls exist
    if (this.data.nullCount > 0) {
      this.drawNullSymbol();
    }
  }

  /**
   * Draw the empty set symbol (∅) below the null bar
   */
  private drawNullSymbol(): void {
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
          const count = formatCount(this.data.nullCount);
          const percent = formatPercent(this.data.nullCount / this.data.total);
          this.options.onStatsChange?.(
            `<span class="stats-label">Bin:</span><br>` +
            `null<br>` +
            `<span class="stats-label">Count:</span> ${count} (${percent})`
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
          // Show single value without range for single-value or discrete columns
          const rangeStr = (this.data.isSingleValue || this.data.isDiscrete)
            ? formatAxisValue(bin.x0)
            : `${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}`;
          const count = formatCount(bin.count);
          const percent = formatPercent(bin.count / this.data.total);

          this.options.onStatsChange?.(
            `<span class="stats-label">Bin:</span><br>` +
            `${rangeStr}<br>` +
            `<span class="stats-label">Count:</span> ${count} (${percent})`
          );
        }
      } else if (this.hoveredNull && this.data) {
        const count = formatCount(this.data.nullCount);
        const percent = formatPercent(this.data.nullCount / this.data.total);

        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span><br>` +
          `null<br>` +
          `<span class="stats-label">Count:</span> ${count} (${percent})`
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
          value: null,
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
        // Already selected → toggle off
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
          value: null,
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

    // Clicked empty area in chart → clear any selection
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
        // Show single value without range for single-value or discrete columns
        const rangeStr = (this.data.isSingleValue || this.data.isDiscrete)
          ? formatAxisValue(bin.x0)
          : `${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}`;
        const count = formatCount(bin.count);
        const percent = formatPercent(bin.count / this.data.total);
        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span><br>` +
          `${rangeStr}<br>` +
          `<span class="stats-label">Count:</span> ${count} (${percent})`
        );
      }
    } else if (this.selectedNull) {
      const count = formatCount(this.data.nullCount);
      const percent = formatPercent(this.data.nullCount / this.data.total);
      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span><br>` +
        `null<br>` +
        `<span class="stats-label">Count:</span> ${count} (${percent})`
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
   * Note: Escape is handled globally in demo/main.ts for LIFO behavior across columns
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
  private resetBrush(): void {
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
    if (wasCommitted) {
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
      const percent = formatPercent(rangeCount / this.data.total);
      // Show single value without range for single-value or discrete columns
      const rangeStr = (this.data.isSingleValue || this.data.isDiscrete)
        ? formatAxisValue(startBin.x0)
        : `${formatAxisValue(startBin.x0)} – ${formatAxisValue(endBin.x1)}`;

      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span><br>` +
        `${rangeStr}<br>` +
        `<span class="stats-label">Count:</span> ${formatCount(rangeCount)} (${percent})`
      );
    }
  }

  /**
   * Emit a range filter based on current brush bin indices
   */
  private emitBrushFilter(): void {
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
      if (this.data.isDiscrete) {
        // Discrete: use point/set filters for exact value matching
        if (startIdx === endIdx) {
          this.options.onFilterChange?.({
            column: this.column.name,
            type: 'point',
            value: startBin.x0,
          });
        } else {
          const values = [];
          for (let i = startIdx; i <= endIdx; i++) {
            values.push(this.data.bins[i].x0);
          }
          this.options.onFilterChange?.({
            column: this.column.name,
            type: 'set',
            value: values,
          });
        }
      } else {
        // Continuous: use range filter (exclusive upper bound)
        this.options.onFilterChange?.({
          column: this.column.name,
          type: 'range',
          value: { min: startBin.x0, max: endBin.x1 },
        });
      }
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

  /**
   * Clear the brush (public method for external LIFO handling)
   */
  public clearBrush(): void {
    this.resetBrush(); // This now calls onBrushClear if brush was committed
    this.render();
  }
}
