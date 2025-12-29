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
import { fetchHistogramData } from './HistogramData';
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

/** Double-click detection constants */
const DOUBLE_CLICK_THRESHOLD = 300; // ms
const DOUBLE_CLICK_DISTANCE = 20; // pixels

// =========================================
// Utility Functions
// =========================================

/**
 * Format a number for axis labels with appropriate abbreviation
 * Prefers 1 decimal place, shows 2 only if needed, never more than 2
 */
function formatAxisValue(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1e9) {
    return (value / 1e9).toFixed(1) + 'B';
  }
  if (abs >= 1e6) {
    return (value / 1e6).toFixed(1) + 'M';
  }
  if (abs >= 1e3) {
    return (value / 1e3).toFixed(1) + 'K';
  }
  if (abs < 0.01 && abs > 0) {
    return value.toExponential(1);
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  // Round to 1 decimal, but show 2 if needed for precision
  const rounded1 = Math.round(value * 10) / 10;
  if (rounded1 === value || Math.abs(rounded1 - value) < 0.001) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
  // Value needs 2 decimals for precision
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
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
  // Note: backgroundData for crossfilter will be added in Phase 5

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
   * Fetch histogram data from DuckDB
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    // Clear any existing brush/selection state before fetching new data
    // This ensures stale brush indices don't point to wrong bins after data refresh
    this.resetBrush();
    this.selectedBin = null;
    this.selectedNull = false;

    try {
      // Use configured maxBins (default 20) - algorithm calculates optimal
      // bins using Freedman-Diaconis/Sturges and clamps to this max
      const maxBins = this.options.maxBins ?? 20;

      this.data = await fetchHistogramData(
        this.options.tableName,
        this.column.name,
        maxBins,
        this.options.filters,
        this.options.bridge
      );
      this.render();
    } catch (error) {
      console.error(
        `[Histogram] Failed to fetch data for ${this.column.name}:`,
        error
      );
      this.data = null;
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
   */
  private calculateBarPositions(): void {
    if (!this.data) return;

    const numBins = this.data.bins.length;
    if (numBins === 0) {
      this.barPositions = [];
      return;
    }

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
        // Selected bar: dark color
        fillColor = COLORS.barHover;
      } else if (hasSelection) {
        // Other bars when one is selected: faded
        fillColor = COLORS.barFaded;
      } else if (isThisHovered) {
        // Hover takes precedence
        fillColor = COLORS.barHover;
      } else if (hasBrush) {
        // Brush is active: inside = dark, outside = faded
        fillColor = isInsideBrush ? COLORS.barHover : COLORS.barFaded;
      } else if (isAnyHovered) {
        // Regular hover behavior
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

    // Determine color based on selection, hover, and brush state
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;
    const hasSelection = this.selectedBin !== null || this.selectedNull;
    const hasBrush = this.brushState.active || this.brushState.committed;

    let fillColor: string;
    if (this.selectedNull) {
      // Null bar is selected: dark color
      fillColor = COLORS.nullHover;
    } else if (hasSelection) {
      // Other bar is selected: faded
      fillColor = COLORS.nullFaded;
    } else if (this.hoveredNull) {
      fillColor = COLORS.nullHover;
    } else if (hasBrush) {
      // Null bar is always "outside" the brush (brush only covers histogram bins)
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
    } else {
      // Normal case: min on left, max on right
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

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Handle mouse movement - detect which bar is under cursor and update stats
   */
  protected handleMouseMove(x: number, y: number): void {
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

    // If brush is committed, skip hover logic to preserve brush stats
    if (this.brushState.committed) {
      if (this.isInsideBrush(x, y)) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'default';
      }
      // Skip all hover logic when brush is committed
      return;
    }

    // If a bar is selected, skip hover logic to preserve selected bar stats
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

    // Update cursor based on hover state
    const isHoveringBar = this.hoveredBin !== null || this.hoveredNull;
    this.canvas.style.cursor = isHoveringBar ? 'pointer' : 'default';

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
          // Show single value without range for single-value columns
          const rangeStr = this.data.isSingleValue
            ? formatAxisValue(bin.x0)
            : `${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}`;
          const count = formatCount(bin.count);
          const percent = formatPercent(bin.count / this.data.total);

          this.options.onStatsChange?.(
            `<span class="stats-label">Bin:</span> ${rangeStr}<br>` +
            `<span class="stats-label">Count:</span> ${count} (${percent})`
          );
        }
      } else if (this.hoveredNull && this.data) {
        const count = formatCount(this.data.nullCount);
        const percent = formatPercent(this.data.nullCount / this.data.total);

        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span> null<br>` +
          `<span class="stats-label">Count:</span> ${count} (${percent})`
        );
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
   * Handle click - select bar (freeze stats) instead of creating filter
   */
  protected handleClick(x: number, y: number): void {
    // If handleMouseDown already handled this click (cleared brush), skip
    if (this.clickConsumedByMouseDown) {
      this.clickConsumedByMouseDown = false;
      return;
    }

    if (!this.data) return;

    // If brush is active or committed, clicks are handled by mousedown/mouseup
    if (this.brushState.committed || this.brushState.active) return;

    // Skip if brush was just started (will be handled by mouseup)
    if (this.brushState.startBinIndex !== -1) return;

    // If something is already selected, any click clears it first
    // (Cannot select a different bar while one is selected - must deselect first)
    if (this.selectedBin !== null || this.selectedNull) {
      this.clearSelection();
      return;
    }

    // Check if click is in the chart area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;

    // Check null bar - select it
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
      // Notify callback that selection changed
      this.options.onSelectionChange?.(this.column.name, true);
      return;
    }

    // Check histogram bars - select bar (only if it has data)
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        // Only allow selection if bar has data
        const bin = this.data.bins[pos.binIndex];
        if (bin && bin.count > 0) {
          this.selectedBin = pos.binIndex;
          this.selectedNull = false;
          this.hoveredBin = null;
          this.hoveredNull = false;
          this.render();
          this.updateSelectedStats();
          // Notify callback that selection changed
          this.options.onSelectionChange?.(this.column.name, true);
        }
        return; // Still return to prevent further processing
      }
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
        // Show single value without range for single-value columns
        const rangeStr = this.data.isSingleValue
          ? formatAxisValue(bin.x0)
          : `${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}`;
        const count = formatCount(bin.count);
        const percent = formatPercent(bin.count / this.data.total);
        this.options.onStatsChange?.(
          `<span class="stats-label">Bin:</span> ${rangeStr}<br>` +
          `<span class="stats-label">Count:</span> ${count} (${percent})`
        );
      }
    } else if (this.selectedNull) {
      const count = formatCount(this.data.nullCount);
      const percent = formatPercent(this.data.nullCount / this.data.total);
      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span> null<br>` +
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
    // Notify callback if selection was cleared
    if (hadSelection) {
      this.options.onSelectionChange?.(this.column.name, false);
    }
  }

  /**
   * Handle mouse leave - clear hover states
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';
    // Restore default stats (unless brush is committed or bar is selected - keep showing stats)
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
   * Handle mouse down - start potential brush selection or start sliding
   */
  protected handleMouseDown(x: number, y: number): void {
    if (!this.data || this.data.bins.length === 0) return;

    const now = Date.now();

    // If a bar is selected, don't start a brush - let handleClick handle toggle
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

    // If clicking outside committed brush, clear it (don't start a new brush on this click)
    if (this.brushState.committed) {
      this.resetBrush();
      this.render();
      this.clickConsumedByMouseDown = true; // Prevent handleClick from selecting a bar
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
      // Show single value without range for single-value columns
      const rangeStr = this.data.isSingleValue
        ? formatAxisValue(startBin.x0)
        : `${formatAxisValue(startBin.x0)} – ${formatAxisValue(endBin.x1)}`;

      this.options.onStatsChange?.(
        `<span class="stats-label">Bin:</span> ${rangeStr}<br>` +
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
