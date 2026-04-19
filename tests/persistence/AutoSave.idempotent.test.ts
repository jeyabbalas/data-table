// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AutoSave } from '@/persistence/AutoSave';
import type { SessionStore } from '@/persistence/SessionStore';

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

function createMockStore(): SessionStore {
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

describe('AutoSave.enable() — idempotency (Phase 2)', () => {
  let state: TableState;
  let store: SessionStore;
  let docAdd: ReturnType<typeof vi.spyOn>;
  let winAdd: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    state = setupState();
    store = createMockStore();
    docAdd = vi.spyOn(document, 'addEventListener');
    winAdd = vi.spyOn(window, 'addEventListener');
  });

  afterEach(() => {
    docAdd.mockRestore();
    winAdd.mockRestore();
  });

  it('does NOT stack visibilitychange / beforeunload listeners on repeat enable()', () => {
    const autoSave = new AutoSave(state, store);
    autoSave.enable();
    autoSave.enable();
    autoSave.enable();
    autoSave.enable();
    autoSave.enable();

    const visCalls = docAdd.mock.calls.filter(
      ([ev]) => ev === 'visibilitychange',
    );
    const unloadCalls = winAdd.mock.calls.filter(
      ([ev]) => ev === 'beforeunload',
    );
    expect(visCalls.length).toBe(1);
    expect(unloadCalls.length).toBe(1);

    autoSave.destroy();
  });

  it('re-subscribes after disable() + enable() cycle', () => {
    const autoSave = new AutoSave(state, store);
    autoSave.enable();
    autoSave.disable();

    const beforeReEnable = docAdd.mock.calls.filter(
      ([ev]) => ev === 'visibilitychange',
    ).length;

    autoSave.enable();

    const afterReEnable = docAdd.mock.calls.filter(
      ([ev]) => ev === 'visibilitychange',
    ).length;

    expect(afterReEnable).toBe(beforeReEnable + 1);
    autoSave.destroy();
  });
});
