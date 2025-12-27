/**
 * DuckDB WASM initialization and query execution
 */

import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

/**
 * Initialize DuckDB WASM
 * Loads the appropriate WASM bundle and creates a database connection
 */
export async function initializeDuckDB(): Promise<void> {
  if (db !== null) {
    return; // Already initialized
  }

  // Get the bundles from CDN (recommended approach for WASM)
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  // Select the best bundle for this browser
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  // Create worker (DuckDB uses its own internal worker for some operations)
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: 'text/javascript',
    })
  );

  // Instantiate the async DuckDB
  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  // Create a connection
  conn = await db.connect();
}

/**
 * Convert BigInt values to Numbers for JSON serialization
 * DuckDB WASM returns BigInt for integer columns, which can't be serialized by JSON.stringify()
 */
function convertBigInts(obj: unknown): unknown {
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
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigInts(value);
    }
    return result;
  }
  return obj;
}

/**
 * Execute a SQL query and return results as an array of objects
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  if (!conn) {
    throw new Error('DuckDB not initialized. Call initializeDuckDB() first.');
  }

  const result = await conn.query(sql);
  return result.toArray().map((row) => convertBigInts(row.toJSON()) as T);
}

/**
 * Get the active database connection
 */
export function getConnection(): duckdb.AsyncDuckDBConnection {
  if (!conn) {
    throw new Error('DuckDB not initialized. Call initializeDuckDB() first.');
  }
  return conn;
}

/**
 * Get the database instance
 */
export function getDatabase(): duckdb.AsyncDuckDB {
  if (!db) {
    throw new Error('DuckDB not initialized. Call initializeDuckDB() first.');
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
