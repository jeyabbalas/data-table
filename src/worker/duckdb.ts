/**
 * DuckDB WASM initialization and query execution
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { duckdbWorkerSource } from './openFileFix';

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

  // Create worker (DuckDB uses its own internal worker for some operations),
  // with duckdb-wasm's runtime fixed for heaps past 2 GiB: see openFileFix.ts.
  const worker_url = URL.createObjectURL(
    new Blob([duckdbWorkerSource(bundle.mainWorker!)], {
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
 * Check if a value is an interval object: numeric `months` and `days`, as in
 * Arrow's MonthDayNano shape `{ months, days, nanoseconds }` or DuckDB's
 * `{ months, days, micros }`.
 *
 * apache-arrow 17 never returns one: it reads an INTERVAL value as a
 * two-element `Int32Array` that does not hold the interval, which is why
 * the grid and the column stats select INTERVAL columns as text.
 * {@link convertBigInts} tests only a plain object outside any list and any
 * STRUCT or MAP value, so a STRUCT with `months` and `days` fields stays a
 * record.
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
 * Check if a value is an Arrow `Vector`: what a LIST or fixed-size ARRAY
 * cell holds.
 *
 * Duck-typed, because `apache-arrow` is only a transitive dependency. A
 * STRUCT or MAP cell is a proxy that reads its fields as properties, so a
 * `type` and a `data` field would pass for a Vector's; a Vector's `data` is
 * an array of its chunks, and no field value is an array.
 */
function isArrowVector(obj: object): obj is Iterable<unknown> {
  const vector = obj as {
    toArray?: unknown;
    type?: unknown;
    data?: unknown;
    [Symbol.iterator]?: unknown;
  };
  return (
    typeof vector.toArray === 'function' &&
    typeof vector[Symbol.iterator] === 'function' &&
    typeof vector.type === 'object' &&
    vector.type !== null &&
    Array.isArray(vector.data)
  );
}

/**
 * The symbol Arrow keeps a STRUCT value's row index under, on
 * `StructRow.prototype`. `MapRow.prototype` has no such property.
 */
const ARROW_ROW_INDEX = Symbol.for('rowIndex');

/** An Arrow row's entries, in order: see {@link readArrowRow}. */
interface ArrowRowEntries {
  /** Whether the row is a STRUCT value; if not, it is a MAP value. */
  isStruct: boolean;
  /** `[field name, value]` for a STRUCT, `[key, value]` for a MAP. */
  entries: [unknown, unknown][];
}

/**
 * Read an Arrow row: what a STRUCT value (a `StructRow`) or a MAP value (a
 * `MapRow`) is. Returns `null` for any other value.
 *
 * Both are proxies, tagged `Row`, that read fields (a MAP's keys) as
 * properties. Their `get` looks a name up on the row object first, so a
 * field named `size` reads as a MAP's entry count, and one named `toJSON`
 * or `constructor` as a function, which `postMessage` cannot clone; and
 * listing the fields of an unnamed STRUCT, all named '', throws. Their own
 * `toJSON()` assigns the fields to a plain object, so it loses a
 * `__proto__` field or makes it the object's prototype (after which the
 * next field's assignment can throw), and an unnamed STRUCT's fields
 * overwrite one another. The entries come from the iterator on the row's
 * prototype instead, which reads Arrow's data by position.
 */
function readArrowRow(obj: object): ArrowRowEntries | null {
  if (Object.prototype.toString.call(obj) !== '[object Row]') {
    return null;
  }
  const proto = Object.getPrototypeOf(obj) as Record<PropertyKey, unknown> | null;
  if (proto === null || typeof proto[Symbol.iterator] !== 'function') {
    return null;
  }
  const iterate = proto[Symbol.iterator] as (this: object) => Iterator<[unknown, unknown]>;
  const iterator = iterate.call(obj);
  const entries: [unknown, unknown][] = [];
  for (let step = iterator.next(); !step.done; step = iterator.next()) {
    entries.push(step.value);
  }
  return { isStruct: Object.hasOwn(proto, ARROW_ROW_INDEX), entries };
}

/**
 * Set `key` on a plain object being built as an own, enumerable data
 * property, the way `JSON.parse` does. Assigning `__proto__` would run
 * `Object.prototype`'s setter instead, changing the object's prototype and
 * losing the key, so that key is defined. Every other inherited property is
 * a writable data property, which assignment shadows, and assigning is the
 * cheaper on rows a thousand columns wide.
 */
function setOwnProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

/**
 * A copy of a typed array in a buffer of its own. Arrow returns a BLOB value
 * as a view into the buffer that holds a whole batch of the result, and
 * structured clone copies a view's entire buffer: a 2-byte BLOB posted as it
 * is would take every other column of the batch with it.
 */
function copyTypedArray(view: ArrayBufferView): ArrayBufferView {
  // Every typed array has slice(). A DataView has not, and stays as it is;
  // Arrow never returns one.
  return view instanceof DataView ? view : (view as Uint8Array).slice();
}

/**
 * Convert a query result value for posting to the main thread, as plain
 * data that structured clone can copy and `JSON.stringify` can write.
 *
 * - A BigInt becomes a Number: the nearest one, past ±2^53.
 * - A LIST or ARRAY value becomes an array. Arrow returns one as a
 *   `Vector`, whose own properties include functions, so copied field by
 *   field it could not be posted.
 * - A STRUCT or MAP value becomes an object whose own properties are its
 *   fields, or its keys as `String` writes them; `__proto__` included. An
 *   unnamed STRUCT, as `row(1, 'a')` builds, names every field '', and
 *   becomes an array. See {@link readArrowRow}.
 * - A typed array, such as a BLOB's `Uint8Array`, stays one, in a copy:
 *   see {@link copyTypedArray}.
 * - A plain object with numeric `months` and `days` becomes DuckDB-style
 *   interval text, unless it is inside a list or a STRUCT or MAP value: see
 *   {@link isIntervalObject}.
 *
 * DECIMAL, HUGEINT and INTERVAL values inside a LIST, ARRAY, STRUCT or MAP
 * cannot be read this way. duckdb-wasm, opened with `castDecimalToDouble`,
 * labels a nested DECIMAL (and a HUGEINT, which it passes as a DECIMAL) a
 * DOUBLE without converting its data, so `[1.25, 2.50, 3.75]` arrives as
 * `[6.2e-322, 0, 1.235e-321]`, and a HUGEINT as a number just as
 * meaningless, or NaN. Arrow reads an INTERVAL, there or as a column's own
 * value, as an `Int32Array` that does not hold it. `CAST(to_json(c) AS
 * VARCHAR)` reads all three exactly, as JSON text.
 */
export function convertBigInts(obj: unknown): unknown {
  return convertValue(obj, true);
}

/**
 * {@link convertBigInts} for one value. `topLevel` says whether it may be
 * taken for an interval object: true for the value converted and, through
 * plain objects, for their fields; false inside a list or an Arrow row.
 */
function convertValue(value: unknown, topLevel: boolean): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return copyTypedArray(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => convertValue(item, false));
  }
  const row = readArrowRow(value);
  if (row !== null) {
    return convertArrowRow(row);
  }
  if (isArrowVector(value)) {
    return Array.from(value, (item) => convertValue(item, false));
  }

  const record = value as Record<string, unknown>;
  if (topLevel && isIntervalObject(record)) {
    return intervalObjectToString(record);
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    setOwnProperty(result, key, convertValue(item, topLevel));
  }
  return result;
}

/**
 * Convert an Arrow row's entries: a STRUCT's fields, or a MAP's keys and
 * values, to an object's own properties, and an unnamed STRUCT's fields to
 * an array.
 */
function convertArrowRow({ isStruct, entries }: ArrowRowEntries): unknown {
  if (isStruct && entries.length > 0 && entries.every(([name]) => name === '')) {
    return entries.map(([, item]) => convertValue(item, false));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    setOwnProperty(result, String(key), convertValue(item, false));
  }
  return result;
}

/**
 * What {@link convertBatch} reads of an Arrow `RecordBatch`: its row count,
 * its columns' names, and each column's vector. Spelled out, because
 * `apache-arrow` is only a transitive dependency.
 */
export interface ResultBatch {
  readonly numRows: number;
  readonly schema: { readonly fields: readonly { readonly name: string }[] };
  getChildAt(index: number): { get(index: number): unknown } | null;
}

