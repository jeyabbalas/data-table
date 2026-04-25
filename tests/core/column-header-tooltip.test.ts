import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

describe('StateActions.setColumnHeaderTooltip / getColumnHeaderTooltip', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, schema);
  });

  it('set then get round-trips a string', () => {
    actions.setColumnHeaderTooltip('age', 'Age in completed years');
    expect(actions.getColumnHeaderTooltip('age')).toBe('Age in completed years');
  });

  it('returns null for an unset column', () => {
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('setting null removes the entry; subsequent get returns null', () => {
    actions.setColumnHeaderTooltip('age', 'foo');
    expect(actions.getColumnHeaderTooltip('age')).toBe('foo');

    actions.setColumnHeaderTooltip('age', null);
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(state.columnHeaderTooltips.get().has('age')).toBe(false);
  });

  it('setting an empty string also removes the entry (treated as null)', () => {
    actions.setColumnHeaderTooltip('age', 'foo');
    actions.setColumnHeaderTooltip('age', '');
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(state.columnHeaderTooltips.get().has('age')).toBe(false);
  });

  it('two columns hold independent entries', () => {
    actions.setColumnHeaderTooltip('age', 'A');
    actions.setColumnHeaderTooltip('name', 'B');

    expect(actions.getColumnHeaderTooltip('age')).toBe('A');
    expect(actions.getColumnHeaderTooltip('name')).toBe('B');

    actions.setColumnHeaderTooltip('age', null);
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(actions.getColumnHeaderTooltip('name')).toBe('B');
  });

  it('re-setting the same value is a no-op (no signal notification)', () => {
    actions.setColumnHeaderTooltip('age', 'foo');

    const handler = vi.fn();
    const unsub = state.columnHeaderTooltips.subscribe(handler);
    handler.mockClear();

    actions.setColumnHeaderTooltip('age', 'foo');
    expect(handler).not.toHaveBeenCalled();

    unsub();
  });

  it('clearing an already-absent column is a no-op (no signal notification)', () => {
    const handler = vi.fn();
    const unsub = state.columnHeaderTooltips.subscribe(handler);
    handler.mockClear();

    actions.setColumnHeaderTooltip('age', null);
    expect(handler).not.toHaveBeenCalled();

    unsub();
  });

  it('changing the value notifies the signal exactly once', () => {
    actions.setColumnHeaderTooltip('age', 'foo');

    const handler = vi.fn();
    const unsub = state.columnHeaderTooltips.subscribe(handler);
    handler.mockClear();

    actions.setColumnHeaderTooltip('age', 'bar');
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('accepts unknown column names silently (matches setColumnWidth behavior)', () => {
    actions.setColumnHeaderTooltip('nonexistent_col', 'inert');
    expect(actions.getColumnHeaderTooltip('nonexistent_col')).toBe('inert');
  });

  it('does not capture undo (tooltip changes are app-authored metadata)', () => {
    const undoManager = new UndoManager();
    const actionsWithUndo = new StateActions(state, mockBridge, undoManager);
    actionsWithUndo.setColumnHeaderTooltip('age', 'foo');
    expect(undoManager.canUndo).toBe(false);
  });
});
