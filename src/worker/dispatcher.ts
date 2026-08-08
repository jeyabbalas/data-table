/**
 * Worker message dispatcher — separated from `worker.ts` so it can be
 * unit-tested without `self.onmessage` / `self.postMessage` side effects
 * at module load.
 *
 * `worker.ts` is a tiny wrapper that imports `handleMessage` and posts the
 * `__ready__` sentinel. Tests construct a synthetic `respond` and drive
 * `handleMessage` directly.
 */

import {
  initializeDuckDB,
  executeQueryCancellable,
  getConnection,
  getDatabase,
  isInitialized,
} from './duckdb';
import type { LoaderContext } from './loaders/common';
import { loadCSV } from './loaders/csv';
import { loadJSON } from './loaders/json';
import { loadParquet } from './loaders/parquet';
import type {
  WorkerMessage,
  WorkerResponseType,
  ErrorPayload,
  InitPayload,
  QueryPayload,
  LoadPayload,
  ExportPayload,
  CancelPayload,
} from './types';

export type Respond = (id: string, type: WorkerResponseType, payload: unknown) => void;

/** Message types that run through the queue — everything except `cancel`. */
export type RunnableType = 'init' | 'query' | 'load' | 'export';

interface QueueEntry {
  message: WorkerMessage;
  /** Narrowed once at enqueue so `runTask` needs no cast. */
  type: RunnableType;
  respond: Respond;
  /** Resolves the promise `handleMessage` returned for THIS message. */
  done: () => void;
}

/**
 * Messages are serialized through an explicit three-priority FIFO:
 * `high` for viewport row fetches, `low` for visualization and
 * column-stats scans, `normal` for everything else — `init`, `load`,
 * `export`, and every query that did not ask for a tier. `pump()` drains
 * strictly high → normal → low and runs exactly one task at a time
 * (`running`); `cancel` messages bypass the queue entirely — a queued
 * target is removed without touching DuckDB, the running target is
 * interrupted via the connection's pending-query cancel.
 *
 * Why serialization does not hurt: SQL execution already serializes
 * inside duckdb-wasm's single-threaded WASM worker, so concurrent
 * dispatch here only ever overlapped Arrow→JS materialization with the
 * next query's start. We trade that sliver for truthful cancel
 * targeting, free dequeue-cancellation of queued work, and priority.
 *
 * Why a cancel can never hit the wrong query: the running-id check and
 * the `cancelSent()` call happen in one synchronous frame, and a later
 * query's start message can only be posted to duckdb-wasm's inner
 * worker after the current task settles. Same-source postMessage is
 * FIFO, so the inner worker processes the cancel before any later query
 * starts. If the target already finished, the cancel lands on an empty
 * pending slot and returns `false` — it never throws at an innocent
 * query.
 *
 * Priority starvation is accepted by design at both ends, for the same
 * reason. Only viewport row fetches should be posted with
 * `priority: 'high'`, and those are bounded by scroll activity.
 * Symmetrically, `'low'` work may be starved by a busy grid because it
 * too is bounded — by the **visible column set**: viz/stats fetches are
 * issued only for headers currently on screen, so the low queue is
 * O(visible columns), not O(table width), and it drains the moment
 * scrolling pauses. Decorative work waiting on interactive work is the
 * outcome we want.
 */
let highQueue: QueueEntry[] = [];
let normalQueue: QueueEntry[] = [];
let lowQueue: QueueEntry[] = [];
let running: { id: string; type: RunnableType } | null = null;

/**
 * Bumped by `__resetDispatcherForTests` so `finally` handlers of tasks
 * started before a reset cannot clear the fresh state or pump stale
 * queues.
 */
let epoch = 0;

/**
 * @internal Test-only — clear the queues and the running slot.
 * Production code never calls this; `pump()`'s `finally` owns the
 * lifecycle.
 */
export function __resetDispatcherForTests(): void {
  epoch += 1;
  highQueue = [];
  normalQueue = [];
  lowQueue = [];
  running = null;
}

/**
 * @internal Test-only — read the running-task reference for assertions.
 */
export function __getRunningForTests(): { id: string; type: RunnableType } | null {
  return running;
}

/**
 * @internal Test-only — read the queue depths for assertions.
 */
export function __getQueueDepthsForTests(): { high: number; normal: number; low: number } {
  return { high: highQueue.length, normal: normalQueue.length, low: lowQueue.length };
}

/**
 * Heuristic: was this rejection caused by `connection.cancelSent()`?
 *
 * DuckDB does not ship a typed `CancelledError`; the rejection arrives as
 * a generic `Error` with an interrupt-shaped message. Best-effort match on
 * the canonical phrases — kept here behind a single helper so the
 * fragility is documented in one place. The pending-query path rejects
 * with exactly 'query was canceled'; a poll that races the cancel can
 * also reject with 'No active pending query'.
 */
export function isCancelRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || '';
  return (
    /\bINTERRUPT\b/i.test(message) ||
    /interrupted/i.test(message) ||
    /cancell?ed/i.test(message) ||
    /no active pending query/i.test(message)
  );
}

