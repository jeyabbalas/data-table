/**
 * TimeHistogram - Canvas-based histogram visualization for TIME columns
 *
 * Extends SharedHistogramBase with time-specific:
 * - Data fetching (interval detection, numeric binning fallback)
 * - Axis label formatting (12-hour time format)
 * - Filter emission (time string range filters)
 * - Bin range formatting
 */

import type { VisualizationOptions } from '../BaseVisualization';
import type { ColumnSchema } from '../../core/types';
import {
  fetchTimeHistogramData,
  secondsToTimeString,
  fetchTimeStats,
  fetchTimeHistogramBins,
  fetchTimeNumericBins,
  detectTimeIntervalForTime,
  adjustIntervalForMaxBinsTime,
  estimateBinCountForTime,
} from './TimeHistogramData';
import type { TimeHistogramData } from './TimeHistogramData';
import { formatTimeOnlyLabel, formatTimeOnlyLabelNumeric, formatTimeOnlyRange, formatTimeOnlyRangeNumeric } from './DateFormatters';
import {
  SharedHistogramBase,
  COLORS,
  FONTS,
  PADDING,
  LAYOUT,
} from './SharedHistogramBase';

// =========================================
// TimeHistogram Class
// =========================================

export class TimeHistogram extends SharedHistogramBase<TimeHistogramData> {
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
   * Fetch time histogram data from DuckDB.
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

        const bgStats = await fetchTimeStats(tableName, col, bgFilters, bridge);
        if (seq !== this.fetchSequence || this.destroyed) return;

