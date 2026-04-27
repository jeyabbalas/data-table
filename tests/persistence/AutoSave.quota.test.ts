import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { PersistenceError } from '@/core/errors';
import { AutoSave } from '@/persistence/AutoSave';
import type { SessionStore } from '@/persistence/SessionStore';

/**
 * Phase 7 — AutoSave quota circuit-breaker.
 *
 * Background: pre-Phase-7, every debounce tick after a `QuotaExceededError`
 * re-attempted the save and emitted another `PersistenceError`. On a tab with
 * a constrained IDB quota, this generated one error event per state mutation
 * for the lifetime of the session. The circuit-breaker latches on the first
 * quota error; subsequent saves become no-ops until `enable()` is re-entered
 * (the canonical reset path is `clearSession()`'s `disable()` → `enable()`).
 */

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function setupState(): TableState {
  const state = createTableState();
  state.tableName.set('test_table');
  state.totalRows.set(100);
  state.filteredRows.set(100);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function createQuotaStore(): SessionStore {
  // Mimic the `DOMException`-shaped object that browsers throw when the IDB
  // quota is exhausted. classifyPersistenceFailure() in AutoSave duck-types
  // on `name === 'QuotaExceededError'` for compatibility with both real
  // DOMException and fake-indexeddb's polyfilled throw.
  const quotaError = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockRejectedValue(quotaError),
    saveSync: vi.fn().mockImplementation(() => {
      throw quotaError;
    }),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

function createWorkingStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

describe('AutoSave — quota circuit-breaker', () => {
  let state: TableState;

  beforeEach(() => {
    vi.useFakeTimers();
    state = setupState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first quota error fires onError exactly once with code PERSISTENCE_QUOTA_EXCEEDED', async () => {
    const store = createQuotaStore();
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    // advanceTimersByTimeAsync fires the timer AND drains the microtask
    // queue, so the rejected store.save() lands its catch handler before
    // the next assertion.
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0] as PersistenceError;
    expect(err).toBeInstanceOf(PersistenceError);
    expect(err.code).toBe('PERSISTENCE_QUOTA_EXCEEDED');

    autoSave.destroy();
  });

  it('subsequent state mutations after a quota event fire ZERO additional error events', async () => {
    const store = createQuotaStore();
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);

    // Three more mutations after the quota latched.
    state.filters.set([{ type: 'null', column: 'id' }]);
    await vi.advanceTimersByTimeAsync(1000);

    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    await vi.advanceTimersByTimeAsync(1000);

    state.pinnedColumns.set(['id']);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);
    // Latched: only the first save() ever reached the store.
    expect(store.save).toHaveBeenCalledTimes(1);

    autoSave.destroy();
  });

  it('flushPendingSave after a latched quota is a no-op (no extra error, no saveSync call)', async () => {
    const store = createQuotaStore();
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    // Trip the breaker via async save.
    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);

    // Now schedule another save and flush — should NOT call saveSync since
    // the breaker is latched. Note saveSync was 0 before.
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
    autoSave.flushPendingSave();
    expect(store.saveSync).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    autoSave.destroy();
  });

  it('synchronous quota via saveSync() also latches and stops further saves', () => {
    const store = createQuotaStore();
    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    autoSave.flushPendingSave(); // calls saveSync, which throws quotaError
    expect(onError).toHaveBeenCalledTimes(1);
    expect(store.saveSync).toHaveBeenCalledTimes(1);

    state.filters.set([{ type: 'null', column: 'id' }]);
    autoSave.flushPendingSave();
    // No second saveSync — latched.
    expect(store.saveSync).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    autoSave.destroy();
  });

  it('disable() + enable() resets the circuit-breaker (clearSession path)', async () => {
    const failingStore = createQuotaStore();
    const onError = vi.fn();
    const autoSave = new AutoSave(state, failingStore, { onError });
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);

    // Simulate clearSession: disable, "delete" (no-op here), re-enable.
    // The store still throws quota — but the breaker is cleared, so a
    // subsequent change re-attempts the save and re-emits.
    autoSave.disable();
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'id' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(failingStore.save).toHaveBeenCalledTimes(2);

    autoSave.destroy();
  });

  it('non-quota errors (e.g. SAVE_FAILED) do NOT latch the breaker', async () => {
    const genericError = Object.assign(new Error('write failed'), { name: 'AbortError' });
    const store = {
      open: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockRejectedValue(genericError),
      saveSync: vi.fn(),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    } as unknown as SessionStore;

    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as PersistenceError).code).toBe('SAVE_FAILED');

    // A second mutation re-attempts the save and re-fires onError — not
    // latched, because the failure is recoverable / transient by classification.
    state.filters.set([{ type: 'null', column: 'id' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalledTimes(2);
    expect(store.save).toHaveBeenCalledTimes(2);

    autoSave.destroy();
  });

  it('fresh AutoSave (after enable) starts with a clean breaker even if a previous instance latched', async () => {
    const failingStore = createQuotaStore();
    const onError1 = vi.fn();
    const a1 = new AutoSave(state, failingStore, { onError: onError1 });
    a1.enable();
    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError1).toHaveBeenCalledTimes(1);
    a1.destroy();

    // Build a brand-new AutoSave; its breaker is fresh.
    const workingStore = createWorkingStore();
    const onError2 = vi.fn();
    const a2 = new AutoSave(state, workingStore, { onError: onError2 });
    a2.enable();
    state.filters.set([{ type: 'null', column: 'id' }]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError2).not.toHaveBeenCalled();
    expect(workingStore.save).toHaveBeenCalledTimes(1);
    a2.destroy();
  });

  it('omitting onError still latches the breaker (silent quota path)', async () => {
    const store = createQuotaStore();
    const autoSave = new AutoSave(state, store);
    autoSave.enable();

    state.filters.set([{ type: 'null', column: 'name' }]);
    await vi.advanceTimersByTimeAsync(1000);

    state.filters.set([{ type: 'null', column: 'id' }]);
    await vi.advanceTimersByTimeAsync(1000);

    // Even without an onError handler, the latched breaker prevents the
    // second store.save call.
    expect(store.save).toHaveBeenCalledTimes(1);

    autoSave.destroy();
  });
});
