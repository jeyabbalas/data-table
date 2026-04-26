/**
 * Web Worker entry point
 * Handles all DuckDB operations in a separate thread
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
  WorkerResponse,
  WorkerResponseType,
  ErrorPayload,
  InitPayload,
  QueryPayload,
  LoadPayload,
  ExportPayload,
} from './types';

// Send response back to main thread
function respond(id: string, type: WorkerResponseType, payload: unknown): void {
  const response: WorkerResponse = { id, type, payload };
  self.postMessage(response);
}

/**
 * Build an error payload from a caught value, preserving any `code` /
 * `details` that loaders attached to the thrown `Error`. The main-thread
 * bridge passes this payload to `reconstructError()` to materialize a
 * typed subclass.
 */
function toErrorPayload(
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

// Handle incoming messages
async function handleMessage(message: WorkerMessage): Promise<void> {
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
        const rows = await executeQuery(sql);
        respond(id, 'result', { rows });
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

        // Report start of loading
        respond(id, 'progress', {
          stage: 'reading',
          percent: 0,
          cancelable: true,
        });

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

            // Parquet requires ArrayBuffer
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
          respond(id, 'error', toErrorPayload(error, 'Failed to load data', 'LOAD_PARSE_FAILED'));
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
          // Clean up file on error
          try {
            await getDatabase().dropFile(exportFileName);
          } catch {
            // Ignore cleanup errors
          }
          respond(id, 'error', toErrorPayload(error, 'Export failed', 'EXPORT_FAILED'));
        }
        break;
      }

      case 'cancel':
        // TODO: Cancel operation
        respond(id, 'result', { cancelled: true });
        break;

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

// Set up message listener
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  await handleMessage(event.data);
};

// Signal that worker is ready
self.postMessage({ id: '__ready__', type: 'result', payload: { ready: true } });
