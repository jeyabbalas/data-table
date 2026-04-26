/**
 * Histogram - Canvas-based histogram visualization for numeric columns
 *
 * Extends SharedHistogramBase with numeric-specific:
 * - Data fetching (discrete/continuous modes)
 * - Axis label formatting (scientific notation, locale formatting)
 * - Filter emission (point/set/range filters)
 * - Bin range formatting
 *
 * Not normally instantiated directly — the `VisualizationRegistry` picks it
 * for `integer`, `float`, and `decimal` columns by default.
 *
 * @example
 * import { VisualizationRegistry, Histogram } from '@jeyabbalas/data-table/advanced';
 *
 * // Bump Histogram's priority so a custom registration only wins for a
 * // specific column type set.
 * const registry = new VisualizationRegistry();
 * registry.register({
 *   name: 'histogram',
 *   isApplicable: (type) => type === 'float',
 *   constructor: Histogram as any,
 *   priority: 5,
 * });
 *
 * @see DateHistogram for date/timestamp columns
 * @see TimeHistogram for TIME columns
 * @see IntervalHistogram for INTERVAL columns
 * @see ValueCounts for categorical columns
 */

import { DataTableError, QueryError } from '../../core/errors';
import type { ColumnSchema, Filter } from '../../core/types';
import type { RangeFilter } from '../../filters/FilterTypes';
import type { NumericColumnStats } from '../../statistics/ColumnStatsTypes';
import type { VisualizationOptions } from '../BaseVisualization';
import {
  fetchHistogramData,
  fetchColumnStats,
  fetchHistogramBins,
  fetchDiscreteBins,
} from './HistogramData';
import type { HistogramData } from './HistogramData';
import { SharedHistogramBase, FONTS, PADDING, LAYOUT } from './SharedHistogramBase';

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

/**
 * Numeric histogram visualization rendered into a column header. Subclass of
 * `SharedHistogramBase`; registered on `VisualizationRegistry` (root entry)
 * by default for `integer` / `float` / `decimal` columns. Drag a brush to
 * emit a `RangeFilter`; click an empty bin to reset.
 */
