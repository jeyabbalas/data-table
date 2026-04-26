import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  filtersToWhereClause,
  QueryError,
  quoteIdentifier,
  StatsPanelRegistry,
  type DataTable,
} from '@jeyabbalas/data-table';
import {
  BaseStatsPanel,
  type StatsPanelOptions,
  type ColumnStatsData,
} from '@jeyabbalas/data-table/advanced';
import type { ColumnSchema, Filter } from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/json/titanic.json';

/**
 * Tiny helper: format a number with at most two fraction digits, suppressing
 * trailing zeros. Matches the visual density of the library's default stats.
 */
function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 10) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Tiny helper: minimal HTML escape for any user-derived text we render via
 * innerHTML. Mirrors `src/statistics/StatsFormatters.ts:escapeHtml`.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * MeanStdPanel — a numeric stats panel that replaces the library's
 * `min · med · max` line with `n · μ · σ`, where μ and σ come from a custom
 * DuckDB query (the default ColumnStatsData doesn't carry mean / std-dev).
 *
 * The panel:
 *   • runs its own SQL via `options.bridge`
 *   • re-fetches whenever the table's filter array changes
 *   • integrates with the visualization's hover overlay via `setHoverStats`
 *   • cleans up its DOM in `destroy()`
 */
class MeanStdPanel extends BaseStatsPanel {
  private line1: HTMLSpanElement;
  private line2: HTMLSpanElement;
  private mean: number | null = null;
  private std: number | null = null;
  private nonNull: number | null = null;
  private nullCount: number | null = null;
  private hoverText: string | null = null;
  private fetchSeq = 0;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);

    // Build the static DOM once so update() / setHoverStats() are simple
    // textContent writes. Keeps DOM churn low and avoids re-parsing HTML on
    // every filter change.
    this.line1 = document.createElement('span');
    this.line1.className = 'dt-stats-line1';
    this.line2 = document.createElement('span');
    this.line2.className = 'dt-stats-line2';
    const br = document.createElement('br');
    this.container.append(this.line1, br, this.line2);

    // Kick off the first fetch. The base class doesn't call updateFilters on
    // construction (the coordinator's syncExistingFilters covers later panels),
    // so we trigger an initial query here too.
    void this.fetch();
  }

  update(stats: ColumnStatsData | null): void {
    if (stats?.kind === 'numeric') {
      this.nonNull = stats.nonNullCount;
      this.nullCount = stats.nullCount;
    }
    this.paint();
  }

  setHoverStats(text: string | null): void {
    this.hoverText = text;
    this.paint();
  }

  async updateFilters(filters: Filter[]): Promise<void> {
    await super.updateFilters(filters);
    await this.fetch();
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }

  private async fetch(): Promise<void> {
    if (this.isDestroyed()) return;
    const seq = ++this.fetchSeq;
    // Quote identifiers — column names with embedded `"` are legal in CSV
    // headers and DuckDB DDL, and would otherwise break the SQL or open a
    // SQL-injection path. `quoteIdentifier` doubles embedded `"` per
    // DuckDB's escaping rules.
    const colId = quoteIdentifier(this.column.name);
    const tableId = quoteIdentifier(this.options.tableName);
    const filterWhere = filtersToWhereClause(this.options.filters);
    const where = filterWhere
      ? `${colId} IS NOT NULL AND (${filterWhere})`
      : `${colId} IS NOT NULL`;
    const sql = `
      SELECT
        AVG(${colId})::DOUBLE AS mean,
        STDDEV_POP(${colId})::DOUBLE AS std
      FROM ${tableId}
      WHERE ${where}
    `;
    try {
      const rows = await this.options.bridge.query<{ mean: number | null; std: number | null }>(sql);
      // Drop stale results: a fresh filter change may have superseded us.
      if (this.isDestroyed() || seq !== this.fetchSeq) return;
      this.mean = rows[0]?.mean ?? null;
      this.std = rows[0]?.std ?? null;
      this.paint();
    } catch (err) {
      this.options.onError?.(
        new QueryError(err instanceof Error ? err.message : String(err), {
          code: 'QUERY_RUNTIME',
          cause: err,
        }),
        { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
      );
    }
  }

  private paint(): void {
    if (this.isDestroyed()) return;
    const n = this.nonNull;
    const nul = this.nullCount;
    const top = n == null ? '…' : nul ? `${fmtNum(n)} non-null · ${fmtNum(nul)} null` : `${fmtNum(n)} rows`;
    this.line1.textContent = top;

    if (this.hoverText) {
      // Visualization is showing a hover preview — surface it on line 2 so
      // the bin/bar still feels alive even though we own the slot.
      this.line2.innerHTML = this.hoverText;
      return;
    }

    const mu = fmtNum(this.mean);
    const sd = fmtNum(this.std);
    this.line2.textContent = `μ ${mu} · σ ${sd}`;
  }
}

