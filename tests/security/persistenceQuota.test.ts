/**
 * Phase 1 — IndexedDB quota error classification regression tests.
 *
 * `AutoSave` reports a typed `PersistenceError` whose `code` distinguishes
 * `PERSISTENCE_QUOTA_EXCEEDED` from the generic `SAVE_FAILED` so consumers
 * can render an appropriate "you've used too much storage" message instead
 * of a generic "save failed" toast.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSave } from '@/persistence/AutoSave';
import { PersistenceError } from '@/core/errors';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { SessionStore } from '@/persistence/SessionStore';

/**
 * A minimal SessionStore stub. We don't need real IDB — AutoSave's reportError
 * runs whenever `store.save()` rejects (or `saveSync()` throws), which we
 * simulate directly.
 */
function makeStubStore(saveImpl: () => Promise<void> | void): SessionStore {
  const store = {
    open: () => Promise.resolve(true),
    close: () => undefined,
    save: vi.fn(saveImpl),
    saveSync: vi.fn(() => {
      const result = saveImpl();
      if (result instanceof Promise) {
        // saveSync is synchronous; absorb any rejection in the void return path.
        void result.catch(() => undefined);
      }
    }),
    load: () => Promise.resolve(null),
    delete: () => Promise.resolve(undefined),
    list: () => Promise.resolve([]),
  } as unknown as SessionStore;
  return store;
}

describe('AutoSave — quota error classification', () => {
  let state: TableState;
  let cleanup: AutoSave | undefined;

  beforeEach(() => {
    state = createTableState();
    state.tableName.set('test_table');
  });

  afterEach(() => {
    cleanup?.destroy();
    cleanup = undefined;
  });

  it('maps DOMException(QuotaExceededError) to PERSISTENCE_QUOTA_EXCEEDED', async () => {
    const quotaErr = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const store = makeStubStore(() => Promise.reject(quotaErr));
    const onError = vi.fn();

    const auto = new AutoSave(state, store, { debounceMs: 5, onError });
    cleanup = auto;
    auto.enable();

    // Trigger a state change → schedule a save → debounce fire → reject.
    state.filters.set([]);

    // Wait for debounce (5ms) + microtask drain.
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0][0] as PersistenceError;
    expect(err).toBeInstanceOf(PersistenceError);
    expect(err.code).toBe('PERSISTENCE_QUOTA_EXCEEDED');
    expect(err.cause).toBe(quotaErr);
  });

  it('maps a non-quota error to SAVE_FAILED', async () => {
    const generic = new Error('disk on fire');
    const store = makeStubStore(() => Promise.reject(generic));
    const onError = vi.fn();

    const auto = new AutoSave(state, store, { debounceMs: 5, onError });
    cleanup = auto;
    auto.enable();

    state.filters.set([]);
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0][0] as PersistenceError;
    expect(err.code).toBe('SAVE_FAILED');
  });

  it('classifies based on `name`, not `instanceof DOMException`, for fake-indexeddb shims', () => {
    const fakeQuotaErr = { name: 'QuotaExceededError', message: 'over' };
    const store = makeStubStore(() => Promise.reject(fakeQuotaErr));
    const onError = vi.fn();

    const auto = new AutoSave(state, store, { debounceMs: 5, onError });
    cleanup = auto;
    auto.enable();

    state.filters.set([]);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onError).toHaveBeenCalled();
        const err = onError.mock.calls[0][0] as PersistenceError;
        expect(err.code).toBe('PERSISTENCE_QUOTA_EXCEEDED');
        resolve();
      }, 30);
    });
  });
});
