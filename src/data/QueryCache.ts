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
 * override either the LRU size or the TTL while keeping the other default.
 * Set `maxEntries: 0` to disable caching entirely.
 */
export interface QueryCacheOptions {
  /** Maximum number of cached query results. Set to 0 to disable caching. Default: 100 */
  maxEntries: number;
  /** Time-to-live in milliseconds for each cached entry. Default: 30000 (30s) */
  ttlMs: number;
}

interface CacheEntry {
  value: unknown[];
  expiresAt: number;
}

const DEFAULT_OPTIONS: QueryCacheOptions = {
  maxEntries: 100,
  ttlMs: 30_000,
};

export class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(options?: Partial<QueryCacheOptions>) {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    this.maxEntries = resolved.maxEntries;
    this.ttlMs = resolved.ttlMs;
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
      this.cache.delete(key);
      return undefined;
    }

    // LRU promotion: delete and re-insert to move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T[];
  }

  /**
   * Store a query result with TTL. Evicts LRU entry if at capacity.
   */
  set(key: string, value: unknown[]): void {
    if (this.maxEntries <= 0) return;

    // Remove existing entry to update position
    this.cache.delete(key);

    // Evict LRU (first entry in map) if at capacity
    if (this.cache.size >= this.maxEntries) {
      const lruKey = this.cache.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Clear all cached entries */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of entries (including potentially expired ones) */
  get size(): number {
    return this.cache.size;
  }

  /** Check if a key exists and is not expired */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
}

/**
 * Subscribe to state signals that should invalidate the query cache.
 * Returns an unsubscribe function to tear down all subscriptions.
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
