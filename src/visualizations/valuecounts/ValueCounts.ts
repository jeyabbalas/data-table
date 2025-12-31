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
import { fetchValueCountsData } from './ValueCountsData';
import type { ValueCountsData } from './ValueCountsData';

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

/**
 * Truncate text to fit within width, returns empty string if can't fit
 */
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (maxWidth <= 0) return '';

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '...';
  let truncated = text;

  while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return truncated.length > 0 ? truncated + ellipsis : '';
}

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
  otherCount?: number;
}

// =========================================
// ValueCounts Class
// =========================================

export class ValueCounts extends BaseVisualization {
  // Data
  private data: ValueCountsData | null = null;

  // Promise for initial data load (used by waitForData)
  private dataPromise: Promise<void>;

  // Interaction state - index into renderSegments array
  private hoveredSegment: number | null = null;

  // Selection state (single segment click-to-select)
  private selectedSegment: number | null = null;

  // Computed layout (updated on render)
  private barArea = { x: 0, y: 0, width: 0, height: 0 };
  private segmentPositions: Array<{ x: number; width: number; index: number }> = [];

  // Combined segments including null for rendering
  private renderSegments: RenderSegment[] = [];

  // Top N category values for exclusion filter (used when clicking "Other")
  private topCategoryValues: string[] = [];

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
   * Fetch value counts data from DuckDB
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    // Reset selection when fetching new data
    this.selectedSegment = null;

    this.data = await fetchValueCountsData(
      this.options.tableName,
      this.column.name,
      this.options.filters,
      this.options.bridge,
      MAX_CATEGORIES
    );

    this.render();
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

    // Handle empty state
    if (this.data.segments.length === 0 && this.data.nullCount === 0) {
      this.drawEmptyState();
      return;
    }

    // Handle all unique values special case
    if (this.data.isAllUnique && this.data.segments.length > 0) {
      this.drawAllUniqueState();
      return;
    }

    // Build combined segments array including null
    this.buildRenderSegments();

    // Calculate layout
    this.calculateLayout();

