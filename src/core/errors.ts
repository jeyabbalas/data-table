/**
 * Typed error model for `@jeyabbalas/data-table`.
 *
 * All errors thrown by the library extend {@link DataTableError}, which
 * extends the native `Error`. Consumers can therefore continue to catch
 * with `instanceof Error`, or narrow to `instanceof DataTableError` and
 * branch on `err.code`.
 *
 * Error codes use `SCREAMING_SNAKE_CASE` and group by prefix:
 *
 * | Prefix        | Subclass              |
 * |---------------|-----------------------|
 * | `LOAD_*`      | {@link LoadError}            |
 * | `QUERY_*`     | {@link QueryError}           |
 * | `WORKER_*`    | {@link WorkerInitError} / {@link WorkerTerminatedError} (WORKER_TERMINATED only) |
 * | `SQL_*`       | {@link SQLValidationError}   |
 * | `EXPORT_*`    | {@link ExportError}          |
 * | `DERIVED_*`   | {@link DerivedColumnError}   |
 * | `PERSIST_*` / `IDB_*` | {@link PersistenceError} |
 * | `CONFIG_*` / `OPTIONS_*` / `CONTAINER_*` / `BRIDGE_*` / `INVARIANT` | {@link ConfigurationError} |
 * | `DESTROYED`   | {@link DestroyedError}       |
 *
 * {@link reconstructError} maps a plain `{ code, message, details }` payload
 * (the shape that crosses the worker boundary) back to the right subclass.
 */

import type { ErrorPayload } from '../worker/types';

export interface DataTableErrorOptions {
  code?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

/**
 * Base class for every error thrown by the library.
 *
 * @example
 * import { DataTableError } from '@jeyabbalas/data-table';
 *
 * table.on('error', ({ error, source }) => {
 *   if (error instanceof DataTableError) {
 *     log({ name: error.name, code: error.code, source, details: error.details });
 *   }
 * });
 */
export class DataTableError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? 'UNKNOWN';
    this.details = options.details;
  }

  toJSON(): {
    name: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  } {
    const cause = this.cause;
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      cause: cause instanceof Error ? cause.message : cause,
    };
  }
}

function withDefault(options: DataTableErrorOptions, defaultCode: string): DataTableErrorOptions {
  return { ...options, code: options.code ?? defaultCode };
}

/**
 * Worker bootstrap / crash / unsupported-environment failures.
 *
 * @example
 * try {
 *   await createDataTable({ container, source, strictBrowserCheck: true });
 * } catch (err) {
 *   if (err instanceof WorkerInitError && err.code === 'WORKER_UNSUPPORTED') {
 *     renderUnsupportedScreen(err.details?.missing as string[]);
 *   }
 * }
 */
export class WorkerInitError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'WORKER_CRASHED'));
  }
}

/**
 * Worker terminated mid-flight (intentional or unexpected).
 *
 * @example
 * try { await table.actions.applyFilter(f); }
 * catch (err) {
 *   if (err instanceof WorkerTerminatedError) return; // table is tearing down; bail
 *   throw err;
 * }
 */
export class WorkerTerminatedError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'WORKER_TERMINATED'));
  }
}

/**
 * SQL query failure at runtime (syntax, missing column, abort).
 *
 * @example
 * table.on('error', ({ error, source }) => {
 *   if (source === 'query' && error instanceof QueryError) {
 *     toast(`Query failed (${error.code}): ${error.message}`);
 *   }
 * });
 */
export class QueryError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'QUERY_RUNTIME'));
  }
}

/**
 * Data-loading failure: fetch, parse, schema detection, abort.
 *
 * @example
 * try { await table.loadData(file); }
 * catch (err) {
 *   if (err instanceof LoadError && err.code === 'PARSE_FAILED') {
 *     toast('That file does not look like a valid CSV/JSON/Parquet.');
 *   }
 * }
 */
export class LoadError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'PARSE_FAILED'));
  }
}

/**
 * SQL expression failed user-facing validation (raw-SQL filter modal etc.).
 *
 * @example
 * table.on('error', ({ error, source }) => {
 *   if (source === 'sql-validation' && error instanceof SQLValidationError) {
 *     showInlineErrorInEditor(error.message);
 *   }
 * });
 */
export class SQLValidationError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'SQL_SYNTAX'));
  }
}

/**
 * Derived-column expression / vector / lifecycle error.
 *
 * @example
 * try { await table.actions.addDerivedColumn(def); }
 * catch (err) {
 *   if (err instanceof DerivedColumnError && err.code === 'DUPLICATE_NAME') {
 *     toast('A column with that name already exists.');
 *   }
 * }
 */
