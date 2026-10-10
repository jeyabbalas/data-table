/**
 * Fakes for annotation navigation tests: a model of the annotation store's
 * navigation surface written the slow, obvious way, a grid body that holds
 * whatever rows a test says, and a host that records what the navigator did.
 *
 * The model is the reference the navigator's tiers are checked against: a
 * mask is the OR of the severity bits (error 1, warning 2, info 4) of the
 * annotations it covers, and `getByCell` sorts by severity, then
 * `createdAt` (missing last), then insertion.
 */
import { vi } from 'vitest';

import type { AnnotatedRowsSource } from '@/annotations/annotatedRowsSource';
import type {
  AnnotationNavigatorHost,
  NavigatorBody,
  NavigatorStore,
} from '@/annotations/AnnotationNavigator';
import type { Annotation, AnnotationSeverity, SeverityFilter } from '@/annotations/types';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema, type TableState } from '@/core/State';
import { defaultStrings, type Strings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

export const BIT: Record<AnnotationSeverity, number> = { error: 1, warning: 2, info: 4 };
const RANK: Record<AnnotationSeverity, number> = { error: 0, warning: 1, info: 2 };

type NewAnn =
  | {
      scope: 'row';
      rowId: number;
      severity: AnnotationSeverity;
      message?: string;
      createdAt?: string;
    }
  | {
      scope: 'column';
      column: string;
      severity: AnnotationSeverity;
      message?: string;
      createdAt?: string;
    }
  | {
      scope: 'cell';
      rowId: number;
      column: string;
      severity: AnnotationSeverity;
      message?: string;
      createdAt?: string;
    };

/** The annotation store's navigation surface, computed from a plain list on every call. */
export class ModelStore implements NavigatorStore {
  readonly list: Annotation[] = [];
  filter: SeverityFilter = { error: true, warning: true, info: true };
  contentRevision = 0;
  /** How many times `annotatedRows()` was built. */
  builds = 0;
  private cache: { revision: number; rows: { rowIds: Float64Array; masks: Uint8Array } } | null =
    null;

  constructor(annotations: NewAnn[] = []) {
    this.add(...annotations);
  }

  add(...annotations: NewAnn[]): this {
    for (const a of annotations) {
      this.list.push({
        id: `a${this.list.length}`,
        message: a.message ?? `${a.severity} ${this.list.length}`,
        ...a,
      } as Annotation);
    }
    if (annotations.length > 0) this.contentRevision++;
    return this;
  }

  remove(predicate: (a: Annotation) => boolean): this {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (predicate(this.list[i]!)) this.list.splice(i, 1);
    }
    this.contentRevision++;
    return this;
  }

  private sorted(anns: Annotation[]): Annotation[] {
    const index = new Map(this.list.map((a, i) => [a, i]));
    return [...anns].sort((a, b) => {
      const sev = RANK[a.severity] - RANK[b.severity];
      if (sev !== 0) return sev;
      const at = a.createdAt ?? '￿';
      const bt = b.createdAt ?? '￿';
      if (at !== bt) return at < bt ? -1 : 1;
      return index.get(a)! - index.get(b)!;
    });
  }

  getByCell(rowId: number, column: string): Annotation[] {
    return this.sorted(
      this.list.filter(
        (a) =>
          (a.scope === 'row' && a.rowId === rowId) ||
          (a.scope === 'column' && a.column === column) ||
          (a.scope === 'cell' && a.rowId === rowId && a.column === column),
      ),
    );
  }

  /** In insertion order, as the store gives them. */
  getByRow(rowId: number): Annotation[] {
    return this.list.filter((a) => a.scope !== 'column' && a.rowId === rowId);
  }

  getSeverityFilter(): SeverityFilter {
    return { ...this.filter };
  }

  private maskOf(anns: Annotation[]): number {
    let mask = 0;
    for (const a of anns) mask |= BIT[a.severity];
    return mask;
  }

  cellScopeMask(rowId: number, column: string): number {
    return this.maskOf(
      this.list.filter((a) => a.scope === 'cell' && a.rowId === rowId && a.column === column),
    );
  }

  rowScopeMask(rowId: number): number {
    return this.maskOf(this.list.filter((a) => a.scope === 'row' && a.rowId === rowId));
  }

  annotatedRowMask(rowId: number): number {
    return this.maskOf(this.list.filter((a) => a.scope !== 'column' && a.rowId === rowId));
  }

  annotatedRows(): { rowIds: Float64Array; masks: Uint8Array } {
    if (this.cache?.revision === this.contentRevision) return this.cache.rows;
    this.builds++;
    const masks = new Map<number, number>();
    for (const a of this.list) {
      if (a.scope === 'column') continue;
      masks.set(a.rowId, (masks.get(a.rowId) ?? 0) | BIT[a.severity]);
    }
    const ids = [...masks.keys()].sort((a, b) => a - b);
    const rows = {
      rowIds: Float64Array.from(ids),
      masks: Uint8Array.from(ids.map((id) => masks.get(id)!)),
    };
    this.cache = { revision: this.contentRevision, rows };
    return rows;
  }

  count(): number {
    return this.list.length;
  }
}

