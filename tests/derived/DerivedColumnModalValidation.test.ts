/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

beforeAll(() => {
  if (!document.createRange) {
    document.createRange = () =>
      ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getClientRects: () => [],
        getBoundingClientRect: () => ({
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        }),
        createContextualFragment: (html: string) => {
          const template = document.createElement('template');
          template.innerHTML = html;
          return template.content;
        },
      }) as unknown as Range;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

/**
 * Since parseVectorValues is private, we test it indirectly via the modal's
 * create flow. We open the modal in vector mode, set the type and textarea
 * content, then attempt creation. The mock bridge will throw if we reach SQL
 * execution, so we know the validation layer accepted/rejected the input.
 *
 * However, this is complex — instead, we extract and directly test the
 * validation logic by instantiating the modal and using its internal state.
 *
 * The simplest approach: we create a minimal test harness by calling the
 * private method via a subclass or type cast. Since this is a test file,
 * this is acceptable.
 */

/** Access the private parseVectorValues method for direct testing. */
function getParser(modal: DerivedColumnModal) {
  return (modal as any).parseVectorValues.bind(modal) as (
    lines: string[],
    vectorType: string,
  ) => { success: boolean; values?: any[]; error?: string };
}

describe('parseVectorValues — Integer validation', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts valid integers', () => {
    expect(parse(['42', '-7', '0'], 'integer')).toEqual({
      success: true,
      values: [42, -7, 0],
    });
  });

  it('accepts single-digit integers', () => {
    expect(parse(['0', '1', '9'], 'integer')).toEqual({
      success: true,
      values: [0, 1, 9],
    });
  });

  it('rejects float strings like "3.14"', () => {
    const result = parse(['3.14'], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid integer');
  });

  it('rejects scientific notation like "1e5"', () => {
    const result = parse(['1e5'], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid integer');
  });

  it('rejects non-numeric strings', () => {
    const result = parse(['abc'], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid integer');
  });

  it('rejects empty string', () => {
    const result = parse([''], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid integer');
  });

  it('rejects strings with spaces', () => {
    const result = parse([' 42 '], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid integer');
  });

  it('reports the correct line number for errors', () => {
    const result = parse(['1', '2', '3.5'], 'integer');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Line 3');
  });
});

describe('parseVectorValues — Float validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts valid floats', () => {
    expect(parse(['3.14', '-0.5', '0'], 'float')).toEqual({
      success: true,
      values: [3.14, -0.5, 0],
    });
  });

  it('accepts scientific notation', () => {
    expect(parse(['1e5', '2.5e-3', '-1e10'], 'float')).toEqual({
      success: true,
      values: [1e5, 2.5e-3, -1e10],
    });
  });

  it('accepts integer-like values as floats', () => {
    expect(parse(['42', '-7', '0'], 'float')).toEqual({
      success: true,
      values: [42, -7, 0],
    });
  });

  it('rejects "Infinity"', () => {
    const result = parse(['Infinity'], 'float');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid float');
  });

  it('rejects "-Infinity"', () => {
    const result = parse(['-Infinity'], 'float');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid float');
  });

  it('rejects "NaN"', () => {
    const result = parse(['NaN'], 'float');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid float');
  });

  it('rejects non-numeric strings', () => {
    const result = parse(['abc'], 'float');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid float');
  });

  it('reports the correct line number for errors', () => {
    const result = parse(['1.0', '2.0', 'Infinity'], 'float');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Line 3');
  });
});

describe('parseVectorValues — Date validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts valid ISO dates', () => {
    expect(parse(['2024-01-15', '1970-01-01', '2099-12-31'], 'date')).toEqual({
      success: true,
      values: ['2024-01-15', '1970-01-01', '2099-12-31'],
    });
  });

  it('rejects non-padded dates like "2024-1-5"', () => {
    const result = parse(['2024-1-5'], 'date');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid date');
  });

  it('rejects US format "01/15/2024"', () => {
    const result = parse(['01/15/2024'], 'date');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid date');
  });

  it('rejects non-date strings', () => {
    const result = parse(['not-a-date'], 'date');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid date');
  });

  it('rejects timestamps (date + time)', () => {
    const result = parse(['2024-01-15 10:30:00'], 'date');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid date');
  });
});

describe('parseVectorValues — Timestamp validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts space-separated timestamps', () => {
    expect(parse(['2024-01-15 10:30:00'], 'timestamp')).toEqual({
      success: true,
      values: ['2024-01-15 10:30:00'],
    });
  });

  it('accepts T-separated timestamps', () => {
    expect(parse(['2024-01-15T10:30:00'], 'timestamp')).toEqual({
      success: true,
      values: ['2024-01-15T10:30:00'],
    });
  });

  it('accepts timestamps without seconds', () => {
    expect(parse(['2024-01-15 10:30'], 'timestamp')).toEqual({
      success: true,
      values: ['2024-01-15 10:30'],
    });
  });

  it('accepts timestamps with fractional seconds', () => {
    expect(parse(['2024-01-15 10:30:00.123456'], 'timestamp')).toEqual({
      success: true,
      values: ['2024-01-15 10:30:00.123456'],
    });
  });

  it('rejects date-only strings', () => {
    const result = parse(['2024-01-15'], 'timestamp');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid timestamp');
  });

  it('rejects time-only strings', () => {
    const result = parse(['10:30:00'], 'timestamp');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid timestamp');
  });

  it('rejects non-timestamp strings', () => {
    const result = parse(['not-a-timestamp'], 'timestamp');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid timestamp');
  });
});