/**
 * Build an error payload from a caught value, preserving any `code` /
 * `details` that loaders attached to the thrown `Error`. The main-thread
 * bridge passes this payload to `reconstructError()` to materialize a
 * typed subclass.
 */
export function toErrorPayload(
  error: unknown,
  fallbackMessage: string,
  fallbackCode?: string,
): ErrorPayload {
  if (error instanceof Error) {
    const withMeta = error as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };
    const payload: ErrorPayload = {
      message: error.message || fallbackMessage,
    };
    if (withMeta.code) payload.code = withMeta.code;
    else if (fallbackCode) payload.code = fallbackCode;
    if (withMeta.details) payload.details = withMeta.details;
    return payload;
  }
  return {
    message: fallbackMessage,
    ...(fallbackCode ? { code: fallbackCode } : {}),
  };
}

/**
 * Dispatch one inbound message. Calls `respond(id, type, payload)` for
 * every reply (results, errors, progress). The returned promise resolves
 * when this message's processing completes — for queued work, after its
 * task has run (or it was dequeued by a cancel); for `cancel`, when the
 * cancel is answered.
 */
export function handleMessage(message: WorkerMessage, respond: Respond): Promise<void> {
  const { id, type, payload } = message;

  if (type === 'cancel') {
    return handleCancel(message, respond);
  }

  if (type !== 'init' && type !== 'query' && type !== 'load' && type !== 'export') {
    respond(id, 'error', {
      message: `Unknown message type: ${String(type)}`,
      code: 'INVARIANT',
    });
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    // Only a `query` can leave the default tier, and only by asking for
    // one explicitly. `init`, `load`, and `export` carry no `priority`
    // field at all, so they must fall through to `normalQueue` — never to
    // `low`. Demoting them would put a background load behind every
    // queued viz scan (a thousand of them on a wide table), converting a
    // foreground data load into an unbounded wait on decorative work.
    const priority = type === 'query' ? (payload as QueryPayload | undefined)?.priority : undefined;
    const queue = priority === 'high' ? highQueue : priority === 'low' ? lowQueue : normalQueue;
    queue.push({ message, type, respond, done: resolve });
    pump();
  });
}

/**
 * Start the next task if none is running. The dequeue happens
 * synchronously — before any await — so `running` is truthful the moment
 * `handleMessage` returns, and a settling task chains straight into the
 * next one inside its `finally`.
 */
function pump(): void {
  if (running) return;
  const entry = highQueue.shift() ?? normalQueue.shift() ?? lowQueue.shift();
  if (!entry) return;

  running = { id: entry.message.id, type: entry.type };
  const startedEpoch = epoch;
  void runTask(entry).finally(() => {
    if (epoch === startedEpoch && running?.id === entry.message.id) {
      running = null;
      pump();
    }
    entry.done();
  });
}

/**
 * Execute one queued task. Response shapes, progress emissions, and
 * error mapping are the per-type contract; `pump()` owns the lifecycle
 * (the `running` slot and chaining into the next task).
 */
