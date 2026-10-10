/**
 * A helper table of annotated rows for tests that need one in DuckDB without
 * a table UI to keep it: built whole, with the statement `AnnotatedRowsTable`
 * sends, whenever the store's annotated rows changed since the last build.
 */
import {
  annotatedRowsTableName,
  type AnnotatedRowsSource,
} from '@/annotations/annotatedRowsSource';
import { annotatedRowsStatement } from '@/annotations/AnnotatedRowsTable';
import type { AnnotationStore } from '@/annotations/AnnotationStore';
import { QueryError } from '@/core/errors';
import type { TableState } from '@/core/State';
import type { WorkerBridge } from '@/data/WorkerBridge';

export class TestAnnotatedRowsSource implements AnnotatedRowsSource {
  /** The base table and the store's annotated rows the helper was last built from. */
  private built: { table: string; rows: object } | null = null;

  constructor(
    private readonly bridge: Pick<WorkerBridge, 'query'>,
    private readonly state: Pick<TableState, 'baseTableName'>,
    private readonly store: Pick<AnnotationStore, 'annotatedRows'>,
  ) {}

  async ensureFresh(signal?: AbortSignal): Promise<string> {
    const base = this.state.baseTableName.get();
    if (!base) throw new QueryError('No table loaded', { code: 'NO_TABLE' });
    const name = annotatedRowsTableName(base);
    // The store keeps the same object until a row or cell annotation changes.
    const rows = this.store.annotatedRows();
    if (this.built?.table === base && this.built.rows === rows) return name;
    const sql = await annotatedRowsStatement(name, rows, { signal });
    if (sql === null) throw new QueryError('Operation aborted', { code: 'QUERY_ABORTED' });
    await this.bridge.query(sql, signal);
    this.built = { table: base, rows };
    return name;
  }
}
