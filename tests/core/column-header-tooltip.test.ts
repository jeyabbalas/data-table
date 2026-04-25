import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';
import type { TableState } from '@/core/State';
import type { ColumnSchema, ColumnHeaderTooltipContent } from '@/core/types';
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

describe('StateActions.setColumnHeaderTooltip / getColumnHeaderTooltip — structured form', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, schema);
  });

  it('string shorthand: set "foo" -> get { description: "foo" }', () => {
    actions.setColumnHeaderTooltip('age', 'foo');
    expect(actions.getColumnHeaderTooltip('age')).toEqual({ description: 'foo' });
  });

  it('returns null for an unset column', () => {
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('round-trips a structured object with title + description + items', () => {
    const content: ColumnHeaderTooltipContent = {
      title: 'Age',
      description: 'Age in completed years.',
      items: [
        { label: 'Type', value: 'integer' },
        { label: 'Range', value: '0 to 120' },
      ],
    };
    actions.setColumnHeaderTooltip('age', content);
    expect(actions.getColumnHeaderTooltip('age')).toEqual(content);
  });

  it('preserves string[] item values (enum-style)', () => {
    actions.setColumnHeaderTooltip('age', {
      title: 'Age bucket',
      items: [{ label: 'Buckets', value: ['child', 'adult', 'senior'] }],
    });
    expect(actions.getColumnHeaderTooltip('age')).toEqual({
      title: 'Age bucket',
      items: [{ label: 'Buckets', value: ['child', 'adult', 'senior'] }],
    });
  });

  it('null clears the entry', () => {
    actions.setColumnHeaderTooltip('age', { description: 'D' });
    expect(actions.getColumnHeaderTooltip('age')).not.toBeNull();
    actions.setColumnHeaderTooltip('age', null);
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(state.columnHeaderTooltips.get().has('age')).toBe(false);
  });

  it('empty string clears the entry (treated as no content)', () => {
    actions.setColumnHeaderTooltip('age', { description: 'D' });
    actions.setColumnHeaderTooltip('age', '');
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('object with all fields empty clears the entry', () => {
    actions.setColumnHeaderTooltip('age', { description: 'D' });
    actions.setColumnHeaderTooltip('age', { title: '', description: '', items: [] });
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('object with only malformed items normalizes to null (clears)', () => {
    actions.setColumnHeaderTooltip('age', { description: 'D' });
    actions.setColumnHeaderTooltip('age', {
      // value is a number — not allowed; item drops; nothing else; clears
      items: [{ label: 'L', value: 42 as unknown as string }],
    });
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('drops malformed items but preserves valid ones', () => {
    actions.setColumnHeaderTooltip('age', {
      title: 'T',
      items: [
        { label: 'good', value: 'kept' },
        { label: '', value: 'dropped — empty label' },
        { label: 'bad-value', value: 0 as unknown as string },
        { label: 'good-list', value: ['a', '', 'b'] },
      ],
    });
    expect(actions.getColumnHeaderTooltip('age')).toEqual({
      title: 'T',
      items: [
        { label: 'good', value: 'kept' },
        { label: 'good-list', value: ['a', 'b'] },
      ],
    });
  });

  it('item with all-empty string[] value drops the row', () => {
    actions.setColumnHeaderTooltip('age', {
      title: 'T',
      items: [{ label: 'enum', value: ['', ''] }],
    });
    expect(actions.getColumnHeaderTooltip('age')).toEqual({ title: 'T' });
  });

  it('non-object non-string non-null input clears (does not throw)', () => {
    actions.setColumnHeaderTooltip('age', { description: 'D' });
    expect(() => {
      actions.setColumnHeaderTooltip('age', 42 as unknown as null);
    }).not.toThrow();
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
  });

  it('two columns hold independent entries', () => {
    actions.setColumnHeaderTooltip('age', { description: 'A' });
    actions.setColumnHeaderTooltip('name', { description: 'B' });

    expect(actions.getColumnHeaderTooltip('age')).toEqual({ description: 'A' });
    expect(actions.getColumnHeaderTooltip('name')).toEqual({ description: 'B' });

    actions.setColumnHeaderTooltip('age', null);
    expect(actions.getColumnHeaderTooltip('age')).toBeNull();
    expect(actions.getColumnHeaderTooltip('name')).toEqual({ description: 'B' });
  });

  it('re-setting structurally equal content is a no-op (no signal notification)', () => {
    actions.setColumnHeaderTooltip('age', {
      title: 'T',
      items: [{ label: 'x', value: ['a', 'b'] }],
    });

    const handler = vi.fn();
    const unsub = state.columnHeaderTooltips.subscribe(handler);
    handler.mockClear();

    actions.setColumnHeaderTooltip('age', {
      title: 'T',
      items: [{ label: 'x', value: ['a', 'b'] }],
    });
    expect(handler).not.toHaveBeenCalled();

    // String shorthand and equivalent object are also no-ops to each other.
    actions.setColumnHeaderTooltip('age', null);
    handler.mockClear();
    actions.setColumnHeaderTooltip('age', 'desc');
    actions.setColumnHeaderTooltip('age', { description: 'desc' });
    expect(handler).toHaveBeenCalledTimes(1); // first call only

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
    actions.setColumnHeaderTooltip('age', { description: 'foo' });

    const handler = vi.fn();
    const unsub = state.columnHeaderTooltips.subscribe(handler);
    handler.mockClear();

    actions.setColumnHeaderTooltip('age', { description: 'bar' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
  });

  it('accepts unknown column names silently (matches setColumnWidth behavior)', () => {
    actions.setColumnHeaderTooltip('nonexistent_col', 'inert');
    expect(actions.getColumnHeaderTooltip('nonexistent_col')).toEqual({
      description: 'inert',
    });
  });

  it('does not capture undo (tooltip changes are app-authored metadata)', () => {
    const undoManager = new UndoManager();
    const actionsWithUndo = new StateActions(state, mockBridge, undoManager);
    actionsWithUndo.setColumnHeaderTooltip('age', { description: 'foo' });
    expect(undoManager.canUndo).toBe(false);
  });
});

describe('Column header tooltip — derived-column lifecycle integration', () => {
  let state: TableState;
  let actions: StateActions;
  let derivedBridge: WorkerBridge & {
    getQueryCalls(): string[];
  };

  // Mock bridge that handles the SQL surface of addDerivedColumn,
  // updateDerivedColumn, and removeDerivedColumn for integration testing.
  function createDerivedMockBridge(): WorkerBridge & { getQueryCalls(): string[] } {
    const queryCalls: string[] = [];
    const query = vi.fn().mockImplementation(async (sql: string) => {
      queryCalls.push(sql);
      const trimmed = sql.trim();
      if (sql.includes('typeof(')) return [{ t: 'INTEGER' }];
      if (sql.includes('LIMIT 0')) return [];
      if (/^(CREATE|DROP|INSERT|CREATE OR REPLACE)/i.test(trimmed)) return [];
      return [];
    });
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      query,
      loadData: vi.fn().mockResolvedValue(undefined),
      exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
      terminate: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      clearQueryCache: vi.fn(),
      getQueryCalls: () => queryCalls,
    } as unknown as WorkerBridge & { getQueryCalls(): string[] };
  }

  beforeEach(() => {
    state = createTableState();
    derivedBridge = createDerivedMockBridge();
    actions = new StateActions(state, derivedBridge, new UndoManager());
    initializeColumnsFromSchema(state, schema);
    state.tableName.set('test_table');
    state.baseTableName.set('test_table');
    state.totalRows.set(10);
    state.filteredRows.set(10);
  });

  it('migrates the tooltip key when a derived column is renamed via updateDerivedColumn', async () => {
    const addRes = await actions.addDerivedColumn({
      kind: 'expression',
      name: 'tip_pct',
      expression: 'age + 1',
    });
    expect(addRes.success).toBe(true);

    actions.setColumnHeaderTooltip('tip_pct', {
      title: 'Tip percentage',
      description: 'Computed as age + 1.',
    });
    expect(actions.getColumnHeaderTooltip('tip_pct')).toMatchObject({
      title: 'Tip percentage',
    });

    const updateRes = await actions.updateDerivedColumn('tip_pct', {
      kind: 'expression',
      name: 'tip_pct_v2',
      expression: 'age + 1',
    });
    expect(updateRes.success).toBe(true);

    expect(actions.getColumnHeaderTooltip('tip_pct_v2')).toMatchObject({
      title: 'Tip percentage',
      description: 'Computed as age + 1.',
    });
    expect(actions.getColumnHeaderTooltip('tip_pct')).toBeNull();
    expect(state.columnHeaderTooltips.get().has('tip_pct')).toBe(false);
  });

  it('preserves the tooltip when the derived column is updated without rename', async () => {
    await actions.addDerivedColumn({
      kind: 'expression',
      name: 'tip_pct',
      expression: 'age + 1',
    });
    actions.setColumnHeaderTooltip('tip_pct', { description: 'Original tooltip' });

    const updateRes = await actions.updateDerivedColumn('tip_pct', {
      kind: 'expression',
      name: 'tip_pct',
      expression: 'age + 2',
    });
    expect(updateRes.success).toBe(true);
    expect(actions.getColumnHeaderTooltip('tip_pct')).toMatchObject({
      description: 'Original tooltip',
    });
  });

  it('drops the tooltip when the derived column is removed via removeDerivedColumn', async () => {
    await actions.addDerivedColumn({
      kind: 'expression',
      name: 'tip_pct',
      expression: 'age + 1',
    });
    actions.setColumnHeaderTooltip('tip_pct', { description: 'goes away' });
    expect(actions.getColumnHeaderTooltip('tip_pct')).not.toBeNull();

    await actions.removeDerivedColumn('tip_pct');
    expect(actions.getColumnHeaderTooltip('tip_pct')).toBeNull();
    expect(state.columnHeaderTooltips.get().has('tip_pct')).toBe(false);
  });

  it('leaves unrelated tooltips intact when one derived column is renamed', async () => {
    await actions.addDerivedColumn({
      kind: 'expression',
      name: 'a',
      expression: 'age + 1',
    });
    await actions.addDerivedColumn({
      kind: 'expression',
      name: 'b',
      expression: 'age + 2',
    });
    actions.setColumnHeaderTooltip('a', { description: 'A' });
    actions.setColumnHeaderTooltip('b', { description: 'B' });

    const updateRes = await actions.updateDerivedColumn('a', {
      kind: 'expression',
      name: 'a_renamed',
      expression: 'age + 1',
    });
    expect(updateRes.success).toBe(true);

    expect(actions.getColumnHeaderTooltip('a_renamed')).toMatchObject({ description: 'A' });
    expect(actions.getColumnHeaderTooltip('b')).toMatchObject({ description: 'B' });
    expect(actions.getColumnHeaderTooltip('a')).toBeNull();
  });
});