        if (bgStats.count === 0 || bgStats.minSeconds === null || bgStats.maxSeconds === null) {
          this.data = await fetchTimeHistogramData(tableName, col, allFilters, bridge, maxBins);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else if (bgStats.minSeconds === bgStats.maxSeconds) {
          this.data = await fetchTimeHistogramData(tableName, col, allFilters, bridge, maxBins);
          if (seq !== this.fetchSequence || this.destroyed) return;
          this.backgroundData = null;
        } else {
          const initialInterval = detectTimeIntervalForTime(bgStats.minSeconds, bgStats.maxSeconds);
          const interval = adjustIntervalForMaxBinsTime(bgStats.minSeconds, bgStats.maxSeconds, initialInterval, maxBins);
          const estimatedBins = estimateBinCountForTime(bgStats.minSeconds, bgStats.maxSeconds, interval);

          if (estimatedBins > maxBins) {
            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchTimeNumericBins(tableName, col, maxBins, bgStats.minSeconds, bgStats.maxSeconds, bgFilters, bridge),
              fetchTimeNumericBins(tableName, col, maxBins, bgStats.minSeconds, bgStats.maxSeconds, allFilters, bridge),
              fetchTimeStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              minSeconds: bgStats.minSeconds, maxSeconds: bgStats.maxSeconds,
              total: bgStats.count + bgStats.nullCount,
              interval: 'hour', isSingleValue: false, isNumericBinning: true,
            };
            this.data = {
              bins: fgBins, nullCount: fgStats.nullCount,
              minSeconds: bgStats.minSeconds, maxSeconds: bgStats.maxSeconds,
              total: fgStats.count + fgStats.nullCount,
              interval: 'hour', isSingleValue: false, isNumericBinning: true,
            };
          } else {
            const [bgBins, fgBins, fgStats] = await Promise.all([
              fetchTimeHistogramBins(tableName, col, interval, bgFilters, bridge),
              fetchTimeHistogramBins(tableName, col, interval, allFilters, bridge),
              fetchTimeStats(tableName, col, allFilters, bridge),
            ]);
            if (seq !== this.fetchSequence || this.destroyed) return;

            this.backgroundData = {
              bins: bgBins, nullCount: bgStats.nullCount,
              minSeconds: bgStats.minSeconds, maxSeconds: bgStats.maxSeconds,
              total: bgStats.count + bgStats.nullCount,
              interval, isSingleValue: false, isNumericBinning: false,
            };
            this.data = {
              bins: fgBins, nullCount: fgStats.nullCount,
              minSeconds: bgStats.minSeconds, maxSeconds: bgStats.maxSeconds,
              total: fgStats.count + fgStats.nullCount,
              interval, isSingleValue: false, isNumericBinning: false,
            };
          }
        }
      } else {
        this.data = await fetchTimeHistogramData(
          this.options.tableName, this.column.name, allFilters, this.options.bridge, maxBins
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;
      }

      this.render();
    } catch (error) {
      if (seq !== this.fetchSequence) return;
      console.error(`[TimeHistogram] Failed to fetch data for ${this.column.name}:`, error);
      this.data = null;
      this.backgroundData = null;
      this.render();
    }
  }

  // =========================================
  // Axis Labels (time-specific)
  // =========================================

  /**
   * Draw axis labels with human-readable time format
   */
  protected drawAxisLabels(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const labelY = this.height - 3;

    ctx.font = FONTS.axis;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.axisText;

    // Handle single value case
    if (this.data.isSingleValue && this.data.bins.length > 0) {
      ctx.textAlign = 'center';
      const label = this.data.isNumericBinning
        ? formatTimeOnlyLabelNumeric(this.data.bins[0].binStartSeconds)
        : formatTimeOnlyLabel(
            this.data.bins[0].binStartSeconds,
            this.data.interval
          );
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    } else if (this.data.bins.length > 0) {
      // Normal case: min on left, max on right
      const firstBin = this.data.bins[0];
      const lastBin = this.data.bins[this.data.bins.length - 1];

      ctx.textAlign = 'left';
      const minLabel = this.data.isNumericBinning
        ? formatTimeOnlyLabelNumeric(firstBin.binStartSeconds)
        : formatTimeOnlyLabel(
            firstBin.binStartSeconds,
            this.data.interval
          );
      ctx.fillText(minLabel, PADDING.left, labelY);

      ctx.textAlign = 'right';
      const maxLabel = this.data.isNumericBinning
        ? formatTimeOnlyLabelNumeric(lastBin.binEndSeconds)
        : formatTimeOnlyLabel(
            lastBin.binStartSeconds,
            this.data.interval
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
  // Bin/Brush Range Formatting (time-specific)
  // =========================================

  /**
   * Format a single bin's range for hover/selection stats
   */
  protected formatBinRange(binIndex: number): string {
    if (!this.data) return '';
    const bin = this.data.bins[binIndex];
    if (!bin) return '';

    return this.data.isNumericBinning
      ? formatTimeOnlyRangeNumeric(bin.binStartSeconds, bin.binEndSeconds)
      : formatTimeOnlyRange(
          bin.binStartSeconds,
          bin.binEndSeconds,
          this.data.interval
        );
  }

  /**
   * Format a brush range spanning startIdx to endIdx
   */
  protected formatBrushRange(startIdx: number, endIdx: number): string {
    if (!this.data) return '';
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];
    if (!startBin || !endBin) return '';

    if (this.data.isNumericBinning) {
      return startIdx === endIdx
        ? formatTimeOnlyRangeNumeric(startBin.binStartSeconds, startBin.binEndSeconds)
        : formatTimeOnlyRangeNumeric(startBin.binStartSeconds, endBin.binEndSeconds);
    } else {
      return startIdx === endIdx
        ? formatTimeOnlyRange(
            startBin.binStartSeconds,
            startBin.binEndSeconds,
            this.data.interval
          )
        : `${formatTimeOnlyLabel(startBin.binStartSeconds, this.data.interval)} – ${formatTimeOnlyLabel(endBin.binStartSeconds, this.data.interval)}`;
    }
  }

  // =========================================
  // Filter Emission (time-specific)
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
        min: secondsToTimeString(startBin.binStartSeconds),
        max: secondsToTimeString(endBin.binEndSeconds),
      });
    }
  }

  // =========================================
  // Time-specific Public Methods
  // =========================================

  /**
   * Get data min/max for display purposes
   */
  public getMinMaxDisplay(): { min: string; max: string } | null {
    if (!this.data || this.data.minSeconds === null || this.data.maxSeconds === null) {
      return null;
    }
    return {
      min: secondsToTimeString(this.data.minSeconds),
      max: secondsToTimeString(this.data.maxSeconds),
    };
  }
}
