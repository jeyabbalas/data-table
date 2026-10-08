import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import {
  ConfigurationError,
  QueryError,
  WorkerInitError,
  WorkerTerminatedError,
  reconstructError,
} from '../core/errors';
import type { ProgressInfo, ProgressCallback } from '../core/Progress';
import type { ColumnSchema } from '../core/types';
import type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  ErrorPayload,
  InitPayload,
  QueryPayload,
  LoadPayload,
  ExportPayload,
} from '../worker/types';
import { QueryCache, type QueryCacheOptions } from './QueryCache';
import { validateSourceOptions, type SourceOptions } from './sourceOptions';

// Re-export for convenience
export type { ProgressInfo, ProgressCallback } from '../core/Progress';

/**
 * Low-level options accepted by {@link WorkerBridge.loadData}: the format,
 * the table name, and how the source is read, per format (the fields of
 * {@link SourceOptions}). Most consumers use the higher-level
 * `table.loadData(source, opts?)` facade instead, which builds these from a
 * `File` / URL / Blob input and its `sourceOptions`.
 */
export interface LoadOptions extends SourceOptions {
  format: 'csv' | 'json' | 'parquet';
  tableName?: string | undefined;
}

/**
 * Outcome of a successful {@link WorkerBridge.loadData}: the DuckDB table
 * name, the row count, the column-name list, and the resolved schema.
 * Internally maps to the public `loadComplete` event payload.
 */
export interface LoadDataResult {
  tableName: string;
  rowCount: number;
  columns: string[];
  schema: ColumnSchema[];
}

/**
 * Options for {@link WorkerBridge.query}.
 */
export interface QueryOptions {
  /**
   * Set `false` to bypass the SQL result cache — both the read (a cached
   * result is ignored) and the write (the fresh result is not stored).
   * Default: SELECT queries are cached.
   */
  cache?: boolean;
  /**
   * Where the query goes in the worker's serial dispatch queue, which runs
   * one query at a time, the queued `'high'` ones first, then the
   * `'elevated'` ones, then the `'normal'` ones, each in the order posted:
   *
   * - `'high'`: viewport row fetches, the rows the grid is waiting to show.
   * - `'elevated'`: an interactive read of a few values that someone is
   *   waiting on, such as `actions.getCellValue`, the value inspector's
   *   read of one cell, or the row count of a filter change. It runs ahead
   *   of queued chart and stats queries, and behind the viewport's row
   *   fetches.
   * - `'normal'` (the default): background work, such as column charts,
   *   stats, prefetches and exports.
   *
   * A query that is already running is never interrupted by one of higher
   * priority.
   */
  priority?: 'high' | 'elevated' | 'normal';
}

/**
 * Construction options for {@link WorkerBridge}.
 */