export class DerivedColumnError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'EXPRESSION_INVALID'));
  }
}

/**
 * Session persistence (IndexedDB) error.
 *
 * @example
 * table.on('error', ({ error, source }) => {
 *   if (source === 'persistence' && error instanceof PersistenceError) {
 *     // IDB writes are best-effort; degrade gracefully.
 *     console.warn('Session save failed:', error.code);
 *   }
 * });
 */
export class PersistenceError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'SAVE_FAILED'));
  }
}

/**
 * Export-pipeline failure (CSV / JSON / Parquet / clipboard).
 *
 * @example
 * table.on('error', ({ error, source }) => {
 *   if (source === 'export' && error instanceof ExportError) {
 *     if (error.code === 'CLIPBOARD_UNAVAILABLE') toast('Clipboard blocked by browser.');
 *     else toast(`Export failed: ${error.message}`);
 *   }
 * });
 */
export class ExportError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'EXPORT_FAILED'));
  }
}

/**
 * Invalid configuration / options / internal invariant violation.
 *
 * @example
 * try { table.setColorScheme('neon' as 'light'); }
 * catch (err) {
 *   if (err instanceof ConfigurationError && err.code === 'OPTIONS_INVALID') {
 *     // Programmer error — surface loudly in dev.
 *   }
 * }
 */
export class ConfigurationError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'INVARIANT'));
  }
}

/**
 * Thrown by public methods called after {@link DataTable.destroy} has run.
 *
 * @example
 * useEffect(() => {
 *   let table: DataTable | undefined;
 *   createDataTable(opts).then((t) => { table = t; });
 *   return () => {
 *     if (table && !table.isDestroyed()) void table.destroy();
 *   };
 * }, []);
 */
export class DestroyedError extends DataTableError {
  constructor(message: string, options: DataTableErrorOptions = {}) {
    super(message, withDefault(options, 'DESTROYED'));
  }
}

/**
 * Rehydrate a typed error from the flat `{ code, message, details }` shape
 * that crosses the worker / main-thread boundary (or any other IPC boundary).
 *
 * Unknown codes fall back to {@link QueryError} with `QUERY_RUNTIME` since
 * the worker's dominant responsibility is running SQL.
 */
export function reconstructError(payload: ErrorPayload): DataTableError {
  const code = payload.code;
  const message = payload.message;
  const details = (payload as { details?: Record<string, unknown> }).details;
  const options: DataTableErrorOptions = {
    code,
    details,
  };

  if (!code) {
    return new QueryError(message, { ...options, code: 'QUERY_RUNTIME' });
  }

  if (code === 'WORKER_TERMINATED') return new WorkerTerminatedError(message, options);
  if (code.startsWith('WORKER_')) return new WorkerInitError(message, options);
  if (code.startsWith('LOAD_')) return new LoadError(message, options);
  if (code.startsWith('QUERY_')) return new QueryError(message, options);
  if (code.startsWith('SQL_')) return new SQLValidationError(message, options);
  if (code.startsWith('EXPORT_') || code === 'NO_TABLE_LOADED' || code === 'CLIPBOARD_UNAVAILABLE' || code === 'CANVAS_UNAVAILABLE') {
    return new ExportError(message, options);
  }
  if (code.startsWith('DERIVED_') || code === 'EXPRESSION_INVALID' || code === 'DUPLICATE_NAME' || code === 'VECTOR_LENGTH_MISMATCH' || code === 'CIRCULAR_DEPENDENCY' || code === 'NOT_FOUND' || code === 'DEPENDENTS_INCOMPATIBLE') {
    return new DerivedColumnError(message, options);
  }
  if (code.startsWith('PERSIST_') || code.startsWith('IDB_') || code === 'SNAPSHOT_INVALID' || code === 'VERSION_MISMATCH' || code === 'SAVE_FAILED') {
    return new PersistenceError(message, options);
  }
  if (code === 'DESTROYED') return new DestroyedError(message, options);
  if (
    code === 'BRIDGE_NOT_READY' ||
    code === 'CONTAINER_INVALID' ||
    code === 'OPTIONS_INVALID' ||
    code === 'INVARIANT' ||
    code.startsWith('CONFIG_') ||
    code.startsWith('OPTIONS_') ||
    code.startsWith('CONTAINER_')
  ) {
    return new ConfigurationError(message, options);
  }

  return new QueryError(message, { ...options, code: code ?? 'QUERY_RUNTIME' });
}
