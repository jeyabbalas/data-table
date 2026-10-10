/**
 * The DuckDB table of a table's annotated rows, kept current with its
 * annotation store (see `annotatedRowsSource.ts` for its shape). The
 * `annotated` filter keeps a view's rows through it, and annotation
 * navigation finds the next annotated row of a sorted or filtered view with
 * it.
 *
 * Nothing is sent to DuckDB until something reads the table: an annotated
 * filter in force, or a caller of `ensureFresh` (navigation, an export, a
 * read of the filtered rows). It is then synced when the store's content
 * has changed since the last sync, rebuilt whole in one statement.
 */

import type { ReadGate, StateActions } from '../core/Actions';
import { DataTableError, QueryError } from '../core/errors';
import { nextTask } from '../core/nextTask';
import type { TableState } from '../core/State';
import type { Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import { quoteIdentifier } from '../filters/FilterSQL';
import { annotatedRowsTableName, type AnnotatedRowsSource } from './annotatedRowsSource';
import type { AnnotationStore } from './AnnotationStore';

/** Packed rows in each chunk of a sync's statement text; the build yields between chunks. */
const CHUNK_SIZE = 100_000;

/** The least time between the end of one sync the view asks for and the start of the next, in ms. */
const MIN_INTERVAL_MS = 150;

/**
 * The end of the rowIds a sync writes: a rowId and its mask are packed as
 * `rowId * 8 + mask`, which a double holds exactly below 2^53. No row has a
 * rowId that is not an integer in [0, 2^50).
 */
const ROW_ID_END = 2 ** 50;

/**
 * The statement that replaces the DuckDB table `table` with the annotated
 * rows `rows` (ascending `rowIds`, each with the severity bits of its row-
 * and cell-scope annotations in `masks`): a temporary table, which lives on
 * the worker's one connection, as every query does.
 *
 * Each row goes in as one number, `rowId * 8 + mask`, all of them in one
 * VARCHAR literal that DuckDB splits and casts back. For a million rows that
 * takes about 0.3 s, where `INSERT … VALUES` batches took 5 s and a list
 * literal 4 s. The text is built `chunkSize` rows at a time, awaiting
 * `yieldNow` between chunks, so the main thread is not held for the whole
 * of it. A rowId that is not an integer in [0, 2^50) is left out: no row
 * has one, and it would not pack exactly. Resolves `null` when `signal`
 * aborts first.
 *
 * @internal
 */
export async function annotatedRowsStatement(
  table: string,
  rows: { readonly rowIds: Float64Array; readonly masks: Uint8Array },
  {
    chunkSize = CHUNK_SIZE,
    yieldNow = nextTask,
    signal,
  }: {
    chunkSize?: number | undefined;
    yieldNow?: (() => Promise<void>) | undefined;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<string | null> {
  const { rowIds, masks } = rows;
  const packed = new Float64Array(Math.min(chunkSize, rowIds.length));
  const chunks: string[] = [];
  for (let start = 0; start < rowIds.length; start += chunkSize) {
    if (start > 0) await yieldNow();
    if (signal?.aborted) return null;
    const end = Math.min(start + chunkSize, rowIds.length);
    let count = 0;
    for (let i = start; i < end; i++) {
      const rowId = rowIds[i]!;
      if (!(rowId >= 0 && rowId < ROW_ID_END && Number.isInteger(rowId))) continue;
      packed[count++] = rowId * 8 + (masks[i]! & 7);
    }
    if (count > 0) chunks.push(packed.subarray(0, count).join(','));
  }
  const name = quoteIdentifier(table);
  if (chunks.length === 0) {
    return `CREATE OR REPLACE TEMP TABLE ${name} ("__rowid__" BIGINT, "__mask__" UTINYINT)`;
  }
  // Digits and commas only: nothing in the literal to escape.
  return (
    `CREATE OR REPLACE TEMP TABLE ${name} AS ` +
    `SELECT CAST(v >> 3 AS BIGINT) AS "__rowid__", CAST(v & 7 AS UTINYINT) AS "__mask__" ` +
    `FROM (SELECT CAST(s AS BIGINT) AS v FROM (SELECT unnest(string_split('${chunks.join(',')}', ',')) AS s))`
  );
}

/** What the table reads of an annotation store. */
type AnnotatedRowsStore = Pick<AnnotationStore, 'contentRevision' | 'annotatedRows' | 'on'>;

/** Options for {@link AnnotatedRowsTable}. @internal */
export interface AnnotatedRowsTableOptions {
  state: TableState;
  actions: Pick<StateActions, 'addReadGate' | 'readGateOpened'>;
  bridge: Pick<WorkerBridge, 'query' | 'clearQueryCache'>;
  store: AnnotatedRowsStore;
  /**
   * Called after a sync changed the table while an annotated filter in
   * force had the view read it: the rows, the row count, the charts and the
   * stats the view shows are to be fetched again, in place. The bridge's
   * query cache is cleared by then.
   */
  onRefresh?: (() => void) | undefined;
  /** Called with the error a sync failed with. The table stays as it was. */
  onError?: ((error: DataTableError) => void) | undefined;
  /** Rows in each chunk of a sync's statement text. Default 100,000. */
  chunkSize?: number | undefined;
  /**
   * The least time, in ms, between the end of a sync and the start of the
   * next one the view asks for, or the time the last sync took when longer.
   * Default 150.
   */
  minInterval?: number | undefined;
}

/** The store's annotated rows, as `annotatedRows()` returns them. */
type AnnotatedRows = ReturnType<AnnotatedRowsStore['annotatedRows']>;

/** A sync: which table and content it writes, and the filters in force as it started. */
interface Sync {
  readonly base: string;
  readonly revision: number;
  readonly rows: AnnotatedRows;
  readonly filters: readonly Filter[];
  readonly controller: AbortController;
}

/** A caller of `ensureFresh` waiting for a sync of `revision` or later. */
interface Waiter {
  readonly revision: number;
  readonly resolve: (table: string) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal | undefined;
  readonly onAbort: () => void;
}

/** The base table: the one the data loaded into, under its derived-column view if it has one. */
function baseTableOf(state: TableState): string | null {
  return state.baseTableName.get() ?? state.tableName.get();
}

/** Whether an annotated filter among `filters` keeps the annotated rows of `base`. */
function readsAnnotatedRows(filters: readonly Filter[], base: string): boolean {
  return filters.some((filter) => filter.type === 'annotated' && filter.table === base);
}

function abortedError(): QueryError {
  return new QueryError('Operation aborted', { code: 'QUERY_ABORTED' });
}

/**
 * Keeps a base table's DuckDB table of annotated rows current with the
 * annotation store, and holds the view's reads of it until it exists.
 *
 * **When it syncs.** Only when something reads the table and the store's
 * `contentRevision` has moved since the last sync. While an annotated filter
 * is in force, the view reads it: the first sync starts on a microtask, and
 * later ones, as annotations change, at most once every
 * `max(minInterval, the last sync's time)`. Otherwise a caller of
 * {@link ensureFresh} asks for one, which starts at once. One sync runs at
 * a time, and the next one written is the store's latest content, whatever
 * changed in between. A sync sends nothing when the store's annotated rows
 * are the ones the table holds, as after a change to a message or to column
 * scope; and a change to the severity filter changes no content at all.
 *
 * **The read gate.** An annotated filter that comes into force, restored
 * with a session, undone back, loaded with a preset or just added, would
 * query a table not yet built, or one built from older annotations: a
 * Catalog error, or the wrong rows for a moment. So until a sync has landed
 * since those filters came into force (or the table was current already),
 * the gate it adds to `actions` is closed, and the grid, the row count, the
 * charts and the stats panels wait. It is asked lazily, so it is closed
 * before the filters' subscribers run. It opens when the sync lands or
 * fails, when the filter goes, and when the table is destroyed. A later
 * sync, for annotations changed while the filter stays in force, holds
 * nothing: once it lands, `onRefresh` updates the view in place.
 *
 * The table is named from its base table (see `annotatedRowsTableName`), so
 * two tables on one bridge never share one. The table's owner drops it
 * wherever it drops the base table.
 *
 * @internal
 */
export class AnnotatedRowsTable implements AnnotatedRowsSource {
  private readonly state: TableState;
  private readonly actions: AnnotatedRowsTableOptions['actions'];
  private readonly bridge: AnnotatedRowsTableOptions['bridge'];
  private readonly store: AnnotatedRowsStore;
  private readonly onRefresh: (() => void) | undefined;
  private readonly onError: ((error: DataTableError) => void) | undefined;
  private readonly chunkSize: number;
  private readonly minInterval: number;

  /** The base table everything below is for; `null` with no table loaded. */
  private base: string | null;
  /** The store's `contentRevision` the DuckDB table holds, once a sync for `base` has landed. */
  private synced: number | null = null;
  /**
   * The store's annotated rows the DuckDB table holds. The store returns the
   * same object until a change to row or cell scope, so a change to a
   * message or to column scope finds it current, and sends nothing.
   */
  private syncedRows: AnnotatedRows | null = null;
  /** The filters the gate is open for: what the view may already have read. */
  private openFor: readonly Filter[] | null = null;
  private running: Sync | null = null;
  private waiters: Waiter[] = [];
  private microtaskQueued = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When the last sync ended and how long it took, in ms: the view's next waits for both. */
  private lastEnd = -Infinity;
  private lastDuration = 0;
  /** Stops listening to the store, which it does while an annotated filter is in force. */
  private offStoreChange: (() => void) | null = null;
  private readonly unsubscribes: (() => void)[];
  private readonly removeGate: () => void;
  private destroyed = false;

  constructor(options: AnnotatedRowsTableOptions) {
    this.state = options.state;
    this.actions = options.actions;
    this.bridge = options.bridge;
    this.store = options.store;
    this.onRefresh = options.onRefresh;
    this.onError = options.onError;
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE;
    this.minInterval = options.minInterval ?? MIN_INTERVAL_MS;
    this.base = baseTableOf(this.state);

    const gate: ReadGate = { isOpen: () => this.isGateOpen() };
    this.removeGate = this.actions.addReadGate(gate);
    this.unsubscribes = [
      this.state.filters.subscribe(() => this.onFiltersChanged()),
      this.state.baseTableName.subscribe(() => this.onBaseTableChanged()),
      this.state.tableName.subscribe(() => this.onBaseTableChanged()),
    ];
    this.onFiltersChanged();
  }

  /**
   * The table's name once it holds the store's current annotated rows: at
   * once when it does, after a sync otherwise. A sync of the annotations as
   * they were at the call, or later, is enough, though they may have changed
   * again since. Rejects with a `QueryError` coded `NO_TABLE` when no table
   * is loaded, `QUERY_ABORTED` when `signal` aborts first, the base table is
   * replaced first or this is destroyed, and with the error the sync failed
   * with.
   */
  ensureFresh(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted || this.destroyed) return Promise.reject(abortedError());
    const base = this.base;
    if (base === null) {
      return Promise.reject(new QueryError('No table loaded', { code: 'NO_TABLE' }));
    }
    const revision = this.store.contentRevision;
    if (this.synced === revision) return Promise.resolve(annotatedRowsTableName(base));
    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = {
        revision,
        resolve,
        reject,
        signal,
        onAbort: () => {
          this.dropWaiter(waiter);
          reject(abortedError());
        },
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      this.waiters.push(waiter);
      this.schedule();
    });
  }

  /**
   * Stop syncing and listening, abort a sync running, reject the callers of
   * {@link ensureFresh} waiting, and open the gate for good. Idempotent.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimer();
    this.running?.controller.abort();
    this.offStoreChange?.();
    this.offStoreChange = null;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.rejectWaiters(abortedError());
    this.removeGate();
  }

  // =========================================
  // The read gate
  // =========================================

  /**
   * Whether the view may read what the filters in force read. Closed while
   * an annotated filter reads this base table's annotated rows, no sync has
   * landed since these filters came into force, and the table is not
   * current; asking then queues the sync that opens it.
   */
  private isGateOpen(): boolean {
    const filters = this.state.filters.get();
    if (this.destroyed || filters === this.openFor) return true;
    const base = this.base;
    if (base === null || !readsAnnotatedRows(filters, base)) return true;
    if (this.isCurrent()) {
      // Open for these filters from now on: a later change to the
      // annotations updates the view in place instead of holding it.
      this.openFor = filters;
      return true;
    }
    this.queueSync();
    return false;
  }

  /** Whether the filters in force read the table and the gate holds the view off it. */
  private isGateWaiting(): boolean {
    return this.isLive() && this.state.filters.get() !== this.openFor && !this.isCurrent();
  }

  // =========================================
  // Scheduling
  // =========================================

  /** Whether an annotated filter in force reads the table, which the store's changes then sync. */
  private isLive(): boolean {
    return this.base !== null && readsAnnotatedRows(this.state.filters.get(), this.base);
  }

  /** Whether the table holds the store's current annotated rows. */
  private isCurrent(): boolean {
    return this.synced !== null && this.synced === this.store.contentRevision;
  }

  private onFiltersChanged(): void {
    if (this.destroyed) return;
    const live = this.isLive();
    if (live && !this.offStoreChange) {
      this.offStoreChange = this.store.on('change', () => this.onStoreChange());
    } else if (!live && this.offStoreChange) {
      this.offStoreChange();
      this.offStoreChange = null;
    }
    // Filters that read no table, or a current one, open the gate.
    this.actions.readGateOpened();
    this.schedule();
  }

  private onStoreChange(): void {
    // A change to the severity filter leaves the content, and the table, as
    // they are.
    if (!this.destroyed && !this.isCurrent()) this.schedule();
  }

  private onBaseTableChanged(): void {
    const base = baseTableOf(this.state);
    if (this.destroyed || base === this.base) return;
    // Everything known is of the table that went. A sync of it running is
    // aborted, and its waiters with it; its DuckDB table goes with its base
    // table, which the table's owner drops.
    this.base = base;
    this.synced = null;
    this.syncedRows = null;
    this.openFor = null;
    this.clearTimer();
    this.running?.controller.abort();
    this.rejectWaiters(abortedError());
    this.onFiltersChanged();
  }

  /**
   * Queue the next sync, if one is wanted: on a microtask for a caller of
   * {@link ensureFresh} or a view the gate holds, after the view's interval
   * for a view that reads the table already. With a sync running, its end
   * comes back here.
   */
  private schedule(): void {
    if (this.destroyed || this.running || this.base === null) return;
    if (this.isCurrent()) {
      this.clearTimer();
      return;
    }
    if (this.waiters.length > 0 || this.isGateWaiting()) {
      this.clearTimer();
      this.queueSync();
    } else if (this.isLive() && this.timer === null && !this.microtaskQueued) {
      const wait = this.lastEnd + Math.max(this.minInterval, this.lastDuration) - Date.now();
      this.timer = setTimeout(
        () => {
          this.timer = null;
          void this.sync();
        },
        Math.max(0, wait),
      );
    }
  }

  private queueSync(): void {
    if (this.microtaskQueued) return;
    this.microtaskQueued = true;
    queueMicrotask(() => {
      this.microtaskQueued = false;
      void this.sync();
    });
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  // =========================================
  // Syncing
  // =========================================

  /** Rebuild the table from the store's annotated rows now, if anything reads it. */
  private async sync(): Promise<void> {
    const base = this.base;
    if (this.destroyed || this.running || base === null || this.isCurrent()) return;
    if (this.waiters.length === 0 && !this.isLive()) return;
    this.clearTimer();
    const sync: Sync = {
      base,
      revision: this.store.contentRevision,
      rows: this.store.annotatedRows(),
      filters: this.state.filters.get(),
      controller: new AbortController(),
    };
    // The rows the table holds already: a change to a message, or to column
    // scope, which singles out no row. Nothing to send, nor to refresh.
    if (sync.rows === this.syncedRows) {
      this.landed(sync, null, false);
      return;
    }
    this.running = sync;
    const started = Date.now();
    let error: unknown = null;
    try {
      const sql = await annotatedRowsStatement(annotatedRowsTableName(base), sync.rows, {
        chunkSize: this.chunkSize,
        signal: sync.controller.signal,
      });
      if (sql !== null && !sync.controller.signal.aborted) {
        await this.bridge.query(sql, sync.controller.signal, {
          cache: false,
          priority: 'elevated',
        });
      }
    } catch (caught) {
      error = caught;
    }
    this.running = null;
    this.lastEnd = Date.now();
    this.lastDuration = this.lastEnd - started;
    this.landed(sync, error, true);
  }

  /**
   * What follows a sync, which `error` says failed, and `rebuilt` whether it
   * rebuilt the DuckDB table rather than finding it current.
   */
  private landed(sync: Sync, error: unknown, rebuilt: boolean): void {
    if (this.destroyed) return;
    // The base table changed under it, and what it built goes with the old one.
    if (sync.controller.signal.aborted || sync.base !== this.base) {
      this.schedule();
      return;
    }
    if (error === null) {
      this.synced = sync.revision;
      this.syncedRows = sync.rows;
      // Results cached before read the table as it was.
      if (rebuilt) this.bridge.clearQueryCache();
    } else {
      this.onError?.(
        error instanceof DataTableError
          ? error
          : new QueryError(error instanceof Error ? error.message : String(error), {
              code: 'QUERY_RUNTIME',
              cause: error,
            }),
      );
    }
    this.settleWaiters(sync, error);

    if (this.isLive()) {
      const filters = this.state.filters.get();
      if (filters === this.openFor) {
        // The view read the table as it was: fetch it again, in place.
        if (error === null && rebuilt) this.onRefresh?.();
      } else if (error !== null || filters === sync.filters || this.isCurrent()) {
        // A sync landed since these filters came into force: let the view
        // read. One that failed opens the gate too, so nothing waits for
        // good; the view's reads of the table fail as the sync did.
        this.openFor = filters;
        this.actions.readGateOpened();
      }
      // Else the filters came into force while it ran, and the annotations
      // changed since it started: the next sync, at once, opens the gate.
    }
    this.schedule();
  }

  /**
   * Settle the callers of {@link ensureFresh} that `sync` covers: those that
   * asked for annotations no newer than the ones it wrote.
   */
  private settleWaiters(sync: Sync, error: unknown): void {
    const table = annotatedRowsTableName(sync.base);
    for (const waiter of [...this.waiters]) {
      if (waiter.revision > sync.revision) continue;
      this.dropWaiter(waiter);
      if (error === null) waiter.resolve(table);
      else waiter.reject(error);
    }
  }

  private rejectWaiters(error: unknown): void {
    for (const waiter of [...this.waiters]) {
      this.dropWaiter(waiter);
      waiter.reject(error);
    }
  }

  private dropWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter);
    if (index !== -1) this.waiters.splice(index, 1);
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
  }
}
