/**
 * DateHistogram - Canvas-based histogram visualization for date/timestamp columns
 *
 * Extends SharedHistogramBase with date-specific:
 * - Data fetching (interval detection, DATE_TRUNC/numeric binning)
 * - Axis label formatting (context-aware date labels)
 * - Filter emission (ISO date string range filters)
 * - Bin range formatting
 */

import type { ColumnSchema, Filter } from '../../core/types';
import type { RangeFilter } from '../../filters/FilterTypes';
import type { TemporalColumnStats } from '../../statistics/ColumnStatsTypes';
import type { VisualizationOptions } from '../BaseVisualization';
import {
  analyzeDateContext,
  formatDateLabel,
  formatDateRange,
  formatDateForType,
  formatDateRangeForType,
} from './DateFormatters';
import type { DateFormatContext } from './DateFormatters';
import {
  fetchDateHistogramData,
  fetchDateStats,
  fetchDateHistogramBins,
  fetchDateNumericBins,
} from './DateHistogramData';
import type { DateHistogramData } from './DateHistogramData';
import { SharedHistogramBase, FONTS, PADDING, LAYOUT } from './SharedHistogramBase';

// =========================================
// DateHistogram Class
// =========================================

export class DateHistogram extends SharedHistogramBase<DateHistogramData> {
  /** Date format context computed from data range */
  private formatContext: DateFormatContext | null = null;