/**
 * TopValuePanel — a categorical (string) stats panel that replaces
 * "12 unique" with the most-common value and its share, computed via a
 * custom DuckDB query. Exercises the same lifecycle as MeanStdPanel for
 * categorical columns.
 */
class TopValuePanel extends BaseStatsPanel {
  private line1: HTMLSpanElement;
  private line2: HTMLSpanElement;
  private distinct: number | null = null;
  private nonNull: number | null = null;
  private nullCount: number | null = null;
  private topValue: string | null = null;
  private topCount: number | null = null;
  private hoverText: string | null = null;
  private fetchSeq = 0;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    super(container, column, options);
    this.line1 = document.createElement('span');
    this.line1.className = 'dt-stats-line1';
    this.line2 = document.createElement('span');
    this.line2.className = 'dt-stats-line2';
    const br = document.createElement('br');
    this.container.append(this.line1, br, this.line2);
    void this.fetch();
  }

  update(stats: ColumnStatsData | null): void {
    if (stats?.kind === 'categorical') {
      this.distinct = stats.distinctCount;
      this.nonNull = stats.nonNullCount;
      this.nullCount = stats.nullCount;
    }
    this.paint();
  }

  setHoverStats(text: string | null): void {
    this.hoverText = text;
    this.paint();
  }

  async updateFilters(filters: Filter[]): Promise<void> {
    await super.updateFilters(filters);
    await this.fetch();
  }

  destroy(): void {
    this.container.replaceChildren();
    super.destroy();
  }

  private async fetch(): Promise<void> {
    if (this.isDestroyed()) return;
    const seq = ++this.fetchSeq;
    const colId = quoteIdentifier(this.column.name);
    const tableId = quoteIdentifier(this.options.tableName);
    const filterWhere = filtersToWhereClause(this.options.filters);
    const where = filterWhere
      ? `${colId} IS NOT NULL AND (${filterWhere})`
      : `${colId} IS NOT NULL`;
    const sql = `
      SELECT ${colId}::VARCHAR AS value, COUNT(*) AS cnt
      FROM ${tableId}
      WHERE ${where}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
      LIMIT 1
    `;
    try {
      const rows = await this.options.bridge.query<{ value: string | null; cnt: number }>(sql);
      if (this.isDestroyed() || seq !== this.fetchSeq) return;
      this.topValue = rows[0]?.value ?? null;
      this.topCount = rows[0] ? Number(rows[0].cnt) : null;
      this.paint();
    } catch (err) {
      this.options.onError?.(
        new QueryError(err instanceof Error ? err.message : String(err), {
          code: 'QUERY_RUNTIME',
          cause: err,
        }),
        { source: 'stats-panel', column: this.column.name, phase: 'fetch' },
      );
    }
  }

  private paint(): void {
    if (this.isDestroyed()) return;
    const n = this.nonNull;
    const d = this.distinct;
    const top =
      n == null
        ? '…'
        : d != null
          ? `${fmtNum(n)} rows · ${fmtNum(d)} unique`
          : `${fmtNum(n)} rows`;
    this.line1.textContent = top;

    if (this.hoverText) {
      this.line2.innerHTML = this.hoverText;
      return;
    }

    if (this.topValue == null || this.topCount == null || n == null || n === 0) {
      this.line2.textContent = '—';
      return;
    }
    const pct = Math.round((this.topCount / n) * 100);
    // topValue is user data — escape before injecting into innerHTML.
    this.line2.innerHTML = `top: <strong>${esc(this.topValue)}</strong> (${pct}%)`;
  }
}

const container = document.getElementById('table') as HTMLElement;

// Build the registry. Numeric columns get MeanStdPanel; string columns get
// TopValuePanel. Together these cover every column in the Titanic dataset.
const statsPanelRegistry = new StatsPanelRegistry();
statsPanelRegistry.register({
  name: 'mean-std',
  isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
  constructor: MeanStdPanel,
  priority: 10,
});
statsPanelRegistry.register({
  name: 'top-value',
  isApplicable: (type) => type === 'string',
  constructor: TopValuePanel,
  priority: 10,
});

let table: DataTable | undefined;
(async () => {
  table = await createDataTable({
    container,
    tableName: 'titanic',
    statsPanelRegistry,
    persistence: false,
  });
  await table.loadData(DATA_URL, { sourceFormat: 'json' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