/**
 * Convert a result's record batch to rows for posting to the main thread,
 * appended to `rows`: each a plain object whose own properties are the
 * result's columns, each value converted by {@link convertBigInts}.
 *
 * Each row is read by position, from the columns' vectors. Arrow's own
 * `StructRow.toJSON()` assigns each column to a plain object, so a column
 * named `__proto__` became the object's prototype instead of a property,
 * and when it held a STRUCT, the next column's assignment could throw
 * (`'set' on proxy: trap returned falsish`). Reading the vectors also
 * skips the proxy Arrow builds for each row, and is about three times as
 * fast, on rows a thousand columns wide as on narrow ones. As with
 * `toJSON()`, of two columns with one name the later one's value is kept.
 *
 * Column by column, so the row itself is never taken for an interval: a
 * table with numeric `months` and `days` columns would have every row turned
 * into an interval string.
 */
export function convertBatch<T = Record<string, unknown>>(batch: ResultBatch, rows: T[] = []): T[] {
  const names = batch.schema.fields.map((field) => field.name);
  const columns = names.map((_, index) => batch.getChildAt(index)!);
  for (let row = 0; row < batch.numRows; row += 1) {
    const record: Record<string, unknown> = {};
    for (let column = 0; column < columns.length; column += 1) {
      setOwnProperty(record, names[column]!, convertBigInts(columns[column]!.get(row)));
    }
    rows.push(record as T);
  }
  return rows;
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

  const rows: T[] = [];
  for (const batch of (await conn.query(sql)).batches) {
    convertBatch(batch, rows);
  }
  return rows;
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
 * Result rows are materialized like {@link executeQuery}'s, by
 * {@link convertBatch}, with one difference. The pending-query path
 * receives no dictionary batches, so a dictionary-encoded column, which is
 * what an ENUM is at any depth, arrives with an empty dictionary and every
 * value reads as null. A result holding one is read a second time through
 * `conn.query()`, which carries them, when running the SQL again changes
 * nothing (see {@link canRunAgain}); that read cannot be cancelled. Any
 * other such result is the first run's, its ENUM values null, since a
 * statement with side effects must run once.
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

  await reader.open();
  const rows: T[] = [];
  if (!reader.schema.fields.some((field) => holdsDictionary(field.type))) {
    for await (const batch of reader) {
      convertBatch(batch, rows);
    }
    return rows;
  }

  // The result holds an ENUM, whose values read as null here. The library
  // selects its own ENUM columns as text; this is the path of a raw read of
  // one through `bridge.query`. The first result is read to its end before
  // anything else runs on the connection: a query run while it is open
  // ends it early, without an error.
  const batches: ResultBatch[] = [];
  for await (const batch of reader) {
    batches.push(batch);
  }
  if (await canRunAgain(conn, sql)) {
    return executeQuery<T>(sql);
  }
  for (const batch of batches) {
    convertBatch(batch, rows);
  }
  return rows;
}

/**
 * A call of `nextval`: DuckDB's sequences are not transactional, so a
 * second run would advance one again.
 */
const NAMES_NEXTVAL = /\bnextval\b/i;

/**
 * Whether running `sql` a second time, to read its ENUM values, changes
 * nothing: DuckDB binds it as a single query, and it does not name
 * `nextval`.
 *
 * `DESCRIBE` binds the query in its parentheses without running it. A
 * statement that is not a query, such as `INSERT … RETURNING`, `UPDATE` or
 * `DELETE`, cannot stand there, nor can a second statement after a `;`, so
 * either fails to parse, which leaves a transaction the caller has open as
 * it was. Trailing semicolons are dropped first, and the newline before
 * `)` ends a trailing `--` comment. A `nextval` that a view or a macro
 * calls is not seen, and its sequence advances twice.
 */
async function canRunAgain(
  connection: duckdb.AsyncDuckDBConnection,
  sql: string,
): Promise<boolean> {
  if (NAMES_NEXTVAL.test(sql)) return false;
  let query = sql.trimEnd();
  while (query.endsWith(';')) query = query.slice(0, -1).trimEnd();
  try {
    await connection.query(`DESCRIBE SELECT * FROM (\n${query}\n)`);
    return true;
  } catch {
    return false;
  }
}

/** `Type.Dictionary` in apache-arrow, which this module does not import. */
const ARROW_DICTIONARY_TYPE_ID = -1;

/** Whether an Arrow type is dictionary-encoded, or holds a type that is. */
function holdsDictionary(type: { typeId: number; children?: { type: unknown }[] | null }): boolean {
  const pending = [type];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (next.typeId === ARROW_DICTIONARY_TYPE_ID) return true;
    for (const child of next.children ?? []) pending.push(child.type as typeof type);
  }
  return false;
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
