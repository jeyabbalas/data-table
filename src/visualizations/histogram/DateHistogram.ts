/**
 * DateHistogram - Canvas-based histogram visualization for date/timestamp columns
 *
 * Extends SharedHistogramBase with date-specific:
 * - Data fetching (interval detection, DATE_TRUNC/numeric binning)
 * - Axis label formatting (context-aware date labels)
 * - Filter emission (ISO date string range filters)
 * - Bin range formatting
 */

import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import {
  fetchDateHistogramData,
  fetchDateStats,
  fetchDateHistogramBins,
  fetchDateNumericBins,
  detectTimeInterval,
  adjustIntervalForMaxBins,
  estimateBinCount,
} from './DateHistogramData';
import type { DateHistogramData } from './DateHistogramData';
import {
  analyzeDateContext,
  formatDateLabel,
  formatDateRange,
  formatDateForType,
  formatDateRangeForType,
} from './DateFormatters';
import type { DateFormatContext } from './DateFormatters';
import {
  SharedHistogramBase,
  COLORS,
  FONTS,
  PADDING,
  LAYOUT,
} from './SharedHistogramBase';

// =========================================
// DateHistogram Class
// =========================================

export class DateHistogram extends SharedHistogramBase<DateHistogramData> {
  /** Date format context computed from data range */
  private formatContext: DateFormatContext | null = null;

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
   * Fetch date histogram data from DuckDB.
   * When crossfilter is active (own column has a filter), fetches both
   * background (excluding own filter) and foreground (all filters) data
   * with aligned bin structure.
   */
  async fetchData(): Promise<void> {
    if (this.destroyed) return;

    const seq = ++this.fetchSequence;

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
        const hasOwnFilter = allFilters.some((f) => f.column === this.column.name);
        const bgFilters = hasOwnFilter
          ? allFilters.filter((f) => f.column !== this.column.name)
          : [];
        const { tableName, bridge } = this.options;
        const col = this.column.name;

        const bgStats = await fetchDateStats(tableName, col, bgFilters, bridge);
        if (seq !== this.fetchSequence || this.destroyed) return;

        if (bgStats.count === 0 || bgStats.min === null || bgStats.max === null) {
          this.data = await fetchDateHistogramData(tableName, col, allFilters, bridge, maxBins);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else if (bgStats.min.getTime() === bgStats.max.getTime()) {
          this.data = await fetchDateHistogramData(tableName, col, allFilters, bridge, maxBins);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else {
          const initialInterval = detectTimeInterval(bgStats.min, bgStats.max);
          const interval = adjustIntervalForMaxBins(bgStats.min, bgStats.max, initialInterval, maxBins);
          const estimatedBins = estimateBinCount(bgStats.min, bgStats.max, interval);

          if (estimatedBins > maxBins) {
            const minMs = bgStats.min.getTime();
            const maxMs = bgStats.max.getTime();

            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchDateNumericBins(tableName, col, maxBins, minMs, maxMs, bgFilters, bridge),
              fetchDateNumericBins(tableName, col, maxBins, minMs, maxMs, allFilters, bridge),
              fetchDateStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              interval: 'day', isSingleValue: false, isNumericBinning: true,
            };
            this.data = {
              bins: fgBins, nullCount: fgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              interval: 'day', isSingleValue: false, isNumericBinning: true,
            };
          } else {
            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchDateHistogramBins(tableName, col, interval, bgFilters, bridge),
              fetchDateHistogramBins(tableName, col, interval, allFilters, bridge),
              fetchDateStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: bgStats.count + bgStats.nullCount,
              interval, isSingleValue: false, isNumericBinning: false,
            };
            this.data = {
              bins: fgBins, nullCount: fgStats.nullCount,
              min: bgStats.min, max: bgStats.max,
              total: fgStats.count + fgStats.nullCount,
              interval, isSingleValue: false, isNumericBinning: false,
            };
          }
        }
      } else {
        this.data = await fetchDateHistogramData(
          this.options.tableName, this.column.name, allFilters, this.options.bridge, maxBins
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;
      }

      const layoutData = this.backgroundData ?? this.data;
      if (layoutData && layoutData.min && layoutData.max) {
        this.formatContext = analyzeDateContext(layoutData.min, layoutData.max);
      } else {
        this.formatContext = null;
      }

      this.render();
    } catch (error) {
      if (seq !== this.fetchSequence) return;
      console.error(`[DateHistogram] Failed to fetch data for ${this.column.name}:`, error);
      this.data = null;
      this.backgroundData = null;
      this.formatContext = null;
      this.render();
    }
  }

  // =========================================
  // Axis Labels (date-specific)
  // =========================================

  /**
   * Draw axis labels with human-readable date format
   */
  protected drawAxisLabels(): void {
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

  // =========================================
  // Bin/Brush Range Formatting (date-specific)
  // =========================================

  /**
   * Format a single bin's range for hover/selection stats
   */
  protected formatBinRange(binIndex: number): string {
    if (!this.data || !this.formatContext) return '';
    const bin = this.data.bins[binIndex];
    if (!bin) return '';

    return this.data.isNumericBinning
      ? formatDateRangeForType(bin.binStart, bin.binEnd, this.column.type)
      : formatDateRange(
          bin.binStart,
          bin.binEnd,
          this.data.interval,
          this.formatContext
        );
  }

  /**
   * Format a brush range spanning startIdx to endIdx
   */
  protected formatBrushRange(startIdx: number, endIdx: number): string {
    if (!this.data || !this.formatContext) return '';
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];
    if (!startBin || !endBin) return '';

    if (this.data.isNumericBinning) {
      return startIdx === endIdx
        ? formatDateRangeForType(startBin.binStart, startBin.binEnd, this.column.type)
        : formatDateRangeForType(startBin.binStart, endBin.binEnd, this.column.type);
    } else {
      return startIdx === endIdx
        ? formatDateRange(
            startBin.binStart,
            startBin.binEnd,
            this.data.interval,
            this.formatContext
          )
        : `${formatDateLabel(startBin.binStart, this.data.interval, this.formatContext)} – ${formatDateLabel(endBin.binStart, this.data.interval, this.formatContext)}`;
    }
  }

  // =========================================
  // Filter Emission (date-specific)
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
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'range',
        min: startBin.binStart.toISOString(),
        max: endBin.binEnd.toISOString(),
      });
    }
  }
}
