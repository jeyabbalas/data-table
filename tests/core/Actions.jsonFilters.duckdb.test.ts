/**
 * Exact filters on a JSON column, saved by a session or a preset before 0.9
 * without `valueType`, on real DuckDB.
 *
 * The Parquet loader loads DuckDB's json extension with a table that holds
 * JSON, and with it `"doc" = 'abc'` is a Conversion Error ("Malformed
 * JSON") that fails every grid query: before 0.9 such a filter compared
 * plain text until something loaded the extension. Restored from a session
 * (`loadData` with a session store) or loaded from a preset, it compares
 * the column's text, which matches the rows it matched when its value was
 * JSON, and nothing when it is not.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import type { Filter } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { FilterPresetManager } from '@/filters/FilterPresets';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import type { SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION, type SessionSnapshot } from '@/persistence/types';
import { __setConnForTests, executeQueryCancellable } from '@/worker/duckdb';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: WorkerBridge;
let parquet: ArrayBuffer;

/** Rows of `doc`, by id. Ids 1 and 2 differ only in spacing. */
const DOCS = [
  [1, '{"a": 1}'],
  [2, '{"a":1}'],
  [3, '[1, 2]'],
  [4, '"abc"'],
  [5, null],
] as const;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  __setConnForTests(harness.conn);
  bridge = {
    ...makeNodeBridge(harness.conn, harness.db),
    query: <T>(sql: string) => executeQueryCancellable<T>(sql),
    clearQueryCache: () => {},
  } as unknown as WorkerBridge;

  // Written by a database of its own, so that this one has not loaded the
  // json extension before the loader does.
  const writer = await createNodeDuckDB();
  const path = join(tmpdir(), `dt_json_filters_${process.pid}.parquet`);
  try {
    const values = DOCS.map(([id, doc]) => `(${id}, ${doc === null ? 'NULL' : `'${doc}'`})`).join(
      ', ',
    );
    await writer.conn.query(
      `COPY (SELECT CAST(id AS INTEGER) AS id, CAST(doc AS JSON) AS doc, ` +
        `['x' || id] AS tags FROM (VALUES ${values}) AS v(id, doc)) TO '${path}' (FORMAT parquet)`,
    );
    const bytes = await readFile(path);
    parquet = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } finally {
    await unlink(path).catch(() => undefined);
    await writer.cleanup();
  }
}, 60_000);

afterAll(async () => {
  __setConnForTests(null);
  await harness?.cleanup();
});

/** The ids `filters` keep, as every grid and chart query filters them. */
async function idsMatching(tableName: string, filters: Filter[]): Promise<number[]> {
  const rows = await executeQueryCancellable<{ id: number }>(
    `SELECT id FROM "${tableName}" WHERE ${filtersToWhereClause(filters)} ORDER BY id`,
  );
  return rows.map((row) => Number(row.id));
}

/** A filter on `doc` as a 0.8 session or preset saved it: no valueType. */
const SAVED: Filter[] = [
  { type: 'point', column: 'doc', value: 'abc' },
  { type: 'not-set', column: 'doc', values: ['{"a": 1}', 'not json'] },
];

function sessionStore(snapshot: SessionSnapshot): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(snapshot),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function loaded(tableName: string, store?: SessionStore) {
  const state = createTableState();
  const actions = new StateActions(state, bridge, new UndoManager());
  // A copy each time: a load hands the buffer to DuckDB, which detaches it.
  await actions.loadData(parquet.slice(0), {
    format: 'parquet',
    tableName,
    ...(store ? { sessionStore: store } : {}),
  });
  return { state, actions };
}

describe('a JSON column from a Parquet file', () => {
  it('fails a query compared as JSON with text that is not JSON, and matches as text', async () => {
    await loaded('docs_plain');
    await expect(
      idsMatching('docs_plain', [{ type: 'point', column: 'doc', value: 'abc' }]),
    ).rejects.toThrow(/Malformed JSON/);
    // Valid JSON matches the same rows either way, spacing included.
    for (const value of ['{"a": 1}', '{"a":1}', '[1, 2]', '"abc"']) {
      const asJson = await idsMatching('docs_plain', [{ type: 'point', column: 'doc', value }]);
      const asText = await idsMatching('docs_plain', [
        { type: 'point', column: 'doc', value, valueType: 'text' },
      ]);
      expect(asText, value).toEqual(asJson);
      expect(asText, value).toHaveLength(1);
    }
  });
});

describe('a session saved before 0.9', () => {
  it('restores its exact filters on the JSON column as text, which the queries run', async () => {
    const snapshot: SessionSnapshot = {
      version: SNAPSHOT_VERSION,
      timestamp: Date.now(),
      tableName: 'docs_session',
      filters: [SAVED[1]!] as SessionSnapshot['filters'],
      sortColumns: [],
      visibleColumns: ['id', 'doc', 'tags'],
      columnOrder: ['__rowid__', 'id', 'doc', 'tags'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [],
      undoStack: [
        {
          filters: [SAVED[0]!] as SessionSnapshot['filters'],
          sortColumns: [],
          visibleColumns: ['id', 'doc', 'tags'],
          columnOrder: ['__rowid__', 'id', 'doc', 'tags'],
          columnWidths: {},
          pinnedColumns: [],
          hiddenColumnInfo: {},
          derivedColumns: [],
        },
      ],
    };
    const { state, actions } = await loaded('docs_session', sessionStore(snapshot));

    expect(state.filters.get()).toEqual([{ ...SAVED[1]!, valueType: 'text' }]);
    // Every row but id 1 (and the NULL, which NOT IN leaves out).
    expect(await idsMatching('docs_session', state.filters.get())).toEqual([2, 3, 4]);

    // The undo entry saved with the session is restored the same way.
    await actions.undo();
    expect(state.filters.get()).toEqual([{ ...SAVED[0]!, valueType: 'text' }]);
    expect(await idsMatching('docs_session', state.filters.get())).toEqual([]);
  });
});

describe('a preset saved before 0.9', () => {
  it('loads its exact filters on the JSON column as text, imported or saved', async () => {
    const { state, actions } = await loaded('docs_preset');
    const presets = new FilterPresetManager();
    const { imported } = presets.importFromJSON(
      JSON.stringify({
        version: 1,
        presets: [{ name: 'from 0.8', filters: SAVED, sortColumns: [] }],
      }),
    );
    expect(imported).toBe(1);

    presets.load(presets.getPresets()[0]!.id, actions);
    expect(state.filters.get()).toEqual(SAVED.map((f) => ({ ...f, valueType: 'text' })));
    expect(await idsMatching('docs_preset', state.filters.get())).toEqual([]);

    // A filter on another column, or with a valueType already, is kept.
    actions.loadFilterPreset([
      { type: 'point', column: 'tags', value: '[x3]' },
      { type: 'point', column: 'doc', value: '[1, 2]', valueType: 'text' },
    ]);
    expect(state.filters.get()).toEqual([
      { type: 'point', column: 'tags', value: '[x3]' },
      { type: 'point', column: 'doc', value: '[1, 2]', valueType: 'text' },
    ]);
    expect(await idsMatching('docs_preset', state.filters.get())).toEqual([3]);
  });
});
