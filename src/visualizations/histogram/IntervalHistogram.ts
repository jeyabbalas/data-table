/**
 * IntervalHistogram - Canvas-based histogram visualization for INTERVAL columns
 *
 * Extends SharedHistogramBase with interval-specific:
 * - Data fetching (numeric equal-width binning on total-seconds scale)
 * - Axis label formatting (compact interval notation: "1d 2h 30m")
 * - Filter emission (range filters with INTERVAL SQL values)
 * - Bin range formatting
 */

import { DataTableError, QueryError } from '../../core/errors';
import type { ColumnSchema, Filter } from '../../core/types';
import type { IntervalColumnStats } from '../../statistics/ColumnStatsTypes';
import type { VisualizationOptions } from '../BaseVisualization';
import {
  fetchIntervalHistogramData,
  fetchIntervalColumnStats,
  fetchIntervalNumericBins,
  intervalBrushFilter,
  intervalFilterBars,
  secondsToIntervalString,
} from './IntervalHistogramData';
import type { IntervalHistogramData } from './IntervalHistogramData';
import { SharedHistogramBase, FONTS, PADDING, LAYOUT } from './SharedHistogramBase';

// =========================================
// IntervalHistogram Class
// =========================================

/**
 * Histogram for DuckDB `interval` columns (durations). Displays bins by
 * duration unit (seconds, minutes, hours, days, ...) auto-selected from the
 * value range. Brush emits {@link RangeFilter} entries with
 * `valueType: 'interval'` so SQL generation prefixes the literals with
 * `INTERVAL`.
 */
export class IntervalHistogram extends SharedHistogramBase<IntervalHistogramData> {
  /** Cached initial (unfiltered) data for ghost background */
  private initialData: IntervalHistogramData | null = null;
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

