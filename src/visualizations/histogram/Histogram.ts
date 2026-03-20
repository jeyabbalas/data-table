/**
 * Histogram - Canvas-based histogram visualization for numeric columns
 *
 * Extends SharedHistogramBase with numeric-specific:
 * - Data fetching (discrete/continuous modes)
 * - Axis label formatting (scientific notation, locale formatting)
 * - Filter emission (point/set/range filters)
 * - Bin range formatting
 */

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
import {
  SharedHistogramBase,
  COLORS,
  FONTS,
  PADDING,
  LAYOUT,
} from './SharedHistogramBase';

// =========================================
// Utility Functions (numeric-specific)
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

// =========================================
// Histogram Class
// =========================================

export class Histogram extends SharedHistogramBase<HistogramData> {
  constructor(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ) {
    super(container, column, options);
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

    const seq = ++this.fetchSequence;

    // Only reset brush/selection on initial load, not on filter updates
    if (!this.isFilterUpdate) {
      this.resetBrush();
      this.selectedBin = null;
      this.selectedNull = false;
    }

    try {
      const maxBins = this.options.maxBins ?? 15;
      const allFilters = this.options.filters;
      const hasAnyFilter = allFilters.length > 0;

      if (hasAnyFilter) {
        // Crossfilter: background = all filters except own column.
        const hasOwnFilter = allFilters.some((f) => f.column === this.column.name);
        const bgFilters = hasOwnFilter
          ? allFilters.filter((f) => f.column !== this.column.name)
          : [];
        const { tableName, bridge } = this.options;
        const col = this.column.name;

        const bgStats = await fetchColumnStats(tableName, col, bgFilters, bridge);
        if (seq !== this.fetchSequence || this.destroyed) return;

        if (bgStats.count === 0 || bgStats.min === null || bgStats.max === null) {
          this.data = await fetchHistogramData(tableName, col, maxBins, allFilters, bridge);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else if (bgStats.min === bgStats.max) {
          this.data = await fetchHistogramData(tableName, col, maxBins, allFilters, bridge);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else {
          const DISCRETE_THRESHOLD = 5;
          if (bgStats.distinctCount <= DISCRETE_THRESHOLD) {
            const bgDiscreteValues = await fetchDiscreteValues(tableName, col, bgFilters, bridge);
            if (seq !== this.fetchSequence || this.destroyed) return;
            const discreteVals = bgDiscreteValues.map((dv) => dv.value);

            const [fgDiscreteBins, fgStats] = await Promise.all([
              fetchDiscreteBins(tableName, col, discreteVals, allFilters, bridge),
              fetchColumnStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            const bgBins = bgDiscreteValues.map((dv) => ({
              x0: dv.value, x1: dv.value, count: Number(dv.count),
            }));

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              isSingleValue: false, isDiscrete: true,
            };
            this.data = {
              bins: fgDiscreteBins, nullCount: fgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              isSingleValue: false, isDiscrete: true,
            };
          } else {
            const iqr = bgStats.q1 !== null && bgStats.q3 !== null
              ? bgStats.q3 - bgStats.q1 : 0;
            const numBins = calculateOptimalBins(bgStats.min, bgStats.max, bgStats.count, iqr, maxBins);

            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchHistogramBins(tableName, col, bgStats.min, bgStats.max, numBins, bgFilters, bridge),
              fetchHistogramBins(tableName, col, bgStats.min, bgStats.max, numBins, allFilters, bridge),
              fetchColumnStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              isSingleValue: false, isDiscrete: false,
            };
            this.data = {
              bins: fgBins, nullCount: fgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              isSingleValue: false, isDiscrete: false,
            };
          }
        }
      } else {
        this.data = await fetchHistogramData(
          this.options.tableName, this.column.name, maxBins, allFilters, this.options.bridge
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;
      }

      this.render();
    } catch (error) {
      if (seq !== this.fetchSequence) return; // Stale error, discard
      console.error(`[Histogram] Failed to fetch data for ${this.column.name}:`, error);
      this.data = null;
      this.backgroundData = null;
      this.render();
    }
  }

  // =========================================
  // Axis Labels (numeric-specific)
  // =========================================

  /**
   * Draw axis labels (min/max always visible, hover stats shown via tooltip)
   */
  protected drawAxisLabels(): void {
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

  // =========================================
  // Bin/Brush Range Formatting (numeric-specific)
  // =========================================

  /**
   * Format a single bin's range for hover/selection stats
   */
  protected formatBinRange(binIndex: number): string {
    if (!this.data) return '';
    const bin = this.data.bins[binIndex];
    if (!bin) return '';

    // Show single value without range for single-value or discrete columns
    return (this.data.isSingleValue || this.data.isDiscrete)
      ? formatAxisValue(bin.x0)
      : `${formatAxisValue(bin.x0)} – ${formatAxisValue(bin.x1)}`;
  }

  /**
   * Format a brush range spanning startIdx to endIdx
   */
  protected formatBrushRange(startIdx: number, endIdx: number): string {
    if (!this.data) return '';
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];
    if (!startBin || !endBin) return '';

    // Show single value without range for single-value or discrete columns
    return (this.data.isSingleValue || this.data.isDiscrete)
      ? formatAxisValue(startBin.x0)
      : `${formatAxisValue(startBin.x0)} – ${formatAxisValue(endBin.x1)}`;
  }

  // =========================================
  // Filter Emission (numeric-specific)
  // =========================================

  /**
   * Emit a range filter based on current brush bin indices
   */
  protected emitBrushFilter(): void {
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
}