export interface WorkerBridgeOptions {
  /** Query cache configuration (LRU size, TTL). */
  cache?: Partial<QueryCacheOptions> | undefined;
  /**
   * Maximum time (ms) to wait for the worker to signal ready and for
   * DuckDB to initialize. Rejects `initialize()` with a descriptive
   * error if exceeded. Default: 30000.
   */
  initializeTimeoutMs?: number | undefined;
  /**
   * Custom worker factory. Takes precedence over {@link workerUrl} and the
   * built-in default. Useful for strict-CSP / bundler-specific deployments
   * where the default `new Worker(new URL(...), { type: 'module' })` cannot
   * be used. The caller is responsible for passing `{ type: 'module' }`.
   *
   * **Trust boundary.** The returned `Worker` runs JavaScript with full
   * access to the calling page's origin. Treat this option as
   * developer-controlled — never invoke the factory with values derived
   * from end-user input.
   */
  workerFactory?: (() => Worker) | undefined;
  /**
   * Custom URL/path for the worker script. Instantiated via
   * `new Worker(workerUrl, { type: 'module' })`. Ignored if
   * {@link workerFactory} is set.
   *
   * **Trust boundary.** The library does NOT validate the scheme, origin,
   * or content-type of `workerUrl`. Passing user-derived input here lets
   * an attacker run arbitrary JavaScript in your origin. Pin to a static
   * same-origin URL (or one served with appropriate CORS headers).
   */
  workerUrl?: string | URL | undefined;
  /**
   * DuckDB-WASM bundles to load instead of jsDelivr's, for a self-hosted,
   * offline or strict-CSP deployment: `@duckdb/duckdb-wasm`'s
   * `DuckDBBundles`, whose URLs may also be `URL` objects. When omitted,
   * the worker loads `getJsDelivrBundles()`.
   *
   * DuckDB's own worker fetches these files, not the library's: it starts
   * from a `blob:` URL, runs `importScripts(mainWorker)`, then fetches
   * `mainModule`, and the `coi` bundle starts its threads from
   * `pthreadWorker`. A `blob:` URL is no base for a relative URL, so
   * `initialize()` resolves each `mainModule`, `mainWorker` and
   * `pthreadWorker` against the page, `document.baseURI` (a `<base href>`
   * when it has one), before any worker exists, and posts the absolute
   * URLs. One that cannot be resolved, or that is not a string or a `URL`,
   * rejects `initialize()` with a `ConfigurationError` whose code is
   * `OPTIONS_INVALID` and whose `details.option` names it, such as
   * `'duckdbBundles.eh.mainWorker'`. Your object is not changed.
   *
   * Copy every file from one `@duckdb/duckdb-wasm` version, pinned exactly
   * to `1.33.1-dev57.0`: the library's worker has DuckDB-WASM's JavaScript
   * built in (`1.33.1-dev57.0`), and the library is tested with it. A worker
   * script only runs with the `.wasm` files of its own version. See
   * `docs/guides/csp-and-offline.md` for the files, the Content Security
   * Policy and DuckDB's extensions.
   *
   * **Trust boundary.** DuckDB runs these scripts and modules in your
   * origin. Treat the URLs as developer-controlled, never derived from
   * end-user input.
   */
  duckdbBundles?:
    | {
        [Bundle in keyof DuckDBBundles]: {
          [Field in keyof NonNullable<DuckDBBundles[Bundle]>]: string | URL;
        };
      }
    | undefined;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback | undefined;
  signal?: AbortSignal | undefined;
  abortHandler?: (() => void) | null | undefined;
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000;

/** Where to go when the default worker cannot start: see `createWorker` and `initialize`. */
const WORKER_FACTORY_HINT = 'see bridgeOptions.workerFactory in docs/guides/csp-and-offline.md.';

/**
 * A copy of `bundles` whose URLs are absolute strings: each `mainModule`,
 * `mainWorker` and `pthreadWorker` resolved against the page, its
 * `document.baseURI` (a `<base href>` when it has one) or, without a
 * document, `location.href`. A `URL` object becomes its `href`, which
 * `postMessage` can clone. A `null` or `undefined` entry or field stays as
 * it is, and so does any other key. `bundles` is not changed.
 *
 * @throws {@link ConfigurationError} `OPTIONS_INVALID`, `details.option`
 *   naming the field (`'duckdbBundles.eh.mainWorker'`): a URL that is not a
 *   string or a `URL`, that is empty, or that cannot be resolved.
 */
function resolveBundleUrls(
  bundles: NonNullable<WorkerBridgeOptions['duckdbBundles']>,
): DuckDBBundles {
  const page = globalThis as { document?: { baseURI?: string }; location?: { href?: string } };
  const base = page.document?.baseURI ?? page.location?.href;
  const entries = Object.entries(bundles).map(([name, entry]: [string, unknown]) => {
    if (entry === null || typeof entry !== 'object') return [name, entry];
    const resolved: Record<string, unknown> = { ...entry };
    for (const field of ['mainModule', 'mainWorker', 'pthreadWorker']) {
      const value = resolved[field];
      if (value == null) continue;
      let url: string | undefined;
      try {
        url =
          value instanceof URL
            ? value.href
            : typeof value === 'string' && value.trim()
              ? new URL(value, base).href
              : undefined;
      } catch {
        // Not a URL: reported below.
      }
      if (url === undefined) {
        const option = `duckdbBundles.${name}.${field}`;
        const shown = typeof value === 'string' ? JSON.stringify(value) : typeof value;
        throw new ConfigurationError(
          `${option} (${shown}) is not a URL that resolves against the page${base ? ` (${base})` : ', which has no URL'}.`,
          { code: 'OPTIONS_INVALID', details: { option } },
        );
      }
      resolved[field] = url;
    }
    return [name, resolved];
  });
  return Object.fromEntries(entries) as DuckDBBundles;
}

/**
 * Promise-based RPC layer between the main thread and the DuckDB Web Worker.
 *
 * `createDataTable()` constructs one internally. Construct your own and pass
 * it via `createDataTable({ bridge })` to share a single worker (and therefore
 * a single DuckDB context) across multiple tables on a page, or to override
 * `workerFactory` / `workerUrl` / `duckdbBundles` for strict-CSP and
 * air-gapped deployments.
 *
 * @example
 * import { WorkerBridge, createDataTable } from '@jeyabbalas/data-table';
 *
 * const bridge = new WorkerBridge();
 * await bridge.initialize();
 *
 * const t1 = await createDataTable({ container: '#one', data: csv1, bridge });
 * const t2 = await createDataTable({ container: '#two', data: csv2, bridge });
 *
 * // Later, on full-page teardown:
 * await t1.destroy();
 * await t2.destroy();
 * bridge.terminate();
 *
 * @see WorkerBridgeOptions
 * @see createDataTable
 */
export class WorkerBridge {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private messageId = 0;
  private initPromise: Promise<void> | null = null;
  private queryCache: QueryCache;
  private initializeTimeoutMs: number;
  private workerFactory?: (() => Worker) | undefined;
  private workerUrl?: string | URL | undefined;
  private duckdbBundles?: WorkerBridgeOptions['duckdbBundles'];
  /** Why the worker failed, until `initialize()` starts another; see {@link failWorker}. */
  private workerFailure: WorkerInitError | null = null;
  /** Rejects the `initialize()` still waiting for its worker, if any. */
  private rejectInit: ((error: Error) => void) | null = null;
  /** Told when the worker fails; see {@link onWorkerFailure}. */
  private readonly failureListeners = new Set<(error: WorkerInitError) => void>();