      this.initialDataPromise = fetchIntervalHistogramData(tableName, col, [], bridge, maxBins)
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
  ): Promise<IntervalHistogramData | null> {
    const initial = this.initialData!;
    const { tableName, bridge } = this.options;
    const col = this.column.name;

    if (initial.bins.length === 0 || initial.minSeconds === null || initial.maxSeconds === null) {
      const maxBins = this.options.maxBins ?? 15;
      return fetchIntervalHistogramData(tableName, col, filters, bridge, maxBins);
    }

    const [fgBins, fgStats] = await Promise.all([
      fetchIntervalNumericBins(
        tableName,
        col,
        initial.bins.length,
        initial.minSeconds,
        initial.maxSeconds,
        filters,
        bridge,
      ),
      fetchIntervalColumnStats(tableName, col, filters, bridge),
    ]);
    if (seq !== this.fetchSequence || this.destroyed) return null;

    return {
      bins: fgBins,
      nullCount: fgStats.nullCount,
      minSeconds: initial.minSeconds,
      maxSeconds: initial.maxSeconds,
      medianSeconds: fgStats.medianSeconds,
      total: fgStats.count + fgStats.nullCount,
      isSingleValue: initial.isSingleValue,
    };
  }

  /**
   * Fetch interval histogram data from DuckDB.
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
        const fetched = await fetchIntervalHistogramData(
          this.options.tableName,
          this.column.name,
          allFilters,
          this.options.bridge,
          maxBins,
        );
        if (seq !== this.fetchSequence || this.destroyed) return;
        this.data = fetched;
        this.backgroundData = null;
        this.initialData = this.data;
      }

      // Emit column stats for default stats display
      this.emitDefaultStats();

      // Sync visual state from filter (e.g., panel-created range → brush overlay)
      if (this.isFilterUpdate || hasAnyFilter) {
        this.syncVisualStateFromFilter();
      }

      // Keep the committed-selection stats text in step with the synced
      // visual state (also clears it when this column's filter was removed).
      this.emitCommittedStats();

      this.render();
    } catch (error) {
      if (seq !== this.fetchSequence || this.destroyed) return;
      const typed =
        error instanceof DataTableError
          ? error
          : new QueryError(error instanceof Error ? error.message : String(error), {
              code: 'QUERY_RUNTIME',
              cause: error,
            });
      this.options.onError?.(typed, {
        columnName: this.column.name,
        stage: 'fetch',
      });
      this.showFetchFailed();
    }
  }

  /**
   * Emit computed column stats via onDefaultStatsChange callback.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const bgTotal = this.backgroundData?.total ?? null;
    const stats: IntervalColumnStats = {
      kind: 'interval',
      totalRows: bgTotal ?? this.data.total,
      nonNullCount: this.data.total - this.data.nullCount,
      nullCount: this.data.nullCount,
      filteredTotalRows: bgTotal !== null ? this.data.total : null,
      minDisplay:
        this.data.minSeconds !== null ? secondsToIntervalString(this.data.minSeconds) : null,
      maxDisplay:
        this.data.maxSeconds !== null ? secondsToIntervalString(this.data.maxSeconds) : null,
      medianDisplay:
        this.data.medianSeconds !== null ? secondsToIntervalString(this.data.medianSeconds) : null,
    };
    this.options.onDefaultStatsChange(stats);
  }

  // =========================================
  // Axis Labels (interval-specific)
  // =========================================

  /**
   * Draw axis labels with compact interval notation
   */
  protected drawAxisLabels(): void {
    if (!this.data) return;

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
      const label = secondsToIntervalString(this.data.bins[0]!.binStartSeconds);
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    } else if (this.data.bins.length > 0) {
      const firstBin = this.data.bins[0]!;
      const lastBin = this.data.bins[this.data.bins.length - 1]!;
      const minLabel = secondsToIntervalString(firstBin.binStartSeconds);
      const maxLabel = secondsToIntervalString(lastBin.binEndSeconds);
      this.drawMinMaxLabels(minLabel, maxLabel, maxX);
    }

    // Draw null symbol if nulls exist
    if (this.data.nullCount > 0) {
      this.drawNullSymbol();
    }
  }

  // =========================================
  // Bin/Brush Range Formatting (interval-specific)
  // =========================================

  /**
   * Format a single bin's range for hover/selection stats
   */
  protected formatBinRange(binIndex: number): string {
    if (!this.data) return '';
    const bin = this.data.bins[binIndex];
    if (!bin) return '';

    if (this.data.isSingleValue) {
      return secondsToIntervalString(bin.binStartSeconds);
    }

    return `${secondsToIntervalString(bin.binStartSeconds)} \u2013 ${secondsToIntervalString(bin.binEndSeconds)}`;
  }

  /**
   * Format a brush range spanning startIdx to endIdx
   */
  protected formatBrushRange(startIdx: number, endIdx: number): string {
    if (!this.data) return '';
    const startBin = this.data.bins[startIdx];
    const endBin = this.data.bins[endIdx];
    if (!startBin || !endBin) return '';

    if (startIdx === endIdx) {
      return this.formatBinRange(startIdx);
    }

    return `${secondsToIntervalString(startBin.binStartSeconds)} \u2013 ${secondsToIntervalString(endBin.binEndSeconds)}`;
  }

  // =========================================
  // Filter Emission (interval-specific)
  // =========================================

  /**
   * Emit a range filter based on current brush bin indices: the filter
   * {@link intervalBrushFilter} writes, which matches exactly the brushed bars'
   * rows. Its INTERVAL literals compare with 30-day months, a limitation it
   * documents and keeps on purpose.
   */
  protected emitBrushFilter(): void {
    if (!this.data) return;

    const startIdx = Math.min(this.brushState.startBinIndex, this.brushState.endBinIndex);
    const endIdx = Math.max(this.brushState.startBinIndex, this.brushState.endBinIndex);

    if (this.data.bins[startIdx] && this.data.bins[endIdx]) {
      this.options.onFilterChange?.(
        intervalBrushFilter(this.column.name, this.data.bins, startIdx, endIdx),
      );
    }
  }

  // =========================================
  // Filter → Visual State Sync (Interval-aware)
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
      case 'range': {
        // In whole microseconds, as the brush writes its bounds: the bars it
        // brushed, however narrow, and no neighbour.
        const bars = intervalFilterBars(ownFilter, data.bins);
        if (bars) {
          this.setBrushFromBinRange(bars[0], bars[1]);
        } else {
          if (this.brushState.committed) this.clearBrushStateOnly();
          this.selectedBin = null;
          this.selectedNull = false;
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
        // Pattern or other filters — no histogram mapping
        if (this.brushState.committed) this.clearBrushStateOnly();
        this.selectedBin = null;
        this.selectedNull = false;
        break;
    }
  }
}