    // Draw components
    this.drawSegments();
    this.drawSelectionIndicators();
  }

  /**
   * Build the render segments array combining categories and null
   */
  private buildRenderSegments(): void {
    if (!this.data) {
      this.renderSegments = [];
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
    this.topCategoryValues = this.data.segments
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
   * Calculate positions for each segment (including null)
   */
  private calculateSegmentPositions(): void {
    if (this.renderSegments.length === 0) {
      this.segmentPositions = [];
      return;
    }

    const positions: Array<{ x: number; width: number; index: number }> = [];
    const totalCount = this.renderSegments.reduce((sum, seg) => sum + seg.count, 0);

    if (totalCount === 0) {
      this.segmentPositions = [];
      return;
    }

    let currentX = this.barArea.x;
    const numSegments = this.renderSegments.length;
    const totalBorderWidth = (numSegments - 1) * LAYOUT.segmentBorderWidth;
    const availableWidth = this.barArea.width - totalBorderWidth;

    for (let i = 0; i < numSegments; i++) {
      const segment = this.renderSegments[i];
      const proportion = segment.count / totalCount;
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
   * Draw all segments including null
   */
  private drawSegments(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const hasHover = this.hoveredSegment !== null;
    const hasSelection = this.selectedSegment !== null;
    const numSegments = this.renderSegments.length;

    for (let i = 0; i < this.segmentPositions.length; i++) {
      const pos = this.segmentPositions[i];
      const segment = this.renderSegments[i];
      const isHovered = this.hoveredSegment === i;
      const isSelected = this.selectedSegment === i;

      // Determine fill color based on segment type and state
      let fillColor: string;
      if (segment.isNull) {
        // Null segment - amber
        if (isSelected) {
          fillColor = COLORS.nullHover;
        } else if (hasSelection && !isSelected) {
          fillColor = COLORS.nullFaded;
        } else if (isHovered) {
          fillColor = COLORS.nullHover;
        } else if (hasHover && !isHovered) {
          fillColor = COLORS.nullFaded;
        } else {
          fillColor = COLORS.nullFill;
        }
      } else if (segment.isOther) {
        // "Other" segment - gray
        if (isSelected) {
          fillColor = COLORS.otherHover;
        } else if (hasSelection && !isSelected) {
          fillColor = COLORS.otherFaded;
        } else if (isHovered) {
          fillColor = COLORS.otherHover;
        } else if (hasHover && !isHovered) {
          fillColor = COLORS.otherFaded;
        } else {
          fillColor = COLORS.otherFill;
        }
      } else {
        // Regular category - blue (consistent color, not gradient)
        if (isSelected) {
          fillColor = COLORS.barHover;
        } else if (hasSelection && !isSelected) {
          fillColor = COLORS.barFaded;
        } else if (isHovered) {
          fillColor = COLORS.barHover;
        } else if (hasHover && !isHovered) {
          fillColor = COLORS.barFaded;
        } else {
          fillColor = COLORS.barFill;
        }
      }

      // Draw segment with rounded corners only on ends
      const isFirst = i === 0;
      const isLast = i === numSegments - 1;

      this.drawSegmentRect(
        pos.x,
        this.barArea.y,
        pos.width,
        this.barArea.height,
        fillColor,
        isFirst,
        isLast
      );

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
      this.drawSegmentLabel(pos, segment);
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
    if (!this.data || this.selectedSegment === null) return;

    const ctx = this.ctx;
    const indicatorY =
      this.barArea.y + this.barArea.height + LAYOUT.selectionIndicatorGap;

    const pos = this.segmentPositions[this.selectedSegment];
    if (!pos) return;

    const segment = this.renderSegments[this.selectedSegment];
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
      value: `All unique (${formatCount(this.data.distinctCount)})`,
      count: this.data.distinctCount,
      isOther: false,
      isNull: false,
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

    // If a segment is selected, skip hover logic to preserve selected stats
    if (this.selectedSegment !== null) {
      this.canvas.style.cursor = 'default';
      return;
    }

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

      // Update stats line with formatted HTML
      this.updateHoverStats();
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
        const count = formatCount(segment.count);
        const percent = formatPercent(segment.count / this.data.total);

        let categoryLabel: string;
        if (segment.isNull) {
          categoryLabel = 'null';
        } else if (segment.isOther) {
          categoryLabel = `Other (${segment.otherCount} values)`;
        } else {
          // Truncate long category names in stats
          categoryLabel = segment.value.length > 30
            ? segment.value.substring(0, 27) + '...'
            : segment.value;
        }

        this.options.onStatsChange?.(
          `<span class="stats-label">Category:</span><br>` +
          `${categoryLabel}<br>` +
          `<span class="stats-label">Count:</span> ${count} (${percent})`
        );
      }
    } else {
      // Restore default stats
      this.options.onStatsChange?.(null);
    }
  }

  /**
   * Handle click - select segment and create filter
   */
  protected handleClick(x: number, y: number): void {
    if (!this.data) return;

    // If something is already selected, any click clears it first
    if (this.selectedSegment !== null) {
      this.clearSelection();
      return;
    }

    // Check if click is in the bar area
    if (y < PADDING.top || y > this.height - PADDING.bottom) return;

    // Check all segments
    for (const pos of this.segmentPositions) {
      if (x >= pos.x && x <= pos.x + pos.width) {
        const segment = this.renderSegments[pos.index];
        if (segment && segment.count > 0) {
          // Visual selection
          this.selectedSegment = pos.index;
          this.hoveredSegment = null;
          this.render();
          this.updateSelectedStats();
          this.options.onSelectionChange?.(this.column.name, true);

          // Create filter for segment
          this.createFilterForSegment(segment);
        }
        return;
      }
    }
  }

  /**
   * Create and emit filter for clicked segment
   */
  private createFilterForSegment(segment: RenderSegment): void {
    if (segment.isNull) {
      // Null filter
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'null',
        value: null,
      });
    } else if (segment.isOther) {
      // Exclusion filter - NOT IN top N values
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'not-set',
        value: this.topCategoryValues,
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
   * Update stats line to show selected segment info
   */
  private updateSelectedStats(): void {
    if (!this.data || this.selectedSegment === null) return;

    const segment = this.renderSegments[this.selectedSegment];
    if (segment) {
      const count = formatCount(segment.count);
      const percent = formatPercent(segment.count / this.data.total);

      let categoryLabel: string;
      if (segment.isNull) {
        categoryLabel = 'null';
      } else if (segment.isOther) {
        categoryLabel = `Other (${segment.otherCount} values)`;
      } else {
        categoryLabel = segment.value.length > 30
          ? segment.value.substring(0, 27) + '...'
          : segment.value;
      }

      this.options.onStatsChange?.(
        `<span class="stats-label">Category:</span><br>` +
        `${categoryLabel}<br>` +
        `<span class="stats-label">Count:</span> ${count} (${percent})`
      );
    }
  }

  /**
   * Handle mouse leave - clear hover states
   */
  protected handleMouseLeave(): void {
    this.canvas.style.cursor = 'default';

    // Restore default stats (unless segment is selected)
    if (this.selectedSegment === null) {
      this.options.onStatsChange?.(null);
    }

    if (this.hoveredSegment !== null) {
      this.hoveredSegment = null;
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
   * Note: selectedSegment is index into renderSegments, not data.segments
   */
  public getSelectionState(): {
    selectedSegment: number | null;
    selectedNull: boolean;
  } {
    // Check if selected segment is the null segment
    const isNullSelected = this.selectedSegment !== null &&
      this.renderSegments[this.selectedSegment]?.isNull === true;

    return {
      selectedSegment: this.selectedSegment,
      selectedNull: isNullSelected,
    };
  }

  /**
   * Restore selection state from saved state
   * Call after data is loaded (fetchData completed)
   */
  public setSelectionState(state: {
    selectedSegment: number | null;
    selectedNull: boolean;
  }): void {
    if (!this.data) return;

    // Rebuild render segments if not already built
    if (this.renderSegments.length === 0) {
      this.buildRenderSegments();
    }

    // Validate selectedSegment is within bounds
    if (
      state.selectedSegment !== null &&
      (state.selectedSegment < 0 || state.selectedSegment >= this.renderSegments.length)
    ) {
      return;
    }

    this.selectedSegment = state.selectedSegment;
    this.render();
    if (this.selectedSegment !== null) {
      this.updateSelectedStats();
    }
  }

  /**
   * Clear segment selection (public method for external LIFO handling)
   */
  public clearSelection(): void {
    const hadSelection = this.selectedSegment !== null;
    this.selectedSegment = null;
    this.options.onStatsChange?.(null);
    this.render();
    if (hadSelection) {
      this.options.onSelectionChange?.(this.column.name, false);
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
