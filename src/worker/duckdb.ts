/**
 * DuckDB WASM initialization and query execution
 */

import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Initialize DuckDB WASM
 * Loads the appropriate WASM bundle and creates a database connection.
 *
 * @param bundles Optional bundle override for self-hosted / offline deployments.
 *                When omitted, falls back to `getJsDelivrBundles()`.
 */
export async function initializeDuckDB(bundles?: duckdb.DuckDBBundles): Promise<void> {
  if (db !== null) {
    return; // Already initialized
  }

  // Resolve bundle source: caller-provided override wins, else CDN default.
  const sourceBundles = bundles ?? duckdb.getJsDelivrBundles();

  // Select the best bundle for this browser
  const bundle = await duckdb.selectBundle(sourceBundles);

  // Create worker (DuckDB uses its own internal worker for some operations)
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    }),
  );

  // Instantiate the async DuckDB
  const worker = new Worker(worker_url);
  const logger = new duckdb.VoidLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  // Cast DECIMAL to DOUBLE so Arrow returns plain numbers instead of DecimalBigNum objects
  await db.open({ query: { castDecimalToDouble: true } });

  // Create a connection
  conn = await db.connect();
}

/**
 * Check if a value is a DuckDB WASM interval object.
 *
 * DuckDB WASM returns INTERVAL values as Arrow MonthDayNano objects
 * with { months, days, nanoseconds } instead of strings. This detector
 * checks for that shape so we can convert to a string representation.
 */
function isIntervalObject(obj: Record<string, unknown>): boolean {
  return (
    'months' in obj &&
    'days' in obj &&
    (typeof obj['months'] === 'number' || typeof obj['months'] === 'bigint') &&
    (typeof obj['days'] === 'number' || typeof obj['days'] === 'bigint')
  );
}

/**
 * Convert a DuckDB WASM interval object to a DuckDB-style interval string.
 *
 * Input: { months: 14, days: 3, nanoseconds: 14706000000000n } (or micros)
 * Output: "1 year 2 months 3 days 04:05:06"
 */
function intervalObjectToString(obj: Record<string, unknown>): string {
  const months = Number(obj['months']) || 0;
  const days = Number(obj['days']) || 0;

  // DuckDB WASM may use "nanoseconds" (Arrow MonthDayNano) or "micros" (DuckDB internal)
  let totalMicros = 0;
  if ('nanoseconds' in obj) {
    totalMicros = Math.floor(Number(obj['nanoseconds']) / 1000);
  } else if ('micros' in obj) {
    totalMicros = Number(obj['micros']) || 0;
  }

  const parts: string[] = [];

  // Decompose months into years + remaining months.
  // DuckDB intervals have independently-signed components, so apply
  // the month sign to both the year and month display parts.
  const monthSign = months < 0 ? '-' : '';
  const years = Math.floor(Math.abs(months) / 12);
  const remainingMonths = Math.abs(months) % 12;
  if (years > 0) parts.push(`${monthSign}${years} year${years > 1 ? 's' : ''}`);
  if (remainingMonths > 0)
    parts.push(`${monthSign}${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`);

  // Days (independently signed)
  const absDays = Math.abs(days);
  if (absDays > 0) {
    const daySign = days < 0 ? '-' : '';
    parts.push(`${daySign}${absDays} day${absDays > 1 ? 's' : ''}`);
  }

  // Time component from microseconds (sign already handled via isNegativeTime)
  const isNegativeTime = totalMicros < 0;
  let absMicros = Math.abs(totalMicros);
  const hours = Math.floor(absMicros / 3_600_000_000);
  absMicros -= hours * 3_600_000_000;
  const minutes = Math.floor(absMicros / 60_000_000);
  absMicros -= minutes * 60_000_000;
  const seconds = Math.floor(absMicros / 1_000_000);
  absMicros -= seconds * 1_000_000;

  if (hours > 0 || minutes > 0 || seconds > 0 || absMicros > 0 || parts.length === 0) {
    let timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (absMicros > 0) {
      timeStr += `.${String(absMicros).padStart(6, '0').replace(/0+$/, '')}`;
    }
    if (isNegativeTime) timeStr = `-${timeStr}`;
    parts.push(timeStr);
  }

  return parts.join(' ');
}

