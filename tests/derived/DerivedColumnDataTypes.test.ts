import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { VectorDataType } from '@/derived/types';

/**
 * Mock WorkerBridge that records all SQL queries for assertion.
 * Handles typeof(), LIMIT 0, and DDL patterns.
 */
function createMockBridge(typeMap: Record<string, string> = {}) {
  const queryCalls: string[] = [];

  const bridge = {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockImplementation(async (sql: string) => {
      queryCalls.push(sql);

      if (sql.includes('typeof(')) {
        const match = sql.match(/typeof\(\((.+)\)\) AS t/);
        const expr = match?.[1] ?? '';
        const duckdbType = typeMap[expr] ?? 'DOUBLE';
        return [{ t: duckdbType }];
      }

      if (sql.includes('LIMIT 0')) {
        return [];
      }

      if (/^(CREATE|DROP|INSERT)/i.test(sql.trim())) {
        return [];
      }

      return [];
    }),
    loadData: vi.fn().mockResolvedValue(undefined),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    clearQueryCache: vi.fn(),
    getQueryCalls: () => queryCalls,
  };

  return bridge;
}

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: true, originalType: 'DOUBLE' },
];

function setupActions(typeMap: Record<string, string> = {}) {
  const state = createTableState();
  const bridge = createMockBridge(typeMap);
  const actions = new StateActions(state, bridge as any);

  initializeColumnsFromSchema(state, sampleSchema);
  state.tableName.set('test_table');
  state.baseTableName.set('test_table');
  state.totalRows.set(3);
  state.filteredRows.set(3);

  return { state, bridge, actions };
}

// =========================================
// A. Vector INSERT SQL format per type
// =========================================

describe('Vector INSERT SQL format per data type', () => {
  it('integer values are inserted as unquoted numbers', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'integer', values: [42, -7, 0],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, 42)');
    expect(insert).toContain('(1, -7)');
    expect(insert).toContain('(2, 0)');
  });

  it('float values are inserted as unquoted numbers', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'float', values: [3.14, -0.5, 0],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, 3.14)');
    expect(insert).toContain('(1, -0.5)');
    expect(insert).toContain('(2, 0)');
  });

  it('decimal values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'decimal', values: ['123.456', '-0.5', '42'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '123.456')");
    expect(insert).toContain("(1, '-0.5')");
    expect(insert).toContain("(2, '42')");
  });

  it('string values are inserted as escaped single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'string', values: ['hello', "it's", 'world'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, 'hello')");
    expect(insert).toContain("(1, 'it''s')");
    expect(insert).toContain("(2, 'world')");
  });

  it('boolean values are inserted as TRUE/FALSE keywords', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'boolean', values: [true, false, true],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, TRUE)');
    expect(insert).toContain('(1, FALSE)');
    expect(insert).toContain('(2, TRUE)');
  });

  it('date values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'date',
      values: ['2024-01-15', '1970-01-01', '2099-12-31'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '2024-01-15')");
    expect(insert).toContain("(1, '1970-01-01')");
    expect(insert).toContain("(2, '2099-12-31')");
  });

  it('timestamp values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'timestamp',
      values: ['2024-01-15 10:30:00', '2024-06-01 00:00:00.123', '1970-01-01 00:00:00'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '2024-01-15 10:30:00')");
    expect(insert).toContain("(1, '2024-06-01 00:00:00.123')");
    expect(insert).toContain("(2, '1970-01-01 00:00:00')");
  });

  it('time values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'time',
      values: ['14:30:00', '00:00:00', '23:59:59'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '14:30:00')");
    expect(insert).toContain("(1, '00:00:00')");
    expect(insert).toContain("(2, '23:59:59')");
  });

  it('interval values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'interval',
      values: ['1 day', '2 hours 30 minutes', '1 year 6 months'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '1 day')");
    expect(insert).toContain("(1, '2 hours 30 minutes')");
    expect(insert).toContain("(2, '1 year 6 months')");
  });

  it('uuid values are inserted as single-quoted strings', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'uuid',
      values: [
        '550e8400-e29b-41d4-a716-446655440000',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        '00000000-0000-0000-0000-000000000000',
      ],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '550e8400-e29b-41d4-a716-446655440000')");
    expect(insert).toContain("(1, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')");
    expect(insert).toContain("(2, '00000000-0000-0000-0000-000000000000')");
  });
});