/** A grid body holding the rows a test puts in `cache`, by position. */
export class FakeBody implements NavigatorBody {
  /** Position → `__rowid__` of the rows held. */
  readonly cache = new Map<number, number>();
  positions = false;
  readonly scrollToRow = vi.fn<(index: number, align?: 'start' | 'center' | 'end') => void>();
  readonly cancelScrollAnimation = vi.fn<() => void>();
  /** How many held rows were read. */
  reads = 0;

  /** Hold the rows `from` to `to` (exclusive), each with `rowIdAt(position)`. */
  hold(from: number, to: number, rowIdAt: (position: number) => number = (p) => p): this {
    for (let p = from; p < to; p++) this.cache.set(p, rowIdAt(p));
    return this;
  }

  cachedRowId(position: number): number | null {
    this.reads++;
    return this.cache.get(position) ?? null;
  }

  cachedPositionOf(rowId: number): number | null {
    for (const [position, id] of this.cache) if (id === rowId) return position;
    return null;
  }

  rowIdsArePositions(): boolean {
    return this.positions;
  }
}

export interface FakeHost extends AnnotationNavigatorHost {
  readonly state: TableState;
  readonly actions: StateActions;
  readonly body: FakeBody;
  readonly announce: ReturnType<typeof vi.fn<(message: string) => void>>;
  readonly revealColumn: ReturnType<typeof vi.fn<(column: string) => void>>;
  readonly closeOverlays: ReturnType<typeof vi.fn<() => void>>;
  /** Resolve the filter cycle a test holds open with `holdFilterCycle`. */
  settleFilterCycle(): void;
  holdFilterCycle(): void;
}

export const NAV_SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'b', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'c', type: 'float', nullable: true, originalType: 'DOUBLE' },
  { name: 'd', type: 'nested', nullable: true, originalType: 'INTEGER[]' },
];

/**
 * A host over a table of `rows` rows with {@link NAV_SCHEMA} (`__rowid__`
 * hidden), a bridge that answers with `answer`, a source whose helper is
 * named `helper`, and `store`.
 */
export function makeHost(
  options: {
    rows?: number;
    store?: NavigatorStore | null;
    schema?: ColumnSchema[];
    answer?: (sql: string) => Record<string, unknown>[];
    bridge?: Pick<WorkerBridge, 'query'>;
    source?: AnnotatedRowsSource;
    messages?: Strings;
  } = {},
): FakeHost & { queries: string[] } {
  const schema = options.schema ?? NAV_SCHEMA;
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.visibleColumns.set(schema.filter((c) => !c.system).map((c) => c.name));
  state.totalRows.set(options.rows ?? 100);
  state.filteredRows.set(options.rows ?? 100);

  const queries: string[] = [];
  const bridge =
    options.bridge ??
    ({
      query: vi.fn(async (sql: string, signal?: AbortSignal) => {
        queries.push(sql);
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'QUERY_ABORTED' });
        return options.answer?.(sql) ?? [];
      }),
    } as unknown as Pick<WorkerBridge, 'query'>);
  const actions = new StateActions(state, {
    query: bridge.query,
    clearQueryCache: () => undefined,
  } as unknown as WorkerBridge);
  const body = new FakeBody();
  let held: { promise: Promise<void>; resolve: () => void } | null = null;
  const host = {
    state,
    actions,
    bridge,
    store: options.store === undefined ? new ModelStore() : options.store,
    source:
      options.source ??
      ({ ensureFresh: vi.fn(async () => 'helper') } satisfies AnnotatedRowsSource),
    messages: options.messages ?? defaultStrings,
    body,
    getTableBody: () => body,
    whenFilterCycleSettled: () => held?.promise ?? Promise.resolve(),
    holdFilterCycle: () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      held = { promise, resolve };
    },
    settleFilterCycle: () => {
      held?.resolve();
      held = null;
    },
    revealColumn: vi.fn<(column: string) => void>(),
    closeOverlays: vi.fn<() => void>(),
    announce: vi.fn<(message: string) => void>(),
    queries,
  };
  return host;
}