/**
 * Convert BigInt values to Numbers for JSON serialization, and convert
 * DuckDB WASM interval objects to string representations.
 *
 * DuckDB WASM returns BigInt for integer columns, which can't be serialized by JSON.stringify().
 * It also returns INTERVAL values as Arrow MonthDayNano objects instead of strings.
 */
export function convertBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigInts);
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;

    // Detect and convert interval objects before general recursion
    if (isIntervalObject(record)) {
      return intervalObjectToString(record);
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
}

/**
 * Execute a SQL query via `conn.query()` and return results as an array
 * of objects.
 *
 * `conn.query()` runs as one blocking call inside duckdb-wasm's inner
 * worker and CANNOT be interrupted by `cancelSent()`, so the dispatcher
 * executes queries through {@link executeQueryCancellable} instead. This
 * function has no production callers left; it is kept exported as the
 * documented fallback — if `conn.send()` ever shows result-parity or
 * stability problems for some query shape, revert the dispatcher's query
 * case to this function (queue-level dequeue-cancellation still works).
 */
export async function executeQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!conn) {
    throw Object.assign(new Error('DuckDB not initialized. Call initializeDuckDB() first.'), {
      code: 'BRIDGE_NOT_READY',
    });
  }

  const result = await conn.query(sql);
  return result.toArray().map((row) => convertBigInts(row.toJSON()) as T);
}

/**
 * Execute a SQL query via DuckDB's pending-query path so an inbound
 * `cancel` message can genuinely interrupt it.
 *
 * `conn.send(sql)` runs `startPendingQuery` + repeated `pollPendingQuery`
 * round-trips against the inner worker; `cancelSent()` makes the next
 * poll reject with `Error('query was canceled')` (recognized by the
 * dispatcher's `isCancelRejection`). `allowStreamResult` is left at its
 * default `false` deliberately: the whole execution then sits inside the
 * cancellable pending phase, whereas streaming mode would end the
 * cancellable window at the first result batch.
 *
 * Result rows are materialized exactly like {@link executeQuery}'s
 * (`row.toJSON()` → `convertBigInts`), so the two are interchangeable.
 */
export async function executeQueryCancellable<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  if (!conn) {
    throw Object.assign(new Error('DuckDB not initialized. Call initializeDuckDB() first.'), {
      code: 'BRIDGE_NOT_READY',
    });
  }

  const reader = await conn.send(sql);
  // `send()` resolves undefined (it does not throw) when the inner worker
  // is detached; surface that as a runtime error instead of iterating it.
  if (!reader) {
    throw new Error('DuckDB worker is detached; cannot execute query.');
  }

  const rows: T[] = [];
  for await (const batch of reader) {
    for (const row of batch.toArray()) {
      rows.push(convertBigInts(row.toJSON()) as T);
    }
  }
  return rows;
}

/**
 * @internal Test-only — swap the module-level connection singleton so
 * `executeQueryCancellable` can be exercised in node without a real
 * browser Worker behind `initializeDuckDB`.
 */
export function __setConnForTests(next: duckdb.AsyncDuckDBConnection | null): void {
  conn = next;
}

/**
 * Get the active database connection
 */
export function getConnection(): duckdb.AsyncDuckDBConnection {
  if (!conn) {
    throw Object.assign(new Error('DuckDB not initialized. Call initializeDuckDB() first.'), {
      code: 'BRIDGE_NOT_READY',
    });
  }
  return conn;
}

/**
 * Get the database instance
 */
export function getDatabase(): duckdb.AsyncDuckDB {
  if (!db) {
    throw Object.assign(new Error('DuckDB not initialized. Call initializeDuckDB() first.'), {
      code: 'BRIDGE_NOT_READY',
    });
  }
  return db;
}

/**
 * Check if DuckDB is initialized
 */
export function isInitialized(): boolean {
  return db !== null && conn !== null;
}

/**
 * Close the connection and database
 */
export async function closeDuckDB(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
  if (db) {
    await db.terminate();
    db = null;
  }
}
