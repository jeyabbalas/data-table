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
  executeQuery,
  getConnection,
  getDatabase,
  isInitialized,
} from './duckdb';
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
} from './types';

export type Respond = (id: string, type: WorkerResponseType, payload: unknown) => void;

/**
 * Currently-running operation, tracked so a `cancel` message can route to
 * `connection.cancelSent()` for the right query/load/export. The worker
 * dispatches messages serially, so at most one in-flight at a time per
 * worker.
 */
let inFlight: { id: string; type: 'query' | 'load' | 'export' } | null = null;

/**
 * @internal Test-only — drop the in-flight reference. Production code
 * never calls this; the `finally` blocks in each case clear it
 * automatically.
 */
export function __resetInFlightForTests(): void {
  inFlight = null;
}

/**
 * @internal Test-only — read the in-flight reference shape for assertions.
 */
export function __getInFlightForTests(): { id: string; type: 'query' | 'load' | 'export' } | null {
  return inFlight;
}

/**
 * Heuristic: was this rejection caused by `connection.cancelSent()`?
 *
 * DuckDB does not ship a typed `CancelledError`; the rejection arrives as
 * a generic `Error` with an interrupt-shaped message. Best-effort match on
 * the canonical phrases — kept here behind a single helper so the
 * fragility is documented in one place.
 */
export function isCancelRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message || '';
  return (
    /\bINTERRUPT\b/i.test(message) || /interrupted/i.test(message) || /cancell?ed/i.test(message)
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
 * every reply (results, errors, progress).
 */
export async function handleMessage(message: WorkerMessage, respond: Respond): Promise<void> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case 'init': {
        const { bundles } = (payload as InitPayload) ?? {};
        await initializeDuckDB(bundles);
        respond(id, 'result', { initialized: true });
        break;
      }

      case 'query': {
        if (!isInitialized()) {
          respond(id, 'error', {
            message: 'DuckDB not initialized',
            code: 'BRIDGE_NOT_READY',
          });
          break;
        }
        const { sql } = payload as QueryPayload;
        inFlight = { id, type: 'query' };
        try {
          const rows = await executeQuery(sql);
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
        } finally {
          if (inFlight?.id === id) inFlight = null;
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

        respond(id, 'progress', {
          stage: 'reading',
          percent: 0,
          cancelable: true,
        });

        inFlight = { id, type: 'load' };
        try {
          let result;

          if (format === 'csv') {
            respond(id, 'progress', {
              stage: 'parsing',
              percent: 25,
              cancelable: true,
            });
            result = await loadCSV(data, { tableName });
            respond(id, 'progress', {
              stage: 'indexing',
              percent: 90,
              cancelable: false,
            });
          } else if (format === 'json') {
            respond(id, 'progress', {
              stage: 'parsing',
              percent: 25,
              cancelable: true,
            });
            result = await loadJSON(data, { tableName });
            respond(id, 'progress', {
              stage: 'indexing',
              percent: 90,
              cancelable: false,
            });
          } else if (format === 'parquet') {
            respond(id, 'progress', {
              stage: 'parsing',
              percent: 25,
              cancelable: true,
            });
            const buffer = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
            result = await loadParquet(buffer, { tableName });
            respond(id, 'progress', {
              stage: 'indexing',
              percent: 90,
              cancelable: false,
            });
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
        } finally {
          if (inFlight?.id === id) inFlight = null;
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

        inFlight = { id, type: 'export' };
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
        } finally {
          if (inFlight?.id === id) inFlight = null;
        }
        break;
      }

      case 'cancel': {
        const { targetId } = (payload as { targetId?: string } | undefined) ?? {};
        if (inFlight && typeof targetId === 'string' && inFlight.id === targetId) {
          try {
            const cancelled = await getConnection().cancelSent();
            respond(id, 'result', { cancelled });
          } catch (error) {
            respond(id, 'error', toErrorPayload(error, 'Cancel failed', 'QUERY_RUNTIME'));
          }
        } else {
          respond(id, 'result', { cancelled: false, reason: 'no-matching-inflight' });
        }
        break;
      }

      default:
        respond(id, 'error', {
          message: `Unknown message type: ${type}`,
          code: 'INVARIANT',
        });
    }
  } catch (error) {
    respond(id, 'error', toErrorPayload(error, 'Unknown error', 'QUERY_RUNTIME'));
  }
}