describe('parseVectorValues — Time validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts HH:MM:SS format', () => {
    expect(parse(['14:30:00', '00:00:00', '23:59:59'], 'time')).toEqual({
      success: true,
      values: ['14:30:00', '00:00:00', '23:59:59'],
    });
  });

  it('accepts HH:MM format (no seconds)', () => {
    expect(parse(['14:30', '00:00', '23:59'], 'time')).toEqual({
      success: true,
      values: ['14:30', '00:00', '23:59'],
    });
  });

  it('accepts time with fractional seconds', () => {
    expect(parse(['14:30:00.123', '00:00:00.5'], 'time')).toEqual({
      success: true,
      values: ['14:30:00.123', '00:00:00.5'],
    });
  });

  it('rejects non-time strings like "2pm"', () => {
    const result = parse(['2pm'], 'time');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid time');
  });

  it('rejects date+time strings', () => {
    const result = parse(['2024-01-15 10:30:00'], 'time');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid time');
  });
});

describe('parseVectorValues — Interval validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts DuckDB interval formats', () => {
    expect(parse(['1 day', '2 hours 30 minutes', '1 year 6 months'], 'interval')).toEqual({
      success: true,
      values: ['1 day', '2 hours 30 minutes', '1 year 6 months'],
    });
  });

  it('rejects empty strings', () => {
    const result = parse(['1 day', '', '3 hours'], 'interval');
    expect(result.success).toBe(false);
    expect(result.error).toContain('interval cannot be empty');
    expect(result.error).toContain('Line 2');
  });

  it('rejects whitespace-only strings', () => {
    const result = parse(['   '], 'interval');
    expect(result.success).toBe(false);
    expect(result.error).toContain('interval cannot be empty');
  });
});

describe('parseVectorValues — Decimal validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts valid decimals', () => {
    expect(parse(['123.456', '-0.5', '42'], 'decimal')).toEqual({
      success: true,
      values: ['123.456', '-0.5', '42'],
    });
  });

  it('rejects scientific notation', () => {
    const result = parse(['1e5'], 'decimal');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid decimal');
  });

  it('rejects non-numeric strings', () => {
    const result = parse(['abc'], 'decimal');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid decimal');
  });

  it('rejects multiple decimal points', () => {
    const result = parse(['12.34.56'], 'decimal');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid decimal');
  });
});

describe('parseVectorValues — UUID validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts valid UUIDs (lowercase)', () => {
    const result = parse(['550e8400-e29b-41d4-a716-446655440000'], 'uuid');
    expect(result.success).toBe(true);
  });

  it('accepts valid UUIDs (uppercase)', () => {
    const result = parse(['A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'], 'uuid');
    expect(result.success).toBe(true);
  });

  it('accepts valid UUIDs (mixed case)', () => {
    const result = parse(['550e8400-E29B-41d4-A716-446655440000'], 'uuid');
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    const result = parse(['not-a-uuid'], 'uuid');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid UUID');
  });

  it('rejects too-short UUIDs', () => {
    const result = parse(['550e8400-e29b-41d4-a716'], 'uuid');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid UUID');
  });
});

describe('parseVectorValues — Boolean validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts "true" and "false" (case-insensitive)', () => {
    expect(parse(['true', 'false', 'TRUE'], 'boolean')).toEqual({
      success: true,
      values: [true, false, true],
    });
  });

  it('accepts "1" and "0"', () => {
    expect(parse(['1', '0', '1'], 'boolean')).toEqual({
      success: true,
      values: [true, false, true],
    });
  });

  it('rejects "yes"', () => {
    const result = parse(['yes'], 'boolean');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid boolean');
  });

  it('rejects "2"', () => {
    const result = parse(['2'], 'boolean');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid boolean');
  });

  it('rejects empty string', () => {
    const result = parse([''], 'boolean');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a valid boolean');
  });
});

describe('parseVectorValues — String validation', () => {
  let modal: DerivedColumnModal;
  let parse: ReturnType<typeof getParser>;

  beforeEach(() => {
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    state.schema.set([{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }]);
    state.totalRows.set(3);
    state.tableName.set('test_table');
    modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    parse = getParser(modal);
  });

  afterEach(() => {
    modal.destroy();
  });

  it('accepts any strings without validation', () => {
    expect(parse(['hello', '', 'special chars: <>!@#$'], 'string')).toEqual({
      success: true,
      values: ['hello', '', 'special chars: <>!@#$'],
    });
  });
});