// =========================================
// B. CREATE TABLE type mapping per type
// =========================================

describe('CREATE TABLE DuckDB type per VectorDataType', () => {
  const typeToExpected: Record<VectorDataType, string> = {
    integer: 'BIGINT',
    float: 'DOUBLE',
    decimal: 'DECIMAL(18,6)',
    string: 'VARCHAR',
    boolean: 'BOOLEAN',
    uuid: 'UUID',
    date: 'DATE',
    timestamp: 'TIMESTAMP',
    time: 'TIME',
    interval: 'INTERVAL',
  };

  for (const [vectorType, expectedDuckDBType] of Object.entries(typeToExpected)) {
    it(`${vectorType} → ${expectedDuckDBType}`, async () => {
      const { bridge, actions } = setupActions();
      // Use appropriate dummy values per type
      const dummyValues = getDummyValues(vectorType as VectorDataType, 3);
      await actions.addDerivedColumn({
        kind: 'vector', name: 'col', vectorType: vectorType as VectorDataType, values: dummyValues,
      });

      const create = bridge.getQueryCalls().find(s => s.startsWith('CREATE TABLE'));
      expect(create).toContain(expectedDuckDBType);
    });
  }
});

// =========================================
// C. VIEW SQL structure per column kind
// =========================================

describe('VIEW SQL structure', () => {
  it('expression column: inline expression in SELECT, no JOIN', async () => {
    const { bridge, actions } = setupActions({ 'price * 2': 'DOUBLE' });
    await actions.addDerivedColumn({
      kind: 'expression', name: 'doubled', expression: 'price * 2',
    });

    const view = bridge.getQueryCalls().find(s => s.includes('CREATE OR REPLACE VIEW'))!;
    expect(view).toContain('(price * 2) AS "doubled"');
    expect(view).not.toContain('LEFT JOIN');
  });

  it('vector column: aliased reference in SELECT, LEFT JOIN on rowid', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'scores', vectorType: 'float', values: [1, 2, 3],
    });

    const view = bridge.getQueryCalls().find(s => s.includes('CREATE OR REPLACE VIEW'))!;
    expect(view).toContain('h1."scores"');
    expect(view).toContain('LEFT JOIN "__dt_vec_scores_0__" h1 ON t.rowid = h1.__rowid__');
  });

  it('mixed expression + vector: both patterns in one VIEW', async () => {
    const { bridge, actions } = setupActions({ 'price * 2': 'DOUBLE' });
    await actions.addDerivedColumn({
      kind: 'expression', name: 'doubled', expression: 'price * 2',
    });
    await actions.addDerivedColumn({
      kind: 'vector', name: 'scores', vectorType: 'float', values: [1, 2, 3],
    });

    const views = bridge.getQueryCalls().filter(s => s.includes('CREATE OR REPLACE VIEW'));
    const lastView = views[views.length - 1];

    // Expression inline
    expect(lastView).toContain('(price * 2) AS "doubled"');
    // Vector JOIN
    expect(lastView).toContain('h1."scores"');
    expect(lastView).toContain('LEFT JOIN "__dt_vec_scores_0__" h1 ON t.rowid = h1.__rowid__');
  });
});

// =========================================
// D. Edge-case values per type
// =========================================

