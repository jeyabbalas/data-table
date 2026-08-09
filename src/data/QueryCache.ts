/**
 * LRU + TTL Query Cache
 *
 * Caches SQL query results to avoid redundant worker round-trips.
 * Uses a Map for O(1) get/set with insertion-order-based LRU eviction.
 */

import type { TableState } from '../core/State';
import type { WorkerBridge } from './WorkerBridge';

/**
 * Tuning knobs for the per-bridge query result cache. Pass via
 * {@link WorkerBridgeOptions.cache} (a `Partial<QueryCacheOptions>`) to
 * override any of them while keeping the others at their defaults.
 * Set `maxEntries: 0` to disable caching entirely.
 */
export interface QueryCacheOptions {
  /** Maximum number of cached query results. Set to 0 to disable caching. Default: 100 */
  maxEntries: number;
  /** Time-to-live in milliseconds for each cached entry. Default: 30000 (30s) */
  ttlMs: number;
  /**
   * Approximate upper bound on the total size of cached results, in bytes.
   * Default: 33554432 (32 MiB).
   *
   * A companion to {@link QueryCacheOptions.maxEntries}, not a replacement:
   * 100 entries means very different things for a 20-column table and a
   * 1,000-column one, and the count alone cannot tell them apart. Over
   * budget, entries are evicted least-recently-used first until the total
   * fits; a single result whose own estimate exceeds the budget is not stored
   * at all rather than emptying the cache for it.
   *
   * The estimate is deliberately cheap and deliberately approximate — a JSON
   * sample of the first rows scaled to the whole result, plus per-row object
   * overhead — because an exact figure would cost more than the cache saves.
   * Treat it as an order of magnitude, not an allocator.
   */
  maxBytes: number;
}

interface CacheEntry {
  value: unknown[];
  expiresAt: number;
  /** This entry's contribution to {@link QueryCache.approxBytes}. */
  bytes: number;
}

const DEFAULT_OPTIONS: QueryCacheOptions = {
  maxEntries: 100,
  ttlMs: 30_000,
  maxBytes: 32 * 1024 * 1024,
};

/** Rows sampled when estimating a result's size. */
const SIZE_SAMPLE_ROWS = 32;

/**
 * Roughly how much memory a cached result occupies, in bytes.
 *
 * `JSON.stringify` over the first {@link SIZE_SAMPLE_ROWS} rows, doubled for
 * UTF-16, scaled by `rows / sampled`, plus 64 B per row for the object
 * header and property table. Sampled rather than measured because the whole
 * point of a cache is to be cheaper than the query it replaces, and
 * stringifying a 100,000-row result to decide whether to keep it would not be.
 *
 * `try` / `catch` around the stringify is load-bearing: a `BigInt` throws
 * (`convertBigInts` normally converts them in the worker, but nothing here
 * enforces that), and a circular structure throws too. The fallback —
 * `rows × columns × 16` — is worse but never wrong enough to matter, and it
 * keeps one unserializable result from disabling the byte bound entirely.
 */
function estimateBytes(rows: unknown[]): number {
  if (rows.length === 0) return 0;
  const sampled = Math.min(SIZE_SAMPLE_ROWS, rows.length);
  try {
    let jsonChars = 0;
    for (let i = 0; i < sampled; i++) {
      jsonChars += JSON.stringify(rows[i]).length;
    }
    return Math.round((jsonChars * 2 * rows.length) / sampled) + rows.length * 64;
  } catch {
    const first = rows[0];
    const columns =
      first !== null && typeof first === 'object' ? Object.keys(first).length || 1 : 1;
    return rows.length * columns * 16;
  }
}

export class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private ttlMs: number;
  private maxBytes: number;
  private totalBytes = 0;

  constructor(options?: Partial<QueryCacheOptions>) {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    this.maxEntries = resolved.maxEntries;
    this.ttlMs = resolved.ttlMs;
    this.maxBytes = resolved.maxBytes;
  }

  /** Remove an entry and give back the bytes it was accounted for. */
  private drop(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.totalBytes -= entry.bytes;
    this.cache.delete(key);
  }

  /**
   * Get a cached result. Returns undefined on miss or expiry.
   * Promotes the entry to most-recently-used on hit.
   */
  get<T>(key: string): T[] | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // TTL expiry
    if (Date.now() > entry.expiresAt) {
      this.drop(key);
      return undefined;
    }

    // LRU promotion: delete and re-insert to move to end. Byte accounting is
    // untouched — the entry is not leaving, only moving.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T[];
  }

  /**
   * Store a query result with TTL. Evicts least-recently-used entries until
   * both the entry count and the approximate byte total are within budget.
   */
  set(key: string, value: unknown[]): void {
    if (this.maxEntries <= 0) return;

    // Remove any existing entry, so an update replaces rather than
    // double-counts and keeps its new position at the MRU end.
    this.drop(key);

    const bytes = estimateBytes(value);
    // One result larger than the entire budget: storing it would evict
    // everything else and then be evicted itself on the next insert. Skipping
    // it is a cache miss; keeping it is a cache miss plus a stampede.
    if (bytes > this.maxBytes) return;

    // Evict LRU (first entry in map) if at capacity
    if (this.cache.size >= this.maxEntries) {
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.drop(lruKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      bytes,
    });
    this.totalBytes += bytes;

    // A loop, not a single eviction: the count bound needed at most one
    // removal per insert because every entry counts for one, but a byte bound
    // does not — a single wide result can be worth dozens of narrow ones. The
    // insert above is the most-recently-used entry, so it is last in
    // iteration order and the loop reaches it only when it is the only entry
    // left, which the size guard forbids.
    while (this.totalBytes > this.maxBytes && this.cache.size > 1) {
      const lruKey = this.cache.keys().next().value;
      if (lruKey === undefined) break;
      this.drop(lruKey);
    }
  }

  /** Clear all cached entries */
  clear(): void {
    this.cache.clear();
    this.totalBytes = 0;
  }

  /** Current number of entries (including potentially expired ones) */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Estimated total size of the cached results, in bytes.
   *
   * The quantity {@link QueryCacheOptions.maxBytes} bounds. Approximate by
   * construction — see `estimateBytes` — and exposed so a host (or a test)
   * can watch the bound do its job.
   *
   * @internal
   */
  get approxBytes(): number {
    return this.totalBytes;
  }

  /** Check if a key exists and is not expired */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.drop(key);
      return false;
    }
    return true;
  }
}

/**
 * Subscribe to state signals that should invalidate the query cache.
 * Returns an unsubscribe function to tear down all subscriptions.
 *
 * A total flush, on purpose. Per-entry tagging — remembering which table and
 * which columns each cached result depends on, and dropping only the affected
 * ones — would keep header stats alive across a filter change on an unrelated
 * column. It is also a second staleness domain to get wrong, and the flush is
 * O(1) against queries that cost milliseconds. Recorded as a possible future
 * refinement, deliberately not built.
 */
export function attachCacheInvalidation(bridge: WorkerBridge, state: TableState): () => void {
  const clear = () => bridge.clearQueryCache();

  const unsubs = [
    state.filters.subscribe(clear),
    state.sortColumns.subscribe(clear),
    state.derivedColumns.subscribe(clear),
    state.totalRows.subscribe(clear),
    state.tableName.subscribe(clear),
  ];

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
