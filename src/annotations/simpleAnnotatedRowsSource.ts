/**
 * The simplest helper table of annotated rows that navigation can search:
 * rebuilt whole, in one statement, whenever the store's annotations changed
 * since the last build, and only when something asks for it.
 */

import { QueryError } from '../core/errors';
import type { TableState } from '../core/State';
import type { WorkerBridge } from '../data/WorkerBridge';
import { quoteIdentifier } from '../filters/FilterSQL';
import { annotatedRowsTableName, type AnnotatedRowsSource } from './annotatedRowsSource';
import type { AnnotationStore } from './AnnotationStore';

/**
 * Builds the helper table of a table's annotated rows (see
 * `annotatedRowsSource`) on demand.
 *
 * Each row is packed as `rowId * 8 + mask` and the whole list sent as one
 * string that DuckDB splits: one statement, a fraction of the time
 * `INSERT … VALUES` takes for a million rows. A `rowId` that is not an
 * integer in [0, 2^50) cannot be a row's, nor packed exactly, and is left
 * out.
 *
 * @internal
 */
export class SimpleAnnotatedRowsSource implements AnnotatedRowsSource {
  /**
   * The base table, store revision and annotated rows the helper was last
   * built for.
   */
  private built: { table: string; revision: number; rows: object | null } | null = null;

  constructor(
    private readonly bridge: Pick<WorkerBridge, 'query'>,
    private readonly state: Pick<TableState, 'baseTableName'>,
    private readonly store: Pick<AnnotationStore, 'contentRevision' | 'annotatedRows'> | null,
  ) {}

  async ensureFresh(signal?: AbortSignal): Promise<string> {
    const base = this.state.baseTableName.get();
    if (!base) throw new QueryError('No table loaded', { code: 'NO_TABLE' });
    const name = annotatedRowsTableName(base);
    const revision = this.store?.contentRevision ?? 0;
    const built = this.built;
    if (built?.table === base && built.revision === revision) return name;
    // The store keeps its annotated rows through a change that moves none:
    // an edited message, a column annotation.
    const rows = this.store ? this.store.annotatedRows() : null;
    if (built?.table === base && built.rows === rows) {
      built.revision = revision;
      return name;
    }

    const packed: number[] = [];
    if (rows) {
      const { rowIds, masks } = rows;
      for (let i = 0; i < rowIds.length; i++) {
        const rowId = rowIds[i]!;
        if (Number.isInteger(rowId) && rowId >= 0 && rowId < 2 ** 50) {
          packed.push(rowId * 8 + masks[i]!);
        }
      }
    }
    const table = quoteIdentifier(name);
    await this.bridge.query(
      packed.length === 0
        ? `CREATE OR REPLACE TEMP TABLE ${table} ("__rowid__" BIGINT, "__mask__" UTINYINT)`
        : `CREATE OR REPLACE TEMP TABLE ${table} AS SELECT CAST(v // 8 AS BIGINT) AS "__rowid__",` +
            ` CAST(v % 8 AS UTINYINT) AS "__mask__"` +
            ` FROM (SELECT CAST(unnest(string_split('${packed.join(',')}', ',')) AS BIGINT) AS v)`,
      signal,
      // Someone is waiting on it, as on the navigation queries that read it.
      { cache: false, priority: 'elevated' },
    );
    this.built = { table: base, revision, rows };
    return name;
  }
}
