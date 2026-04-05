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
import type { ColumnSchema, Filter } from '../../core/types';
import type { RangeFilter } from '../../filters/FilterTypes';
import type { TimeColumnStats } from '../../statistics/ColumnStatsTypes';
import {
  fetchTimeHistogramData,
  secondsToTimeString,
  fetchTimeStats,
  fetchTimeHistogramBins,
  fetchTimeNumericBins,
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
  /** Cached initial (unfiltered) data for ghost background */
  private initialData: TimeHistogramData | null = null;
  /** In-flight promise for initial data fetch (prevents duplicate concurrent fetches) */
  private initialDataPromise: Promise<void> | null = null;

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
   * Ensure initialData is cached (unfiltered fetch).
   * Deduplicates concurrent calls.
   */
  private async ensureInitialData(seq: number): Promise<boolean> {
    if (this.initialData) return true;

    if (!this.initialDataPromise) {
      const maxBins = this.options.maxBins ?? 15;
      const { tableName, bridge } = this.options;
      const col = this.column.name;

      this.initialDataPromise = fetchTimeHistogramData(tableName, col, [], bridge, maxBins)
        .then(data => { this.initialData = data; })
        .finally(() => { this.initialDataPromise = null; });
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
    seq: number
  ): Promise<TimeHistogramData | null> {
    const initial = this.initialData!;
    const { tableName, bridge } = this.options;
    const col = this.column.name;

    if (initial.bins.length === 0) {
      const maxBins = this.options.maxBins ?? 15;
      return fetchTimeHistogramData(tableName, col, filters, bridge, maxBins);
    }

    if (initial.isNumericBinning && initial.minSeconds !== null && initial.maxSeconds !== null) {
      const [fgBins, fgStats] = await Promise.all([
        fetchTimeNumericBins(tableName, col, initial.bins.length, initial.minSeconds, initial.maxSeconds, filters, bridge),
        fetchTimeStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      return {
        bins: fgBins,
        nullCount: fgStats.nullCount,
        minSeconds: initial.minSeconds,
        maxSeconds: initial.maxSeconds,
        total: fgStats.count + fgStats.nullCount,
        interval: initial.interval,
        isSingleValue: initial.isSingleValue,
        isNumericBinning: true,
      };
    } else {
      const [rawFgBins, fgStats] = await Promise.all([
        fetchTimeHistogramBins(tableName, col, initial.interval, filters, bridge),
        fetchTimeStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      // Align foreground bins to initial bin structure so indices match for ghost rendering
      const fgBinMap = new Map<number, number>();
      for (const bin of rawFgBins) {
        fgBinMap.set(bin.binStartSeconds, bin.count);
      }
      const fgBins = initial.bins.map(bgBin => ({
        binStartSeconds: bgBin.binStartSeconds,
        binEndSeconds: bgBin.binEndSeconds,
        count: fgBinMap.get(bgBin.binStartSeconds) ?? 0,
      }));

      return {
        bins: fgBins,
        nullCount: fgStats.nullCount,
        minSeconds: initial.minSeconds,
        maxSeconds: initial.maxSeconds,
        total: fgStats.count + fgStats.nullCount,
        interval: initial.interval,
        isSingleValue: initial.isSingleValue,
        isNumericBinning: false,
      };
    }
  }

  /**
   * Fetch time histogram data from DuckDB.
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
        this.data = await fetchTimeHistogramData(
          this.options.tableName, this.column.name, allFilters, this.options.bridge, maxBins
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.backgroundData = null;
        this.initialData = this.data;
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
      console.error(`[TimeHistogram] Failed to fetch data for ${this.column.name}:`, error);
      this.data = null;
      this.backgroundData = null;
      this.render();
    }
  }

  /**
   * Emit computed column stats via onDefaultStatsChange callback.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const bgTotal = this.backgroundData?.total ?? null;
    const stats: TimeColumnStats = {
      kind: 'time',
      totalRows: bgTotal ?? this.data.total,
      nonNullCount: this.data.total - this.data.nullCount,
      nullCount: this.data.nullCount,
      filteredTotalRows: bgTotal !== null ? this.data.total : null,
      minSeconds: this.data.minSeconds,
      maxSeconds: this.data.maxSeconds,
    };
    this.options.onDefaultStatsChange(stats);
  }

  // =========================================
  // Axis Labels (time-specific)
  // =========================================

  /**
   * Draw axis labels with human-readable time format
   */
  protected drawAxisLabels(): void {
    if (!this.data) return;

    const maxX = this.data.nullCount > 0
      ? this.nullBarArea.x - LAYOUT.nullBarGap
      : this.width - PADDING.right;

    // Handle single value case
    if (this.data.isSingleValue && this.data.bins.length > 0) {
      const ctx = this.ctx;
      const labelY = this.height - 3;
      ctx.font = FONTS.axis;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = COLORS.axisText;
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
      const firstBin = this.data.bins[0];
      const lastBin = this.data.bins[this.data.bins.length - 1];

      const minLabel = this.data.isNumericBinning
        ? formatTimeOnlyLabelNumeric(firstBin.binStartSeconds)
        : formatTimeOnlyLabel(
            firstBin.binStartSeconds,
            this.data.interval
          );
      const maxLabel = this.data.isNumericBinning
        ? formatTimeOnlyLabelNumeric(lastBin.binEndSeconds)
        : formatTimeOnlyLabel(
            lastBin.binStartSeconds,
            this.data.interval
          );
      this.drawMinMaxLabels(minLabel, maxLabel, maxX);
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
      const isLastBin = endIdx === this.data.bins.length - 1;
      this.options.onFilterChange?.({
        column: this.column.name,
        type: 'range',
        min: secondsToTimeString(startBin.binStartSeconds),
        max: secondsToTimeString(endBin.binEndSeconds),
        ...(isLastBin && this.data.isNumericBinning && { maxInclusive: true }),
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

  // =========================================
  // Filter → Visual State Sync (Time-aware)
  // =========================================

  protected syncVisualStateFromFilter(): void {
    const filters = this.options.filters;
    const ownFilter = filters.find(f => f.column === this.column.name);
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
        this.syncBrushFromTimeRangeFilter(ownFilter as RangeFilter, data.bins);
        break;
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

  /**
   * Parse a time string (HH:MM:SS or HH:MM) to seconds from midnight.
   */
  private parseTimeToSeconds(value: string | number | Date): number {
    if (typeof value === 'number') return value;
    const str = String(value);
    const parts = str.split(':');
    const hours = parseInt(parts[0] ?? '0', 10);
    const minutes = parseInt(parts[1] ?? '0', 10);
    const seconds = parseFloat(parts[2] ?? '0');
    return hours * 3600 + minutes * 60 + seconds;
  }

  private syncBrushFromTimeRangeFilter(
    filter: RangeFilter,
    bins: Array<{ binStartSeconds: number; binEndSeconds: number }>
  ): void {
    const minIsOpen = typeof filter.min === 'number' && !Number.isFinite(filter.min);
    const maxIsOpen = typeof filter.max === 'number' && !Number.isFinite(filter.max);

    const filterMinSec = minIsOpen ? -Infinity : this.parseTimeToSeconds(filter.min);
    const filterMaxSec = maxIsOpen ? Infinity : this.parseTimeToSeconds(filter.max);

    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      if (bin.binEndSeconds > filterMinSec && bin.binStartSeconds < filterMaxSec) {
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
