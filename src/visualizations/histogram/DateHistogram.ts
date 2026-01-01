/**
 * DateHistogram - Canvas-based histogram visualization for date/timestamp columns
 *
 * Renders an elegant temporal histogram in column headers with:
 * - Proportional bar heights based on bin counts
 * - Rounded top corners for visual polish
 * - Separate null bar in amber color
 * - Human-readable date labels (context-aware)
 * - Responsive sizing
 *
 * Mirrors the visual style and interaction patterns of the numeric Histogram.
 */

import { BaseVisualization } from '../BaseVisualization';
import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import { fetchDateHistogramData } from './DateHistogramData';
import type { DateHistogramData } from './DateHistogramData';
import {
  analyzeDateContext,
  formatDateLabel,
  formatDateRange,
  formatDateForType,
  formatDateRangeForType,
} from './DateFormatters';
import type { DateFormatContext } from './DateFormatters';

// =========================================
// Constants (identical to Histogram.ts)
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
};

/** Typography settings */
const FONTS = {
  axis: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
const PADDING = {
  top: 3,
  right: 4,
  bottom: 22, // Increased to accommodate selection indicator
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
// DateHistogram Class
// =========================================

export class DateHistogram extends BaseVisualization {
  // Data
  private data: DateHistogramData | null = null;
  private formatContext: DateFormatContext | null = null;

  // Promise for initial data load (used by waitForData)
  private dataPromise: Promise<void>;

  // Interaction state
  private hoveredBin: number | null = null;
  private hoveredNull: boolean = false;

  // Selection state (single bar click-to-select)
  private selectedBin: number | null = null;
  private selectedNull: boolean = false;

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
    startBinIndex: -1, // First bin within brush
    endBinIndex: -1, // Last bin within brush
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
   * Fetch date histogram data from DuckDB
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    // Clear any existing brush/selection state before fetching new data
    this.resetBrush();
    this.selectedBin = null;
    this.selectedNull = false;

    try {
      // Use configured maxBins (default 15) - interval will be coarsened if needed
      const maxBins = this.options.maxBins ?? 15;

      this.data = await fetchDateHistogramData(
        this.options.tableName,
        this.column.name,
        this.options.filters,
        this.options.bridge,
        maxBins
      );

      // Compute format context if we have data
      if (this.data.min && this.data.max) {
        this.formatContext = analyzeDateContext(this.data.min, this.data.max);
      } else {
        this.formatContext = null;
      }

      this.render();
    } catch (error) {
      console.error(
        `[DateHistogram] Failed to fetch data for ${this.column.name}:`,
        error
      );
      this.data = null;
      this.formatContext = null;
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

    // If no data, show empty state
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

    const hasNulls = this.data.nullCount > 0;
    const numBins = this.data.bins.length;

    // First, estimate bar width to size null bar appropriately
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
   */
  private calculateBarPositions(): void {
    if (!this.data) return;

    const numBins = this.data.bins.length;
    if (numBins === 0) {
      this.barPositions = [];
      return;
    }

    // Use adaptive spacing for few bins
    if (numBins <= FEW_BINS_THRESHOLD) {
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

    // Original logic for many bins
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
   * Draw histogram bars with rounded top corners
   */
  private drawBars(): void {
    if (!this.data || this.data.bins.length === 0) return;

    const ctx = this.ctx;
    const maxCount = Math.max(...this.data.bins.map((b) => b.count), 1);
    const chartBottom = this.chartArea.y + this.chartArea.height;

    // Check if any bar is hovered
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;

    // Check if a bar is selected
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

    for (let i = 0; i < this.data.bins.length; i++) {
      const bin = this.data.bins[i];
      const pos = this.barPositions[i];

      if (!pos) continue;

      // Calculate bar height
      const heightRatio = bin.count / maxCount;
      const barHeight = Math.max(
        bin.count > 0 ? LAYOUT.minBarHeight : 0,
        heightRatio * this.chartArea.height
      );

      // Determine color based on selection, hover, and brush state
      const isThisHovered = this.hoveredBin === i;
      const isThisSelected = this.selectedBin === i;
      const isInsideBrush = hasBrush && i >= brushStartIdx && i <= brushEndIdx;

      let fillColor: string;
      if (isThisSelected) {
        fillColor = COLORS.barHover;
      } else if (hasSelection) {
        fillColor = COLORS.barFaded;
      } else if (isThisHovered) {
        fillColor = COLORS.barHover;
      } else if (hasBrush) {
        fillColor = isInsideBrush ? COLORS.barHover : COLORS.barFaded;
      } else if (isAnyHovered) {
        fillColor = COLORS.barFaded;
      } else {
        fillColor = COLORS.barFill;
      }

      // Draw bar with rounded top corners
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
   * Draw the null bar (if nulls exist)
   */
  private drawNullBar(): void {
    if (!this.data || this.data.nullCount === 0) return;

    const ctx = this.ctx;
    const maxCount = Math.max(
      ...this.data.bins.map((b) => b.count),
      this.data.nullCount,
      1
    );
    const heightRatio = this.data.nullCount / maxCount;
    const barHeight = Math.max(
      LAYOUT.minBarHeight,
      heightRatio * this.nullBarArea.height
    );
    const chartBottom = this.nullBarArea.y + this.nullBarArea.height;

    // Determine color
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;
    const hasSelection = this.selectedBin !== null || this.selectedNull;
    const hasBrush = this.brushState.active || this.brushState.committed;

    let fillColor: string;
    if (this.selectedNull) {
      fillColor = COLORS.nullHover;
    } else if (hasSelection) {
      fillColor = COLORS.nullFaded;
    } else if (this.hoveredNull) {
      fillColor = COLORS.nullHover;
    } else if (hasBrush) {
      fillColor = COLORS.nullFaded;
    } else if (isAnyHovered) {
      fillColor = COLORS.nullFaded;
    } else {
      fillColor = COLORS.nullFill;
    }

    // Draw null bar with rounded top
    this.drawRoundedBar(
      ctx,
      this.nullBarArea.x,
      chartBottom - barHeight,
      this.nullBarArea.width,
      barHeight,
      LAYOUT.barRadius,
      fillColor
    );
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
   * Draw axis labels with human-readable date format
   */
  private drawAxisLabels(): void {
    if (!this.data || !this.formatContext) return;

    const ctx = this.ctx;
    const labelY = this.height - 3;

    ctx.font = FONTS.axis;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.axisText;

    // Handle single value case
    if (this.data.isSingleValue && this.data.bins.length > 0) {
      ctx.textAlign = 'center';
      const label = this.data.isNumericBinning && this.data.min
        ? formatDateForType(this.data.min, this.column.type)
        : formatDateLabel(
            this.data.bins[0].binStart,
            this.data.interval,
            this.formatContext
          );
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    } else if (this.data.bins.length > 0 && this.data.min && this.data.max) {
      // Normal case: min on left, max on right
      const firstBin = this.data.bins[0];
      const lastBin = this.data.bins[this.data.bins.length - 1];

      ctx.textAlign = 'left';
      const minLabel = this.data.isNumericBinning
        ? formatDateForType(this.data.min, this.column.type)
        : formatDateLabel(
            firstBin.binStart,
            this.data.interval,
            this.formatContext
          );
      ctx.fillText(minLabel, PADDING.left, labelY);

      ctx.textAlign = 'right';
      const maxLabel = this.data.isNumericBinning
        ? formatDateForType(this.data.max, this.column.type)
        : formatDateLabel(
            lastBin.binStart,
            this.data.interval,
            this.formatContext
          );
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

    ctx.fillStyle = COLORS.nullFill;
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

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Handle mouse movement
   */
  protected handleMouseMove(x: number, y: number): void {
    // If sliding a committed brush
    if (this.brushState.sliding) {
      this.slideBrush(x);
      return;
    }

    // If creating a new brush
    if (this.brushState.startX !== 0 && !this.brushState.committed) {
      this.updateBrush(x);
      if (this.brushState.active) return;
    }

    // If brush is committed, skip hover logic
    if (this.brushState.committed) {
      if (this.isInsideBrush(x, y)) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'default';
      }
      return;
    }

    // If a bar is selected, skip hover logic
    if (this.selectedBin !== null || this.selectedNull) {
      this.canvas.style.cursor = 'default';
      return;
    }

    const prevHoveredBin = this.hoveredBin;
    const prevHoveredNull = this.hoveredNull;

    // Reset hover states
    this.hoveredBin = null;
    this.hoveredNull = false;

    // Check if in chart area (vertically)
    if (y >= PADDING.top && y <= this.height - PADDING.bottom) {
      // Check null bar first
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

    // Update cursor
    const isHoveringBar = this.hoveredBin !== null || this.hoveredNull;
    this.canvas.style.cursor = isHoveringBar ? 'pointer' : 'default';

    // Handle hover state changes
    const hoverChanged =
      this.hoveredBin !== prevHoveredBin ||
      this.hoveredNull !== prevHoveredNull;

    if (hoverChanged) {
      this.render();

      // Update stats line
      if (this.hoveredBin !== null && this.data && this.formatContext) {
        const bin = this.data.bins[this.hoveredBin];
        if (bin) {
          const rangeStr = this.data.isNumericBinning
            ? formatDateRangeForType(bin.binStart, bin.binEnd, this.column.type)
            : formatDateRange(
                bin.binStart,
                bin.binEnd,
                this.data.interval,
                this.formatContext
              );
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
      } else {
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
   * Handle click - select bar
   */
  protected handleClick(x: number, y: number): void {
    if (this.clickConsumedByMouseDown) {
      this.clickConsumedByMouseDown = false;
      return;
    }

    if (!this.data) return;

    // If brush is active or committed, clicks are handled by mousedown/mouseup
    if (this.brushState.committed || this.brushState.active) return;

    // Skip if brush was just started
    if (this.brushState.startBinIndex !== -1) return;

    // If something is already selected, clear it
    if (this.selectedBin !== null || this.selectedNull) {
      this.clearSelection();
      return;
    }

    // Check if click is in the chart area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;

    // Check null bar
    if (
      this.data.nullCount > 0 &&
      x >= this.nullBarArea.x &&
      x <= this.nullBarArea.x + this.nullBarArea.width
    ) {
      this.selectedBin = null;
      this.selectedNull = true;
      this.hoveredBin = null;
      this.hoveredNull = false;
      this.render();
      this.updateSelectedStats();
      this.options.onSelectionChange?.(this.column.name, true);
      return;
    }

    // Check histogram bars
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        const bin = this.data.bins[pos.binIndex];
        if (bin && bin.count > 0) {
          this.selectedBin = pos.binIndex;
          this.selectedNull = false;
          this.hoveredBin = null;
          this.hoveredNull = false;
          this.render();
          this.updateSelectedStats();
          this.options.onSelectionChange?.(this.column.name, true);
        }
        return;
      }
    }
  }

  /**
   * Update stats line to show selected bar info
   */
  private updateSelectedStats(): void {
    if (!this.data || !this.formatContext) return;

    if (this.selectedBin !== null) {
      const bin = this.data.bins[this.selectedBin];
      if (bin) {
        const rangeStr = this.data.isNumericBinning
          ? formatDateRangeForType(bin.binStart, bin.binEnd, this.column.type)
          : formatDateRange(
              bin.binStart,
              bin.binEnd,
              this.data.interval,
              this.formatContext
            );
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
   * Clear single bar selection
   */
  public clearSelection(): void {
    const hadSelection = this.selectedBin !== null || this.selectedNull;
    this.selectedBin = null;
    this.selectedNull = false;
    this.options.onStatsChange?.(null);
    this.render();
    if (hadSelection) {
      this.options.onSelectionChange?.(this.column.name, false);
    }
  }

  /**
   * Handle mouse leave
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';
    if (!this.brushState.committed && this.selectedBin === null && !this.selectedNull) {
      this.options.onStatsChange?.(null);
    }
    if (this.hoveredBin !== null || this.hoveredNull) {
      this.hoveredBin = null;
      this.hoveredNull = false;
      this.render();
    }
  }

  // =========================================
  // Brush Selection
  // =========================================

  /**
   * Handle mouse down - start potential brush or sliding
   */
  protected handleMouseDown(x: number, y: number): void {
    if (!this.data || this.data.bins.length === 0) return;

    const now = Date.now();

    // If a bar is selected, don't start a brush
    if (this.selectedBin !== null || this.selectedNull) {
      return;
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
        this.resetBrush();
        this.render();
        this.clickConsumedByMouseDown = true;
        return;
      }

      // Start sliding
      this.brushState.sliding = true;
      this.brushState.slideStartX = x;
      this.brushState.lastClickTime = now;
      this.brushState.lastClickX = x;
      this.brushState.lastClickY = y;

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

    // Update click tracking
    this.brushState.lastClickTime = now;
    this.brushState.lastClickX = x;
    this.brushState.lastClickY = y;

    // If clicking outside committed brush, clear it
    if (this.brushState.committed) {
      this.resetBrush();
      this.render();
      this.clickConsumedByMouseDown = true;
      return;
    }

    // Only start brush in chart area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;
    if (this.data.nullCount > 0 && x >= this.nullBarArea.x) return;

    // Find which bin we're starting on
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        this.brushState = {
          active: false,
          committed: false,
          sliding: false,
          slideStartX: 0,
          slideVisualOffset: 0,
          slideClickOffset: 0,
          startX: x,
          currentX: x,
          startBinIndex: -1,
          endBinIndex: -1,
          lastClickTime: now,
          lastClickX: x,
          lastClickY: y,
        };
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
      this.brushState.slideVisualOffset = 0;
      this.canvas.style.cursor = 'grab';
      this.render();
      return;
    }

    // Commit brush
    if (this.brushState.active) {
      if (this.brushState.startBinIndex !== -1 && this.brushState.endBinIndex !== -1) {
        this.brushState.active = false;
        this.brushState.committed = true;
        this.hoveredBin = null;
        this.hoveredNull = false;
        this.render();
        this.canvas.style.cursor = 'grab';
        this.updateBrushStats();
        this.options.onBrushCommit?.(this.column.name);
        return;
      } else {
        this.resetBrush();
        this.render();
        return;
      }
    }

    // Was just a click, reset brush state
    if (this.brushState.startX !== 0 && !this.brushState.committed) {
      this.resetBrush();
    }
  }

  /**
   * Handle keyboard events
   */
  protected handleKeyDown(_key: string): void {
    // Escape handling moved to global handler for LIFO behavior
  }

  /**
   * Update brush selection during mouse move
   */
  private updateBrush(x: number): void {
    const hasPotentialBrush = this.brushState.startX !== 0 && !this.brushState.committed;

    if (!hasPotentialBrush && !this.brushState.active) return;

    // Activate brush on first mouse move
    if (!this.brushState.active) {
      this.brushState.active = true;
      this.canvas.style.cursor = 'crosshair';
    }

    // Update current position
    this.brushState.currentX = x;

    // Calculate which bins overlap with the brush range
    const minX = Math.min(this.brushState.startX, x);
    const maxX = Math.max(this.brushState.startX, x);

    let newStartIdx = -1;
    let newEndIdx = -1;

    for (const pos of this.barPositions) {
      const barLeft = pos.x;
      const barRight = pos.x + pos.width;

      if (barLeft < maxX && barRight > minX) {
        if (newStartIdx === -1) {
          newStartIdx = pos.binIndex;
        }
        newEndIdx = pos.binIndex;
      }
    }

    this.brushState.startBinIndex = newStartIdx;
    this.brushState.endBinIndex = newEndIdx;

    this.render();
  }

  /**
   * Reset brush state
   */
  private resetBrush(): void {
    const wasCommitted = this.brushState.committed;

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
    this.options.onStatsChange?.(null);

    if (wasCommitted) {
      this.options.onBrushClear?.(this.column.name);
    }
  }

  /**
   * Slide the brush horizontally
   */
  private slideBrush(x: number): void {
    if (!this.brushState.sliding || !this.data) return;

    const brushLeftX = x - this.brushState.slideClickOffset;

    const binWidth = this.barPositions[0]?.width ?? 0;
    const binStep = binWidth + LAYOUT.barGap;
    const chartLeft = this.chartArea.x;

    const targetBinFloat = (brushLeftX - chartLeft) / binStep;
    const targetBinIndex = Math.round(targetBinFloat);

    const currentStartIdx = Math.min(
      this.brushState.startBinIndex,
      this.brushState.endBinIndex
    );
    const binShift = targetBinIndex - currentStartIdx;

    const snappedBrushLeft = chartLeft + targetBinIndex * binStep;
    this.brushState.slideVisualOffset = brushLeftX - snappedBrushLeft;

    if (binShift !== 0) {
      const brushSize = Math.abs(
        this.brushState.endBinIndex - this.brushState.startBinIndex
      );
      let newStart = this.brushState.startBinIndex + binShift;
      let newEnd = this.brushState.endBinIndex + binShift;

      const maxBin = this.data.bins.length - 1;
      if (newStart < 0) {
        newStart = 0;
        newEnd = brushSize;
      }
      if (newEnd > maxBin) {
        newEnd = maxBin;
        newStart = maxBin - brushSize;
      }

      const actualShift = newStart - this.brushState.startBinIndex;
      if (actualShift !== 0) {
        this.brushState.startBinIndex = newStart;
        this.brushState.endBinIndex = newEnd;
        const newSnappedLeft = chartLeft + newStart * binStep;
        this.brushState.slideVisualOffset = brushLeftX - newSnappedLeft;
        this.updateBrushStats();
      }
    }

    this.render();
  }

  /**
   * Update stats line to show current brush selection
   */
  private updateBrushStats(): void {
    if (!this.data || !this.formatContext) return;

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

      // Format date range
      let rangeStr: string;
      if (this.data.isNumericBinning) {
        rangeStr = startIdx === endIdx
          ? formatDateRangeForType(startBin.binStart, startBin.binEnd, this.column.type)
          : formatDateRangeForType(startBin.binStart, endBin.binEnd, this.column.type);
      } else {
        rangeStr = startIdx === endIdx
          ? formatDateRange(
              startBin.binStart,
              startBin.binEnd,
              this.data.interval,
              this.formatContext
            )
          : `${formatDateLabel(startBin.binStart, this.data.interval, this.formatContext)} – ${formatDateLabel(endBin.binStart, this.data.interval, this.formatContext)}`;
      }

      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span><br>` +
        `${rangeStr}<br>` +
        `<span class="stats-label">Count:</span> ${formatCount(rangeCount)} (${percent})`
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

    let x: number;
    let width: number;

    if (this.brushState.committed) {
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

      // Apply visual offset during sliding
      if (this.brushState.sliding) {
        x += this.brushState.slideVisualOffset;

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
      x = Math.min(this.brushState.startX, this.brushState.currentX);
      width = Math.abs(this.brushState.currentX - this.brushState.startX);

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
   * Wait for initial data to be loaded
   */
  public waitForData(): Promise<void> {
    return this.dataPromise;
  }

  /**
   * Get the current brush state for persistence
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
   */
  public setBrushState(
    state: { startBinIndex: number; endBinIndex: number } | null
  ): void {
    if (!state || !this.data) {
      return;
    }
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
   */
  public setSelectionState(state: {
    selectedBin: number | null;
    selectedNull: boolean;
  }): void {
    if (!this.data) return;

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
   * Clear the brush
   */
  public clearBrush(): void {
    this.resetBrush();
    this.render();
  }
}
