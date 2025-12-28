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
import type { HistogramData, HistogramBin } from './HistogramData';

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
};

/** Typography settings */
const FONTS = {
  axis: '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/** Layout padding */
const PADDING = {
  top: 3,
  right: 4,
  bottom: 18,
  left: 4,
};

/** Spacing and sizing constants */
const LAYOUT = {
  nullBarGap: 4, // Gap between histogram and null bar
  barGap: 1, // Gap between histogram bars
  barRadius: 2, // Rounded corner radius
  minBarHeight: 2, // Minimum visible bar height
};

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

  // Interaction state
  private hoveredBin: number | null = null;
  private hoveredNull: boolean = false;

  // Computed layout (updated on render)
  private chartArea = { x: 0, y: 0, width: 0, height: 0 };
  private nullBarArea = { x: 0, y: 0, width: 0, height: 0 };
  private barPositions: Array<{ x: number; width: number; binIndex: number }> =
    [];

  // Tooltip element
  private tooltip: HTMLElement;

  constructor(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ) {
    super(container, column, options);

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'histogram-tooltip';
    this.tooltip.style.cssText = `
      position: absolute;
      background: #1e293b;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font: 500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 1000;
    `;
    document.body.appendChild(this.tooltip);

    // Fetch data immediately
    this.fetchData();
  }

  // =========================================
  // Data Fetching
  // =========================================

  /**
   * Fetch histogram data from DuckDB
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

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
    this.drawAxisLabels();
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
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;

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

      // Determine color based on hover state
      const isThisHovered = this.hoveredBin === i;
      let fillColor: string;
      if (isThisHovered) {
        fillColor = COLORS.barHover;
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

    // Determine color based on hover state
    const isAnyHovered = this.hoveredBin !== null || this.hoveredNull;
    let fillColor: string;
    if (this.hoveredNull) {
      fillColor = COLORS.nullHover;
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
   * Draw axis labels (min/max always visible, hover stats shown via tooltip)
   */
  private drawAxisLabels(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const labelY = this.height - 3; // Position near bottom

    ctx.font = FONTS.axis;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.axisText;

    // Min label (left aligned)
    ctx.textAlign = 'left';
    const minLabel = formatAxisValue(this.data.min);
    ctx.fillText(minLabel, PADDING.left, labelY);

    // Max label (right aligned, before null bar if present)
    ctx.textAlign = 'right';
    const maxLabel = formatAxisValue(this.data.max);
    const maxX = this.data.nullCount > 0
      ? this.nullBarArea.x - LAYOUT.nullBarGap
      : this.width - PADDING.right;
    ctx.fillText(maxLabel, maxX, labelY);

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
  // Tooltip
  // =========================================

  /**
   * Show tooltip with bin information
   */
  private showTooltip(
    content: string,
    barCenterX: number,
    _barTopY: number
  ): void {
    this.tooltip.innerHTML = content;
    this.tooltip.style.opacity = '1';

    // Position below the chart
    const rect = this.canvas.getBoundingClientRect();
    const chartBottom = rect.top + this.chartArea.y + this.chartArea.height;
    this.tooltip.style.left = `${rect.left + barCenterX}px`;
    this.tooltip.style.top = `${chartBottom + 4}px`;
    this.tooltip.style.transform = 'translate(-50%, 0)';
  }

  /**
   * Hide the tooltip
   */
  private hideTooltip(): void {
    this.tooltip.style.opacity = '0';
  }

  // =========================================
  // Mouse Interaction
  // =========================================

  /**
   * Handle mouse movement - detect which bar is under cursor and show tooltip
   */
  protected handleMouseMove(x: number, y: number): void {
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

      // Show or hide tooltip
      if (this.hoveredBin !== null && this.data) {
        const bin = this.data.bins[this.hoveredBin];
        const pos = this.barPositions[this.hoveredBin];
        if (bin && pos) {
          const range = `[${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}]`;
          const count = formatCount(bin.count);
          const percent = formatPercent(bin.count / this.data.total);
          const content = `${range}<br><b>${count}</b> (${percent})`;

          // Calculate bar top position
          const maxCount = Math.max(...this.data.bins.map((b) => b.count), 1);
          const heightRatio = bin.count / maxCount;
          const barHeight = Math.max(
            bin.count > 0 ? LAYOUT.minBarHeight : 0,
            heightRatio * this.chartArea.height
          );
          const barTopY = this.chartArea.y + this.chartArea.height - barHeight;

          this.showTooltip(content, pos.x + pos.width / 2, barTopY);
        }
      } else if (this.hoveredNull && this.data) {
        const count = formatCount(this.data.nullCount);
        const percent = formatPercent(this.data.nullCount / this.data.total);
        const content = `[null]<br><b>${count}</b> (${percent})`;

        // Calculate null bar top position
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
        const barTopY = this.nullBarArea.y + this.nullBarArea.height - barHeight;

        this.showTooltip(
          content,
          this.nullBarArea.x + this.nullBarArea.width / 2,
          barTopY
        );
      } else {
        this.hideTooltip();
      }
    }
  }

  /**
   * Handle click - log clicked bar info (filtering in Task 4.4)
   */
  protected handleClick(x: number, y: number): void {
    if (!this.data) return;

    // Check if click is in the chart area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;

    // Check null bar
    if (
      this.data.nullCount > 0 &&
      x >= this.nullBarArea.x &&
      x <= this.nullBarArea.x + this.nullBarArea.width
    ) {
      console.log(
        `[Histogram] Clicked null bar on "${this.column.name}": ${this.data.nullCount} nulls`
      );
      return;
    }

    // Check histogram bars
    for (const pos of this.barPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        const bin = this.data.bins[pos.binIndex];
        if (bin) {
          console.log(
            `[Histogram] Clicked bin ${pos.binIndex} on "${this.column.name}": ` +
              `[${bin.x0}, ${bin.x1}) = ${bin.count} rows`
          );
        }
        return;
      }
    }
  }

  /**
   * Handle mouse leave - clear hover states and hide tooltip
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';
    this.hideTooltip();
    if (this.hoveredBin !== null || this.hoveredNull) {
      this.hoveredBin = null;
      this.hoveredNull = false;
      this.render();
    }
  }

  /**
   * Override destroy to clean up tooltip element
   */
  destroy(): void {
    // Remove tooltip from DOM
    if (this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    // Call parent destroy
    super.destroy();
  }
}
