/**
 * Deferred-queue mock WorkerBridge for TableBody fetch-pipeline tests.
 *
 * Extends the historical inline pattern from `TableBody.race.test.ts`:
 * every `query()` call is captured with its full `(sql, signal, options)`
 * argument list and parked on a deferred the test resolves or rejects.
 * When a captured signal aborts, the deferred auto-rejects with
 * `QueryError('Operation aborted', { code: 'QUERY_ABORTED' })` — the exact
 * shape the real bridge produces (`src/data/WorkerBridge.ts`) — so
 * TableBody's silent-abort path is exercised the same way in unit tests
 * and production. Pass `rejectOnAbort: false` to emulate a sloppy double
 * that resolves after an abort instead, which exercises TableBody's
 * post-await `epoch` / `signal.aborted` guards.
 *
 * Row-window parsing understands both SQL shapes TableBody emits:
 * `LIMIT n OFFSET k` (sorted/filtered path) and
 * `WHERE "__rowid__" >= a AND "__rowid__" < b` (unsorted fast path, which
 * also carries a defensive LIMIT — the range wins). `rowsFor` synthesizes
 * exactly the requested window with `__rowid__ ≡ index`, which is the
 * discipline that keeps the fast path's density safety valve from firing
 * in tests that are not specifically about the valve.
 */
import { vi } from 'vitest';

import { QueryError } from '@/core/errors';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export interface CapturedQuery {
  sql: string;
  signal: AbortSignal | undefined;
  options: { cache?: boolean; priority?: 'high' | 'normal' } | undefined;
  deferred: Deferred<unknown[]>;
}

export interface RowFetchBridgeOptions {
  /**
   * Auto-reject a call's deferred with a `QUERY_ABORTED` QueryError the
   * moment its captured signal aborts (default: true — mirrors the real
   * bridge). `false` leaves the deferred pending so a test can resolve it
   * after the abort and prove the post-await guards drop the rows.
   */
  rejectOnAbort?: boolean;
}

export interface RowFetchBridge {
  /** Structural WorkerBridge stand-in — cast at the TableBody call site. */
  bridge: {
    query: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    loadData: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    clearQueryCache: ReturnType<typeof vi.fn>;
  };
  /** Every query() call in issue order, with its deferred. */
  queries: CapturedQuery[];
}

export function makeRowFetchBridge(options: RowFetchBridgeOptions = {}): RowFetchBridge {
  const rejectOnAbort = options.rejectOnAbort ?? true;
  const queries: CapturedQuery[] = [];

  const query = vi.fn(
    (
      sql: string,
      signal?: AbortSignal,
      queryOptions?: { cache?: boolean; priority?: 'high' | 'normal' },
    ) => {
      const d = deferred<unknown[]>();
      queries.push({ sql, signal, options: queryOptions, deferred: d });
      if (signal && rejectOnAbort) {
        const abort = (): void => {
          d.reject(new QueryError('Operation aborted', { code: 'QUERY_ABORTED' }));
        };
        if (signal.aborted) {
          abort();
        } else {
          signal.addEventListener('abort', abort, { once: true });
        }
      }
      return d.promise;
    },
  );

  const bridge = {
    query,
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };

  return { bridge, queries };
}

/** Parse `LIMIT n OFFSET k`; throws when the SQL has no OFFSET window. */
export function parseLimitOffset(sql: string): { limit: number; offset: number } {
  const m = sql.match(/LIMIT\s+(\d+)\s+OFFSET\s+(\d+)/i);
  if (!m) throw new Error(`expected LIMIT…OFFSET in SQL, got: ${sql}`);
  return { limit: Number(m[1]), offset: Number(m[2]) };
}

/**
 * Parse the fast-path range predicate
 * `WHERE "__rowid__" >= a AND "__rowid__" < b`; throws when absent.
 */
export function parseRowidRange(sql: string): { start: number; end: number } {
  const m = sql.match(/"__rowid__"\s*>=\s*(\d+)\s+AND\s+"__rowid__"\s*<\s*(\d+)/i);
  if (!m) throw new Error(`expected "__rowid__" range predicate in SQL, got: ${sql}`);
  return { start: Number(m[1]), end: Number(m[2]) };
}

/**
 * The row window a TableBody query asks for, whichever SQL shape it uses.
 * The fast-path shape carries a defensive LIMIT as well, so the range
 * predicate is checked first.
 */
export function parseRowWindow(sql: string): { offset: number; limit: number } {
  try {
    const range = parseRowidRange(sql);
    return { offset: range.start, limit: range.end - range.start };
  } catch {
    const { limit, offset } = parseLimitOffset(sql);
    return { offset, limit };
  }
}

/**
 * Deterministic synthesized row for absolute index `i`: `__rowid__ ≡ i`,
 * numeric-looking columns get `i`, everything else `\`${column}-${i}\``.
 */
export function rowAt(i: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: i };
  for (const column of columns) {
    if (column === '__rowid__') continue;
    row[column] = column === 'id' ? i : `${column}-${i}`;
  }
  return row;
}

/**
 * Exactly the rows a captured query asked for — full window, in order,
 * `__rowid__ ≡ index`. Resolving with anything shorter than the requested
 * window trips the rowid fast path's density safety valve by design; use
 * this everywhere the valve is not the thing under test.
 */
export function rowsFor(sql: string, columns: readonly string[]): Record<string, unknown>[] {
  const { offset, limit } = parseRowWindow(sql);
  return Array.from({ length: limit }, (_, k) => rowAt(offset + k, columns));
}