  /** Cached initial (unfiltered) data for ghost background */
  private initialData: DateHistogramData | null = null;
  /** In-flight promise for initial data fetch (prevents duplicate concurrent fetches) */
  private initialDataPromise: Promise<void> | null = null;

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
  }

  // =========================================
  // Data Fetching
  // =========================================

  /**
   * Ensure initialData is cached (unfiltered fetch).
   * Deduplicates concurrent calls.
   */
  private async ensureInitialData(seq: number): Promise<boolean> {
    if (this.initialData) return true;

    if (!this.initialDataPromise) {
      const maxBins = this.options.maxBins ?? 15;
      const { tableName, bridge } = this.options;
      const col = this.column.name;

      this.initialDataPromise = fetchDateHistogramData(tableName, col, [], bridge, maxBins)
        .then((data) => {
          this.initialData = data;
        })
        .finally(() => {
          this.initialDataPromise = null;
        });
    }

    await this.initialDataPromise;
    if (seq !== this.fetchSequence || this.destroyed) return false;

    return true;
  }

  /**
   * Fetch foreground data aligned to the cached initialData bin structure.
   */
  private async fetchAlignedForeground(
    filters: Filter[],
    seq: number,
  ): Promise<DateHistogramData | null> {
    const initial = this.initialData!;
    const { tableName, bridge } = this.options;
    const col = this.column.name;

    if (initial.bins.length === 0) {
      const maxBins = this.options.maxBins ?? 15;
      return fetchDateHistogramData(tableName, col, filters, bridge, maxBins);
    }

    if (initial.isNumericBinning && initial.min && initial.max) {
      const minMs = initial.min.getTime();
      const maxMs = initial.max.getTime();

      const [fgBins, fgStats] = await Promise.all([
        fetchDateNumericBins(tableName, col, initial.bins.length, minMs, maxMs, filters, bridge),
        fetchDateStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      return {
        bins: fgBins,
        nullCount: fgStats.nullCount,
        min: initial.min,
        max: initial.max,
        total: fgStats.count + fgStats.nullCount,
        interval: initial.interval,
        isSingleValue: initial.isSingleValue,
        isNumericBinning: true,
      };
    } else {
      const [rawFgBins, fgStats] = await Promise.all([
        fetchDateHistogramBins(tableName, col, initial.interval, filters, bridge),
        fetchDateStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      // Align foreground bins to initial bin structure so indices match for ghost rendering
      const fgBinMap = new Map<number, number>();
      for (const bin of rawFgBins) {
        fgBinMap.set(bin.binStart.getTime(), bin.count);
      }
      const fgBins = initial.bins.map((bgBin) => ({
        binStart: bgBin.binStart,
        binEnd: bgBin.binEnd,
        count: fgBinMap.get(bgBin.binStart.getTime()) ?? 0,
      }));

      return {
        bins: fgBins,
        nullCount: fgStats.nullCount,
        min: initial.min,
        max: initial.max,
        total: fgStats.count + fgStats.nullCount,
        interval: initial.interval,
        isSingleValue: initial.isSingleValue,
        isNumericBinning: false,
      };
    }
  }

  /**
   * Fetch date histogram data from DuckDB.
   *
   * Two-branch crossfilter pattern:
   * A) No filters: simple fetch, cache as initialData
   * B) Any filter active: ghost = initialData, foreground = allFilters
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
      const allFilters = this.options.filters;
      const hasAnyFilter = allFilters.length > 0;

      if (hasAnyFilter) {
        // Any filter active → show ghost (initialData) behind filtered foreground
        if (!(await this.ensureInitialData(seq))) return;

        const fgData = await this.fetchAlignedForeground(allFilters, seq);
        if (!fgData) return;

        this.backgroundData = this.initialData;
        this.data = fgData;
      } else {
        // Branch A: no filters → simple fetch, cache initial
        const maxBins = this.options.maxBins ?? 15;
        this.data = await fetchDateHistogramData(
          this.options.tableName,
          this.column.name,
          allFilters,
          this.options.bridge,
          maxBins,
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;
        this.initialData = this.data;
      }

      const layoutData = this.backgroundData ?? this.data;
      if (layoutData && layoutData.min && layoutData.max) {
        this.formatContext = analyzeDateContext(layoutData.min, layoutData.max);
      } else {
        this.formatContext = null;
      }

      // Emit column stats for default stats display
      this.emitDefaultStats();

      // Sync visual state from filter (e.g., panel-created range → brush overlay)
      if (this.isFilterUpdate || hasAnyFilter) {
        this.syncVisualStateFromFilter();
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

  /**
   * Emit computed column stats via onDefaultStatsChange callback.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const bgTotal = this.backgroundData?.total ?? null;
    const stats: TemporalColumnStats = {
      kind: 'temporal',
      totalRows: bgTotal ?? this.data.total,
      nonNullCount: this.data.total - this.data.nullCount,
      nullCount: this.data.nullCount,
      filteredTotalRows: bgTotal !== null ? this.data.total : null,
      min: this.data.min ? this.data.min.toISOString() : null,
      max: this.data.max ? this.data.max.toISOString() : null,
    };
    this.options.onDefaultStatsChange(stats);
  }

  // =========================================
  // Axis Labels (date-specific)
  // =========================================

  /**
   * Draw axis labels with human-readable date format
   */
  protected drawAxisLabels(): void {
    if (!this.data || !this.formatContext) return;

    const maxX =
      this.data.nullCount > 0 ? this.nullBarArea.x - LAYOUT.nullBarGap : this.width - PADDING.right;

    // Handle single value case
    if (this.data.isSingleValue && this.data.bins.length > 0) {
      const ctx = this.ctx;
      const labelY = this.height - 3;
      ctx.font = FONTS.axis;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = this.colors.axisText;
      ctx.textAlign = 'center';
      const label =
        this.data.isNumericBinning && this.data.min
          ? formatDateForType(this.data.min, this.column.type)
          : formatDateLabel(this.data.bins[0].binStart, this.data.interval, this.formatContext);
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    } else if (this.data.bins.length > 0 && this.data.min && this.data.max) {
      const firstBin = this.data.bins[0];
      const lastBin = this.data.bins[this.data.bins.length - 1];

      const minLabel = this.data.isNumericBinning
        ? formatDateForType(this.data.min, this.column.type)
        : formatDateLabel(firstBin.binStart, this.data.interval, this.formatContext);
      const maxLabel = this.data.isNumericBinning
        ? formatDateForType(this.data.max, this.column.type)
        : formatDateLabel(lastBin.binStart, this.data.interval, this.formatContext);
      this.drawMinMaxLabels(minLabel, maxLabel, maxX);
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
      : formatDateRange(bin.binStart, bin.binEnd, this.data.interval, this.formatContext);
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
            this.formatContext,
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

    const startIdx = Math.min(this.brushState.startBinIndex, this.brushState.endBinIndex);
    const endIdx = Math.max(this.brushState.startBinIndex, this.brushState.endBinIndex);
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];

    if (startBin && endBin) {
      const isLastBin = endIdx === this.data.bins.length - 1;
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'range',
        min: startBin.binStart.toISOString(),
        max: endBin.binEnd.toISOString(),
        ...(isLastBin && this.data.isNumericBinning && { maxInclusive: true }),
      });
    }
  }

  // =========================================
  // Filter → Visual State Sync (Date-aware)
  // =========================================

  protected override syncVisualStateFromFilter(): void {
    const filters = this.options.filters;
    const ownFilter = filters.find((f) => f.column === this.column.name);
    const data = this.backgroundData ?? this.data;

    if (!ownFilter || !data || data.bins.length === 0) {
      if (this.brushState.committed) {
        this.clearBrushStateOnly();
      }
      this.selectedBin = null;
      this.selectedNull = false;
      return;
    }

    switch (ownFilter.type) {
      case 'range':
        this.syncBrushFromDateRangeFilter(ownFilter, data.bins);
        break;
      case 'point': {
        const val = ownFilter.value;
        const targetDate = val instanceof Date ? val : new Date(String(val));
        if (this.brushState.committed) this.clearBrushStateOnly();
        this.selectedNull = false;
        this.selectedBin = null;
        for (let i = 0; i < data.bins.length; i++) {
          const bin = data.bins[i];
          if (targetDate >= bin.binStart && targetDate < bin.binEnd) {
            this.selectedBin = i;
            break;
          }
        }
        break;
      }
      case 'null':
        this.clearBrushStateOnly();
        this.selectedBin = null;
        this.selectedNull = true;
        break;
      case 'not-null':
        this.selectedNull = false;
        this.selectedBin = null;
        if (data.bins.length > 0) {
          this.setBrushFromBinRange(0, data.bins.length - 1);
        }
        break;
      default:
        if (this.brushState.committed) this.clearBrushStateOnly();
        this.selectedBin = null;
        this.selectedNull = false;
        break;
    }
  }

  private syncBrushFromDateRangeFilter(
    filter: RangeFilter,
    bins: { binStart: Date; binEnd: Date }[],
  ): void {
    // Parse filter bounds — can be Date, string, or number (Infinity for open-ended)
    const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
    const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

    const filterMinMs = minIsOpen
      ? -Infinity
      : filter.min instanceof Date
        ? filter.min.getTime()
        : new Date(String(filter.min)).getTime();
    const filterMaxMs = maxIsOpen
      ? Infinity
      : filter.max instanceof Date
        ? filter.max.getTime()
        : new Date(String(filter.max)).getTime();

    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < bins.length; i++) {
      const binStartMs = bins[i].binStart.getTime();
      const binEndMs = bins[i].binEnd.getTime();

      // Bin overlaps filter if: binEnd > filterMin AND binStart < filterMax
      if (binEndMs > filterMinMs && binStartMs < filterMaxMs) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }

    if (startIdx >= 0 && endIdx >= 0) {
      this.selectedBin = null;
      this.selectedNull = false;
      this.brushState.committed = true;
      this.brushState.active = false;
      this.brushState.sliding = false;
      this.brushState.startBinIndex = startIdx;
      this.brushState.endBinIndex = endIdx;
    } else {
      if (this.brushState.committed) this.clearBrushStateOnly();
      this.selectedBin = null;
      this.selectedNull = false;
    }
  }
}