async function runTask(entry: QueueEntry): Promise<void> {
  const { message, respond } = entry;
  const { id, payload } = message;

  try {
    switch (entry.type) {
      case 'init': {
        const { bundles } = (payload as InitPayload) ?? {};
        await initializeDuckDB(bundles);
        respond(id, 'result', { initialized: true });
        break;
      }

      case 'query': {
        // Evaluated at execution time: a query queued behind a running
        // `init` correctly waits for it instead of racing it.
        if (!isInitialized()) {
          respond(id, 'error', {
            message: 'DuckDB not initialized',
            code: 'BRIDGE_NOT_READY',
          });
          break;
        }
        const { sql } = payload as QueryPayload;
        try {
          const rows = await executeQueryCancellable(sql);
          respond(id, 'result', { rows });
        } catch (error) {
          if (isCancelRejection(error)) {
            respond(id, 'error', {
              message: error instanceof Error ? error.message : 'Query was cancelled',
              code: 'QUERY_CANCELLED',
            });
          } else {
            throw error;
          }
        }
        break;
      }

      case 'load': {
        if (!isInitialized()) {
          respond(id, 'error', {
            message: 'DuckDB not initialized',
            code: 'BRIDGE_NOT_READY',
          });
          break;
        }

        const { data, format, tableName } = payload as LoadPayload;

        // The loaders report their own stages. What used to be here was three
        // fixed percentages posted around an opaque `await` — the bar jumped
        // to 25 and sat there for the whole load — and `parsing` claimed to
        // be cancelable, which no running DuckDB statement is. This context
        // is the first one production ever constructs; before Phase 1 the
        // `LoaderContext` seam existed for tests only.
        const context: LoaderContext = {
          reportProgress: (info) => respond(id, 'progress', info),
        };

        try {
          let result;

          if (format === 'csv') {
            result = await loadCSV(data, { tableName }, context);
          } else if (format === 'json') {
            result = await loadJSON(data, { tableName }, context);
          } else if (format === 'parquet') {
            // `DataLoader` normalizes every source to bytes before it gets
            // here, so the string branch is only reachable through a direct
            // `WorkerBridge.loadData(string, { format: 'parquet' })` — kept
            // for that path, not for the facade.
            const buffer = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
            result = await loadParquet(buffer, { tableName }, context);
          } else {
            respond(id, 'error', {
              message: `Format '${format}' not yet supported`,
              code: 'LOAD_FORMAT_UNSUPPORTED',
            });
            break;
          }

          respond(id, 'result', {
            loaded: true,
            tableName: result.tableName,
            rowCount: result.rowCount,
            columns: result.columns,
            schema: result.schema,
          });
        } catch (error) {
          if (isCancelRejection(error)) {
            respond(id, 'error', {
              message: error instanceof Error ? error.message : 'Load was cancelled',
              code: 'QUERY_CANCELLED',
            });
          } else {
            respond(id, 'error', toErrorPayload(error, 'Failed to load data', 'LOAD_PARSE_FAILED'));
          }
        }
        break;
      }

      case 'export': {
        if (!isInitialized()) {
          respond(id, 'error', {
            message: 'DuckDB not initialized',
            code: 'BRIDGE_NOT_READY',
          });
          break;
        }

        const { sql: exportSql, format: exportFormat } = payload as ExportPayload;
        const exportFileName = `__export_${id}.${exportFormat}`;

        try {
          const exportConn = getConnection();
          const exportDb = getDatabase();

          await exportConn.query(
            `COPY (${exportSql}) TO '${exportFileName}' (FORMAT ${exportFormat.toUpperCase()})`,
          );

          const fileBuffer = await exportDb.copyFileToBuffer(exportFileName);
          await exportDb.dropFile(exportFileName);

          respond(id, 'result', { buffer: fileBuffer.buffer });
        } catch (error) {
          try {
            await getDatabase().dropFile(exportFileName);
          } catch {
            // Ignore cleanup errors
          }
          if (isCancelRejection(error)) {
            respond(id, 'error', {
              message: error instanceof Error ? error.message : 'Export was cancelled',
              code: 'QUERY_CANCELLED',
            });
          } else {
            respond(id, 'error', toErrorPayload(error, 'Export failed', 'EXPORT_FAILED'));
          }
        }
        break;
      }
    }
  } catch (error) {
    respond(id, 'error', toErrorPayload(error, 'Unknown error', 'QUERY_RUNTIME'));
  }
}

/**
 * Handle a `cancel` message out-of-band — it never enters the queue, so
 * it can act while another task is running.
 *
 * - A **queued** target is dequeued for free: it gets a
 *   `QUERY_CANCELLED` error reply without DuckDB ever seeing it.
 * - The **running** target is forwarded to `cancelSent()`. For `query`
 *   tasks this genuinely interrupts execution once queries run through
 *   the pending-query path. For `load`/`export` tasks the underlying
 *   `conn.query()` calls are not interruptible — cancellation remains
 *   delivery-suppression by the bridge (late replies to aborted ids are
 *   dropped), exactly as before the queue existed.
 * - A running `init` is not cancellable: mid-init there is no
 *   connection yet, so `getConnection()` would throw out of the cancel
 *   path.
 */
async function handleCancel(message: WorkerMessage, respond: Respond): Promise<void> {
  const { id } = message;
  const targetId = (message.payload as CancelPayload | undefined)?.targetId;

  if (typeof targetId !== 'string') {
    respond(id, 'result', { cancelled: false, reason: 'no-matching-inflight' });
    return;
  }

  // Every tier is scanned, and the tier that held the entry is known from
  // the loop rather than re-derived afterwards. A `find`-then-`includes`
  // pair silently misses whichever queue it was not taught about, and a
  // missed queued target falls through to `no-matching-inflight` below
  // without ever calling `done()` — leaking the promise `handleMessage`
  // returned for the cancelled message for the lifetime of the worker.
  for (const queue of [highQueue, normalQueue, lowQueue]) {
    const index = queue.findIndex((entry) => entry.message.id === targetId);
    if (index === -1) continue;
    const [queued] = queue.splice(index, 1);
    queued.respond(targetId, 'error', {
      message: 'Cancelled before execution',
      code: 'QUERY_CANCELLED',
    });
    queued.done();
    respond(id, 'result', { cancelled: true, reason: 'dequeued' });
    return;
  }

  if (running?.id === targetId) {
    if (running.type === 'init') {
      respond(id, 'result', { cancelled: false, reason: 'not-cancellable' });
      return;
    }
    try {
      const cancelled = await getConnection().cancelSent();
      respond(id, 'result', { cancelled });
    } catch (error) {
      respond(id, 'error', toErrorPayload(error, 'Cancel failed', 'QUERY_RUNTIME'));
    }
    return;
  }

  respond(id, 'result', { cancelled: false, reason: 'no-matching-inflight' });
}