export class Histogram extends SharedHistogramBase<HistogramData> {
  /** Cached initial (unfiltered) data for ghost background */
  private initialData: HistogramData | null = null;
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
   * Returns immediately if already cached. Deduplicates concurrent calls.
   */
  private async ensureInitialData(seq: number): Promise<boolean> {
    if (this.initialData) return true;

    if (!this.initialDataPromise) {
      const maxBins = this.options.maxBins ?? 15;
      const { tableName, bridge } = this.options;
      const col = this.column.name;

      this.initialDataPromise = fetchHistogramData(tableName, col, maxBins, [], bridge)
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
   * Uses the same bin edges/discrete values as initial so bars line up.
   */
  private async fetchAlignedForeground(
    filters: Filter[],
    seq: number,
  ): Promise<HistogramData | null> {
    const initial = this.initialData!;
    const { tableName, bridge } = this.options;
    const col = this.column.name;

    // Handle edge cases: no bins in initial data
    if (initial.bins.length === 0) {
      return fetchHistogramData(tableName, col, this.options.maxBins ?? 15, filters, bridge);
    }

    if (initial.isDiscrete) {
      const discreteVals = initial.bins.map((b) => b.x0);
      const [fgDiscreteBins, fgStats] = await Promise.all([
        fetchDiscreteBins(tableName, col, discreteVals, filters, bridge),
        fetchColumnStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      return {
        bins: fgDiscreteBins,
        nullCount: fgStats.nullCount,
        min: initial.min,
        max: initial.max,
        total: fgStats.count + fgStats.nullCount,
        isSingleValue: initial.isSingleValue,
        isDiscrete: true,
        median: fgStats.median,
        distinctCount: fgStats.distinctCount,
      };
    } else {
      const [fgBins, fgStats] = await Promise.all([
        fetchHistogramBins(
          tableName,
          col,
          initial.min,
          initial.max,
          initial.bins.length,
          filters,
          bridge,
        ),
        fetchColumnStats(tableName, col, filters, bridge),
      ]);
      if (seq !== this.fetchSequence || this.destroyed) return null;

      return {
        bins: fgBins,
        nullCount: fgStats.nullCount,
        min: initial.min,
        max: initial.max,
        total: fgStats.count + fgStats.nullCount,
        isSingleValue: initial.isSingleValue,
        isDiscrete: false,
        median: fgStats.median,
        distinctCount: fgStats.distinctCount,
      };
    }
  }

  /**
   * Fetch histogram data from DuckDB.
   *
   * Two-branch crossfilter pattern:
   * A) No filters: simple fetch, cache as initialData
   * B) Any filter active: ghost = initialData, foreground = allFilters
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
        this.data = await fetchHistogramData(
          this.options.tableName,
          this.column.name,
          maxBins,
          allFilters,
          this.options.bridge,
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
      if (seq !== this.fetchSequence || this.destroyed) return; // Stale or torn down — drop
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
      this.data = null;
      this.backgroundData = null;
      this.render();
    }
  }

  /**
   * Emit computed column stats via onDefaultStatsChange callback.
   * Uses backgroundData (unfiltered) for totalRows when available.
   */
  private emitDefaultStats(): void {
    if (!this.data || !this.options.onDefaultStatsChange) return;

    const bgTotal = this.backgroundData?.total ?? null;
    const stats: NumericColumnStats = {
      kind: 'numeric',
      totalRows: bgTotal ?? this.data.total,
      nonNullCount: this.data.total - this.data.nullCount,
      nullCount: this.data.nullCount,
      filteredTotalRows: bgTotal !== null ? this.data.total : null,
      min: isNaN(this.data.min) ? null : this.data.min,
      max: isNaN(this.data.max) ? null : this.data.max,
      median: this.data.median,
      distinctCount: this.data.distinctCount,
    };
    this.options.onDefaultStatsChange(stats);
  }

  // =========================================
  // Axis Labels (numeric-specific)
  // =========================================

  /**
   * Draw axis labels (min/max always visible, hover stats shown via tooltip)
   */
  protected drawAxisLabels(): void {
    if (!this.data) return;

    const maxX =
      this.data.nullCount > 0 ? this.nullBarArea.x - LAYOUT.nullBarGap : this.width - PADDING.right;

    // Handle single value case - show centered label instead of "X – X"
    if (this.data.isSingleValue) {
      const ctx = this.ctx;
      const labelY = this.height - 3;
      ctx.font = FONTS.axis;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = this.colors.axisText;
      ctx.textAlign = 'center';
      const label = formatAxisValue(this.data.min);
      const centerX = this.chartArea.x + this.chartArea.width / 2;
      ctx.fillText(label, centerX, labelY);
    }
    // Handle discrete bins - show first and last value labels
    else if (this.data.isDiscrete && this.data.bins.length > 0) {
      const firstBin = this.data.bins[0]!;
      const lastBin = this.data.bins[this.data.bins.length - 1]!;
      this.drawMinMaxLabels(formatAxisValue(firstBin.x0), formatAxisValue(lastBin.x0), maxX);
    }
    // Normal continuous case: min on left, max on right
    else {
      this.drawMinMaxLabels(formatAxisValue(this.data.min), formatAxisValue(this.data.max), maxX);
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
    return this.data.isSingleValue || this.data.isDiscrete
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
    return this.data.isSingleValue || this.data.isDiscrete
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

    const startIdx = Math.min(this.brushState.startBinIndex, this.brushState.endBinIndex);
    const endIdx = Math.max(this.brushState.startBinIndex, this.brushState.endBinIndex);
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
            values.push(this.data.bins[i]!.x0);
          }
          this.options.onFilterChange?.({
            column: this.column.name,
            type: 'set',
            values: values,
          });
        }
      } else {
        // Continuous: use range filter
        const isLastBin = endIdx === this.data.bins.length - 1;
        this.options.onFilterChange?.({
          column: this.column.name,
          type: 'range',
          min: startBin.x0,
          max: endBin.x1,
          ...(isLastBin && { maxInclusive: true }),
        });
      }
    }
  }

  // =========================================
  // Filter → Visual State Sync (Numeric)
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
        this.syncBrushFromNumericRange(ownFilter, data.bins);
        break;
      case 'point': {
        const value = ownFilter.value;
        if (typeof value === 'number' && Number.isFinite(value)) {
          this.selectedNull = false;
          let found = false;
          for (let i = 0; i < data.bins.length; i++) {
            const bin = data.bins[i]!;
            if (bin.x0 === bin.x1) {
              // Discrete bin: exact match
              if (value === bin.x0) {
                this.setBrushFromBinRange(i, i);
                found = true;
                break;
              }
            } else {
              // Continuous bin: range match (last bin is inclusive on both ends)
              const isLast = i === data.bins.length - 1;
              if (value >= bin.x0 && (isLast ? value <= bin.x1 : value < bin.x1)) {
                this.setBrushFromBinRange(i, i);
                found = true;
                break;
              }
            }
          }
          if (!found) {
            if (this.brushState.committed) this.clearBrushStateOnly();
            this.selectedBin = null;
          }
        }
        break;
      }
      case 'set': {
        // Discrete histograms emit set filters for multi-bin brush selections
        const values = ownFilter.values as number[];
        if (values && values.length > 0) {
          let minIdx = Infinity;
          let maxIdx = -Infinity;
          for (const val of values) {
            for (let i = 0; i < data.bins.length; i++) {
              if (data.bins[i]!.x0 === val) {
                minIdx = Math.min(minIdx, i);
                maxIdx = Math.max(maxIdx, i);
                break;
              }
            }
          }
          if (minIdx <= maxIdx && minIdx !== Infinity) {
            this.setBrushFromBinRange(minIdx, maxIdx);
          } else {
            if (this.brushState.committed) this.clearBrushStateOnly();
            this.selectedBin = null;
            this.selectedNull = false;
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

  private syncBrushFromNumericRange(filter: RangeFilter, bins: { x0: number; x1: number }[]): void {
    const filterMin =
      typeof filter.min === 'number' && Number.isFinite(filter.min) ? filter.min : -Infinity;
    const filterMax =
      typeof filter.max === 'number' && Number.isFinite(filter.max) ? filter.max : Infinity;

    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < bins.length; i++) {
      if (bins[i]!.x1 > filterMin && bins[i]!.x0 < filterMax) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }

    if (startIdx >= 0 && endIdx >= 0) {
      this.setBrushFromBinRange(startIdx, endIdx);
    } else {
      if (this.brushState.committed) this.clearBrushStateOnly();
      this.selectedBin = null;
      this.selectedNull = false;
    }
  }
}