  constructor(options?: WorkerBridgeOptions) {
    this.queryCache = new QueryCache(options?.cache);
    this.initializeTimeoutMs = options?.initializeTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    this.workerFactory = options?.workerFactory;
    this.workerUrl = options?.workerUrl;
    this.duckdbBundles = options?.duckdbBundles;
  }

  /**
   * Construct the Worker using (in priority) workerFactory, workerUrl, or
   * the built-in default. Failures are wrapped in `WorkerInitError` with a
   * `source` discriminator on `details` (`'workerFactory'`, `'workerUrl'` or
   * `'default'`) so consumers can tell factory/url mistakes from runtime
   * crashes.
   */
  private createWorker(): Worker {
    if (this.workerFactory) {
      try {
        const w = this.workerFactory();
        if (!w || typeof w.postMessage !== 'function') {
          throw new Error('workerFactory returned a non-Worker value');
        }
        return w;
      } catch (err) {
        throw new WorkerInitError(
          `Custom workerFactory failed: ${err instanceof Error ? err.message : String(err)}`,
          {
            code: 'WORKER_CRASHED',
            cause: err,
            details: { source: 'workerFactory' },
          },
        );
      }
    }
    if (this.workerUrl !== undefined) {
      try {
        return new Worker(this.workerUrl, { type: 'module' });
      } catch (err) {
        throw new WorkerInitError(
          `Failed to construct worker from workerUrl: ${err instanceof Error ? err.message : String(err)}`,
          {
            code: 'WORKER_CRASHED',
            cause: err,
            details: { source: 'workerUrl', workerUrl: String(this.workerUrl) },
          },
        );
      }
    }
    // The expression stays as Vite and webpack detect it, to emit the worker.
    try {
      return new Worker(new URL('../worker/worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      // A worker script on another origin than the page, as when the library
      // is imported from a CDN, or one the page's CSP blocks. Without a
      // Worker at all (SSR, jsdom) neither applies.
      throw new WorkerInitError(
        `Failed to construct the library's worker (${err instanceof Error ? err.message : String(err)})` +
          (typeof Worker === 'function'
            ? `. A Content Security Policy (worker-src) or another origin can block it: ${WORKER_FACTORY_HINT}`
            : ''),
        {
          code: 'WORKER_CRASHED',
          cause: err,
          details: { source: 'default' },
        },
      );
    }
  }

  /**
   * Create the worker and wait for it to be ready.
   *
   * First, before any worker exists, it resolves the URLs of
   * {@link WorkerBridgeOptions.duckdbBundles} against the page: one that
   * cannot be resolved rejects with a `ConfigurationError`
   * (`OPTIONS_INVALID`).
   *
   * Rejects at once with a `WorkerInitError` whose code is `WORKER_CRASHED`
   * when the worker cannot be constructed, or the worker or DuckDB fails to
   * start: a worker script that does not load (a missing file, or one the
   * page's Content Security Policy blocks), or DuckDB's own worker failing
   * to start. A `.wasm` file that fails to download or compile is left
   * unhandled by duckdb-wasm, which only the console shows: that rejects
   * with `WORKER_INIT_TIMEOUT` after `initializeTimeoutMs` (default 30 s).
   * After either, the worker is gone, a request sent meanwhile rejects too,
   * and calling `initialize()` again starts a new one.
   *
   * If the worker fails later, with an error it does not catch, every
   * pending request rejects with a `WorkerInitError` whose code is
   * `WORKER_CRASHED`, and so does every later call, until `initialize()` is
   * called again: it starts a new worker, with an empty database.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    // DuckDB's worker, which fetches these, runs from a blob: URL that is no
    // base for a relative one. A bad URL throws here, before any worker.
    const bundles = this.duckdbBundles && resolveBundleUrls(this.duckdbBundles);

    let constructed = true;
    const started = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (this.rejectInit === rejectThis) this.rejectInit = null;
        fn();
      };
      // For terminate(), so an init it cuts short settles now, not at its
      // timeout.
      const rejectThis = (error: Error) => settle(() => reject(error));
      this.rejectInit = rejectThis;
      // The worker this call creates. Its handlers act only while it is
      // still the bridge's: a worker terminated, or replaced by a later
      // initialize(), has nothing left to fail.
      let worker: Worker | null = null;
      const isCurrent = (): boolean => worker !== null && this.worker === worker;
      // DuckDB did not start: tear down the half-initialized worker, so a
      // later initialize() starts a new one.
      // A request sent meanwhile would wait for good: its reply dies with it.
      const giveUp = (error: unknown) =>
        settle(() => {
          if (isCurrent()) {
            worker!.terminate();
            this.worker = null;
            this.initPromise = null;
            const failure =
              error instanceof Error
                ? error
                : new WorkerInitError(String(error), { code: 'WORKER_CRASHED', cause: error });
            this.rejectPending(() => failure);
          }
          reject(error);
        });

      const timeoutHandle = setTimeout(() => {
        giveUp(
          new WorkerInitError(
            `WorkerBridge.initialize() timed out after ${this.initializeTimeoutMs}ms. A mainModule ` +
              '.wasm that fails to load or compile ends here: serve it as application/wasm, and ' +
              "allow it in connect-src, with 'wasm-unsafe-eval' in script-src.",
            {
              code: 'WORKER_INIT_TIMEOUT',
              details: { timeoutMs: this.initializeTimeoutMs },
            },
          ),
        );
      }, this.initializeTimeoutMs);

      try {
        this.workerFailure = null;
        worker = this.createWorker();
        this.worker = worker;

        worker.onmessage = this.handleMessage.bind(this);
        // An error event is an exception the worker did not catch, or a
        // script that failed to load, during init or at any time after.
        worker.onerror = (event) => {
          // A script that fails to load fires a plain Event, with no message.
          const message = event.message
            ? `Worker error: ${event.message}`
            : `The worker script failed to load${
                this.workerFactory
                  ? ''
                  : this.workerUrl !== undefined
                    ? ` (${String(this.workerUrl)})`
                    : ': assets/worker-*.js is missing (a 404, or HTML served in its place), or a ' +
                      'Content Security Policy (worker-src) or another origin blocks it; ' +
                      WORKER_FACTORY_HINT
              }`;
          const error = new WorkerInitError(message, {
            code: 'WORKER_CRASHED',
            cause: event,
          });
          settle(() => reject(error));
          if (isCurrent()) this.failWorker(error);
        };
        worker.onmessageerror = () => {
          if (!isCurrent()) return;
          this.rejectUnattributedReply('A message from the worker could not be deserialized', {
            reason: 'messageerror',
          });
        };

        // Wait for worker ready signal
        const readyHandler = (event: MessageEvent<WorkerResponse>) => {
          if ((event.data as { id?: unknown } | null)?.id === '__ready__') {
            worker!.removeEventListener('message', readyHandler);
            // Now initialize DuckDB — forward optional bundles override.
            const initPayload: InitPayload = bundles ? { bundles } : {};
            this.sendMessage('init', initPayload)
              .then(() => settle(() => resolve()))
              .catch(giveUp);
          }
        };
        worker.addEventListener('message', readyHandler);
      } catch (error) {
        constructed = false;
        settle(() => reject(error));
      }
    });

    // A worker that could not be constructed leaves nothing to wait for: a
    // later initialize() tries again, as after any other failed start.
    this.initPromise = constructed ? started : null;
    return started;
  }

  /**
   * Execute a SQL query.
   *
   * SELECT results are served from and stored into the bridge's LRU+TTL
   * cache unless `options.cache === false`. `options.priority: 'high'`
   * makes the worker run this query ahead of queued normal-priority work
   * (viewport row fetches use this so they are not stuck behind
   * stats/histogram fan-outs).
   *
   * Each row is a plain object whose own properties are its columns,
   * `__proto__` included. Integers arrive as numbers, the nearest one past
   * ±2^53, except a HUGEINT or UHUGEINT at its ends, which arrives with the
   * wrong sign: the HUGEINT minimum positive, a UHUGEINT past 2^127
   * negative (the maximum as `-1`). A LIST or ARRAY value arrives as an
   * array, a STRUCT or MAP value as an object (a MAP's keys as strings; an
   * unnamed STRUCT, as `row(1, 'a')` builds, as an array), a UNION value as
   * its member's, and a BLOB as a `Uint8Array`. A DATE or TIMESTAMP, of any
   * precision and with or without a zone, arrives as epoch milliseconds, a
   * timestamp's digits past the millisecond as a fraction; DuckDB's
   * `infinity` and `-infinity` as `Infinity` and `-Infinity`; one past
   * ±2^53 ms (after year 287396 or before 283458 BC) as the nearest number.
   *
   * DECIMAL, HUGEINT and UHUGEINT values inside a nested value do not
   * arrive intact. In a LIST, ARRAY or STRUCT each reads as a meaningless
   * number (`[1.25, 2.50, 3.75]` as `[6.2e-322, 0, 1.235e-321]`,
   * `[-12::HUGEINT]` as `[NaN]`). Anywhere under a MAP or a UNION it reads
   * as a `Uint32Array` of the 32-bit words of its unscaled integer, low
   * first (`MAP {'a': 1.25}` as `{ a: Uint32Array [125, 0, 0, 0] }`), and a
   * MAP key as that integer's digits (`MAP {1.25: 'a'}` as
   * `{ '125': 'a' }`). An INTERVAL, nested or a column's own value, reads
   * as an `Int32Array` that does not hold it, and a MAP key as that array's
   * text (`'0,0'`). Inside a STRUCT, MAP or UNION, Arrow reads a date or
   * timestamp itself and gets DuckDB's `infinity` wrong: a TIMESTAMP's
   * fails the read (`9223372036854775 is not safe to convert to a
   * number`), as does a TIMESTAMP past ±2^53 ms, and a DATE's reads as
   * 185542587100800000. Select an INTERVAL column as
   * `CAST(c AS VARCHAR)`, and a nested value as JSON text, which is exact:
   * `CAST(to_json(c) AS VARCHAR)` keeps every digit, a MAP's DECIMAL keys
   * included, and writes an INTERVAL as DuckDB does
   * (`"1 year 2 months 3 days"`) and `infinity` as `"infinity"`. `JSON.parse`
   * rounds integers past 2^53 and rejects the bare `NaN` and `Infinity`
   * DuckDB writes for non-finite DOUBLEs.
   *
   * A VARIANT value cannot cross Arrow at all (`Unsupported Arrow type
   * VARIANT`), nor a value that holds one, and `to_json` gets those wrong
   * (`to_json(42::VARIANT)` is the string `"42"`). Select a VARIANT column
   * as `CAST(c AS JSON)`, or read any of these with `actions.getCellValue`
   * or `actions.getColumnValues`, which pick the SQL for each type.
   *
   * The worker runs queries on a path that can be cancelled but receives
   * no ENUM dictionaries. So a result holding an ENUM, at any depth, is
   * computed a second time, on a path that has them, when the SQL is a
   * single query (a `SELECT`, `WITH`, `FROM` or `VALUES` query) that does
   * not name `nextval`. That second read cannot be cancelled: an abort
   * still rejects at once, but the worker finishes the read before its
   * next query. Anything else runs once, and its ENUM values arrive as
   * `null`: an `INSERT`, `UPDATE` or `DELETE … RETURNING`, several
   * statements in one text, and a query that calls `nextval`, whose
   * sequence a second run would advance again. A `nextval` called through
   * a view or a macro is not seen, and advances its sequence twice.
   * `CAST(e AS VARCHAR)` reads an ENUM's text in one run, in any
   * statement.
   *
   * @param sql SQL text to execute.
   * @param signal Optional abort signal; aborting rejects with
   *   `QUERY_ABORTED` and posts a targeted cancel to the worker.
   * @param options Cache and priority behavior — see {@link QueryOptions}.
   *
   * @example
   * // Viewport row fetch: skip the cache, jump the queue, abortable.
   * const rows = await bridge.query(sql, controller.signal, {
   *   cache: false,
   *   priority: 'high',
   * });
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    signal?: AbortSignal,
    options?: QueryOptions,
  ): Promise<T[]> {
    this.ensureInitialized();

    // Only cache SELECT queries, and only when not explicitly bypassed.
    const cacheable = options?.cache !== false && this.isCacheable(sql);
    if (cacheable) {
      const cached = this.queryCache.get<T>(sql);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Conditional spread keeps the wire payload minimal (and satisfies
    // exactOptionalPropertyTypes — no explicit `priority: undefined`).
    const payload: QueryPayload = {
      sql,
      ...(options?.priority !== undefined ? { priority: options.priority } : {}),
    };
    const result = await this.sendMessage('query', payload, undefined, signal);
    const rows = (result as { rows: T[] }).rows;

    // Store in cache if cacheable and not aborted
    if (cacheable && !signal?.aborted) {
      this.queryCache.set(sql, rows);
    }

    return rows;
  }

  /**
   * Load data into DuckDB
   *
   * Returns table name, row count, columns, and full schema info.
   * All metadata queries happen in the worker to avoid blocking the main thread.
   *
   * Pass a Parquet source as a `Blob` or `File` where you can: DuckDB then
   * reads it from disk as it loads, instead of holding the whole file in
   * memory next to the table. A load that would not fit in memory rejects
   * with a `LoadError` whose code is `LOAD_MEMORY_EXCEEDED`.
   *
   * How the source is read (`timezone`, `csv`, `json`, `parquet`) is checked
   * before anything is sent: a bad value rejects with a `LoadError` whose
   * code is `LOAD_INVALID_OPTIONS` or `LOAD_INVALID_TIMEZONE`. Each format's
   * options go in its own entry, `{ format: 'csv', csv: { delimiter: ';' } }`:
   * any other key here, such as a `delimiter` next to `format`, is ignored.
   */
  async loadData(
    source: ArrayBuffer | string | Blob,
    options: LoadOptions,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<LoadDataResult> {
    this.ensureInitialized();

    // Only these four: other keys were always ignored here.
    const { format, tableName, timezone, csv, json, parquet } = options;
    const sourceOptions: SourceOptions = { timezone, csv, json, parquet };
    validateSourceOptions(sourceOptions);
    const payload: LoadPayload = { data: source, format, tableName, ...sourceOptions };
    const result = (await this.sendMessage('load', payload, onProgress, signal)) as {
      tableName: string;
      rowCount: number;
      columns: string[];
      schema: ColumnSchema[];
    };

    return {
      tableName: result.tableName,
      rowCount: result.rowCount,
      columns: result.columns,
      schema: result.schema,
    };
  }

  /**
   * Export data to a binary file format via DuckDB COPY TO.
   *
   * The SQL query is wrapped in COPY (...) TO on the worker side.
   * Returns the file contents as a Uint8Array.
   */
  async exportToBuffer(sql: string, format: 'parquet', signal?: AbortSignal): Promise<Uint8Array> {
    this.ensureInitialized();

    const payload: ExportPayload = { sql, format };
    const result = await this.sendMessage('export', payload, undefined, signal);
    return new Uint8Array((result as { buffer: ArrayBuffer }).buffer);
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    this.workerFailure = null;
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.initPromise = null;

    this.rejectInit?.(new WorkerTerminatedError('Worker terminated during initialization'));
    this.rejectPending(() => new WorkerTerminatedError('Worker terminated'));
    this.queryCache.clear();
  }

  /**
   * Call `listener` when the worker fails, with the error every pending and
   * later request then rejects with, whose code is `WORKER_CRASHED`. A table
   * reports the failure once this way, rather than once for each query that
   * fails after it. Returns a function that removes the listener.
   *
   * @internal
   */
  onWorkerFailure(listener: (error: WorkerInitError) => void): () => void {
    this.failureListeners.add(listener);
    return () => {
      this.failureListeners.delete(listener);
    };
  }

  /**
   * Clear all cached query results
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  /**
   * Drop a table from DuckDB if it exists. The identifier is double-quoted
   * (matching the worker-side loaders), so any tableName the bridge issued
   * to a `loadData` call is safe to pass back here.
   *
   * Idempotent — a missing table is not an error. Used by `DataTable` to
   * reclaim the previous base table on reload and on `destroy()` over a
   * shared bridge. Exposed publicly so consumers managing ad-hoc tables
   * via `bridge.query('CREATE TABLE …')` have a symmetric drop helper
   * without re-implementing identifier quoting.
   */
  async dropTable(tableName: string): Promise<void> {
    this.ensureInitialized();
    const quoted = `"${tableName.replace(/"/g, '""')}"`;
    await this.query(`DROP TABLE IF EXISTS ${quoted}`);
  }

  /**
   * Check if the bridge is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null && this.initPromise !== null;
  }

  private ensureInitialized(): void {
    if (this.workerFailure) {
      throw new WorkerInitError(
        `The DuckDB worker failed (${this.workerFailure.message}): every table loaded ` +
          'through this bridge is gone. Call initialize() to start a new worker.',
        { code: 'WORKER_CRASHED', cause: this.workerFailure },
      );
    }
    if (!this.worker) {
      throw new ConfigurationError('WorkerBridge not initialized. Call initialize() first.', {
        code: 'BRIDGE_NOT_READY',
      });
    }
  }

  /**
   * The worker failed. It may have stopped, or it may run on without the
   * reply it owed some request, so it is terminated and every pending
   * request rejected with `error`. Later calls reject at once, until
   * `initialize()` starts a new worker.
   */
  private failWorker(error: WorkerInitError): void {
    this.workerFailure = error;
    this.worker?.terminate();
    this.worker = null;
    this.initPromise = null;
    this.rejectPending(() => error);
    this.queryCache.clear();
    for (const listener of [...this.failureListeners]) {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[WorkerBridge] a worker-failure listener threw:', listenerError);
      }
    }
  }

  /**
   * A reply was lost, with no telling whose: a message that could not be
   * deserialized, or one without a string id. Every pending request is
   * rejected, and cancelled in the worker, rather than one of them left
   * waiting for good. The worker itself carries on.
   */
  private rejectUnattributedReply(message: string, details: Record<string, unknown>): void {
    const ids = this.rejectPending(
      () => new WorkerInitError(message, { code: 'WORKER_PROTOCOL_VIOLATION', details }),
    );
    for (const id of ids) this.postCancel(id);
  }

  /**
   * Reject every pending request, releasing their abort listeners so that
   * long-lived AbortSignals reused by the embedder don't accumulate
   * handlers across bridge lifetimes. Returns the ids rejected.
   */
  private rejectPending(makeError: () => Error): string[] {
    const ids = Array.from(this.pendingRequests.keys());
    for (const id of ids) {
      const request = this.pendingRequests.get(id);
      if (!request) continue;
      this.cleanupRequest(id);
      request.reject(makeError());
    }
    return ids;
  }

  /** Ask the worker to drop the request `targetId`, queued or running. */
  private postCancel(targetId: string): void {
    const cancelMessage: WorkerMessage = {
      id: this.generateId(),
      type: 'cancel',
      payload: { targetId },
    };
    this.worker?.postMessage(cancelMessage);
  }

  private isCacheable(sql: string): boolean {
    return sql.trimStart().toUpperCase().startsWith('SELECT');
  }

  private generateId(): string {
    return `msg-${++this.messageId}`;
  }

  private sendMessage(
    type: WorkerMessageType,
    payload: unknown,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();

      // Handle abort signal
      let abortHandler: (() => void) | null = null;
      if (signal) {
        if (signal.aborted) {
          reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
          return;
        }

        abortHandler = () => {
          // cleanupRequest also removes this very listener from the signal,
          // preventing handler leaks when the same AbortSignal is reused
          // across many aborted requests.
          this.cleanupRequest(id);
          this.postCancel(id);
          reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
        };
        signal.addEventListener('abort', abortHandler);
      }

      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress,
        signal,
        abortHandler,
      });

      const message: WorkerMessage = { id, type, payload };
      try {
        this.worker!.postMessage(message);
      } catch (error) {
        // A payload that cannot be cloned (a detached ArrayBuffer, say)
        // never reaches the worker, so no reply will come for it.
        this.cleanupRequest(id);
        reject(error);
      }
    });
  }

  /** Remove the abort listener for a completed request. */
  private cleanupRequest(id: string): void {
    const request = this.pendingRequests.get(id);
    if (request?.signal && request.abortHandler) {
      request.signal.removeEventListener('abort', request.abortHandler);
    }
    this.pendingRequests.delete(id);
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    // Defense in depth: the worker is library-controlled, but a hostile
    // workerFactory / cross-origin worker could deliver malformed messages.
    // Reject anything that doesn't match the expected `{ id, type, payload }`
    // shape rather than blindly trusting `event.data`.
    // A message without a string id may have been some request's reply,
    // so it fails every pending request rather than leave one hanging.
    const data = event.data as unknown;
    if (typeof data !== 'object' || data === null) {
      console.warn('[WorkerBridge] dropping non-object worker message');
      this.rejectUnattributedReply('Worker sent a non-object message', { reason: 'non-object' });
      return;
    }
    const id = (data as { id?: unknown }).id;
    const type = (data as { type?: unknown }).type;
    const payload = (data as { payload?: unknown }).payload;
    if (typeof id !== 'string') {
      console.warn('[WorkerBridge] dropping worker message with non-string id');
      this.rejectUnattributedReply('Worker sent a message without a string id', {
        reason: 'non-string-id',
      });
      return;
    }

    // Ignore ready message (handled in initialize)
    if (id === '__ready__') return;

    const request = this.pendingRequests.get(id);
    if (!request) return;

    switch (type) {
      case 'result':
        this.cleanupRequest(id);
        if (typeof payload !== 'object' || payload === null) {
          request.reject(
            new WorkerInitError('Worker result response missing payload', {
              code: 'WORKER_PROTOCOL_VIOLATION',
              details: { id, type },
            }),
          );
          break;
        }
        request.resolve(payload);
        break;

      case 'error': {
        this.cleanupRequest(id);
        if (typeof payload !== 'object' || payload === null) {
          request.reject(
            new WorkerInitError('Worker error response missing payload', {
              code: 'WORKER_PROTOCOL_VIOLATION',
              details: { id, type },
            }),
          );
          break;
        }
        // The request is out of `pendingRequests` now, so nothing else can
        // settle it: an error reply that cannot be read still rejects it.
        let error: Error;
        try {
          error = reconstructError(payload as ErrorPayload);
        } catch (cause) {
          error = new WorkerInitError('Worker error response could not be read', {
            code: 'WORKER_PROTOCOL_VIOLATION',
            cause,
            details: { id, type },
          });
        }
        request.reject(error);
        break;
      }

      case 'progress':
        if (request.onProgress && typeof payload === 'object' && payload !== null) {
          request.onProgress(payload as ProgressInfo);
        }
        break;

      default:
        console.warn(`[WorkerBridge] dropping worker message with unknown type: ${String(type)}`);
        this.cleanupRequest(id);
        request.reject(
          new WorkerInitError(`Worker sent unknown message type: ${String(type)}`, {
            code: 'WORKER_PROTOCOL_VIOLATION',
            details: { id, type: String(type) },
          }),
        );
        break;
    }
  }
}