describe('Edge-case values in vector columns', () => {
  it('date: epoch boundary and far future', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'date',
      values: ['1970-01-01', '2099-12-31', '2000-02-29'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("'1970-01-01'");
    expect(insert).toContain("'2099-12-31'");
    expect(insert).toContain("'2000-02-29'");
  });

  it('timestamp: with fractional seconds', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'timestamp',
      values: ['2024-01-15 10:30:00.123', '2024-01-15 10:30:00.000001', '2024-01-15 10:30:00'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("'2024-01-15 10:30:00.123'");
    expect(insert).toContain("'2024-01-15 10:30:00.000001'");
    expect(insert).toContain("'2024-01-15 10:30:00'");
  });

  it('time: midnight and end of day', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'time',
      values: ['00:00:00', '23:59:59', '12:00:00.5'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("'00:00:00'");
    expect(insert).toContain("'23:59:59'");
    expect(insert).toContain("'12:00:00.5'");
  });

  it('interval: compound and minimal', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'interval',
      values: ['1 year 6 months 3 days 4 hours', '1 second', '0 days'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("'1 year 6 months 3 days 4 hours'");
    expect(insert).toContain("'1 second'");
    expect(insert).toContain("'0 days'");
  });

  it('string: empty, with single quotes, with special chars', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'string',
      values: ['', "it's a test", 'line\twith\ttabs'],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("(0, '')");
    expect(insert).toContain("'it''s a test'");
    expect(insert).toContain("'line\twith\ttabs'");
  });

  it('integer: zero, negative, and MAX_SAFE_INTEGER', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'integer',
      values: [0, -999, Number.MAX_SAFE_INTEGER],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, 0)');
    expect(insert).toContain('(1, -999)');
    expect(insert).toContain(`(2, ${Number.MAX_SAFE_INTEGER})`);
  });

  it('float: very small, very large, and negative zero', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'float',
      values: [1e-10, 1e15, -0],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, 1e-10)');
    expect(insert).toContain('(1, 1000000000000000)');
    expect(insert).toContain('(2, 0)'); // -0 stringifies to '0'
  });

  it('boolean: mixed true and false', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'boolean',
      values: [true, false, true],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain('(0, TRUE)');
    expect(insert).toContain('(1, FALSE)');
    expect(insert).toContain('(2, TRUE)');
  });

  it('uuid: lowercase and uppercase hex', async () => {
    const { bridge, actions } = setupActions();
    await actions.addDerivedColumn({
      kind: 'vector', name: 'col', vectorType: 'uuid',
      values: [
        '550e8400-e29b-41d4-a716-446655440000',
        'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      ],
    });

    const insert = bridge.getQueryCalls().find(s => s.startsWith('INSERT'));
    expect(insert).toContain("'550e8400-e29b-41d4-a716-446655440000'");
    expect(insert).toContain("'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'");
    expect(insert).toContain("'ffffffff-ffff-ffff-ffff-ffffffffffff'");
  });
});

// =========================================
// Helpers
// =========================================

function getDummyValues(type: VectorDataType, count: number): any[] {
  switch (type) {
    case 'integer': return Array.from({ length: count }, (_, i) => i);
    case 'float': return Array.from({ length: count }, (_, i) => i * 0.5);
    case 'decimal': return Array.from({ length: count }, (_, i) => (i * 0.123).toFixed(6));
    case 'string': return Array.from({ length: count }, (_, i) => `val_${i}`);
    case 'boolean': return Array.from({ length: count }, (_, i) => i % 2 === 0);
    case 'uuid': return Array.from({ length: count }, (_, i) =>
      `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`);
    case 'date': return Array.from({ length: count }, (_, i) =>
      `2024-01-${String(i + 1).padStart(2, '0')}`);
    case 'timestamp': return Array.from({ length: count }, (_, i) =>
      `2024-01-${String(i + 1).padStart(2, '0')} 10:30:00`);
    case 'time': return Array.from({ length: count }, (_, i) =>
      `${String(i).padStart(2, '0')}:30:00`);
    case 'interval': return Array.from({ length: count }, (_, i) => `${i + 1} day`);
  }
}
