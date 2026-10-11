/**
 * @vitest-environment jsdom
 *
 * Nothing persistence keeps holds the annotations: a save takes their file
 * only to write it, and drops it once written; a load or a clear lets the
 * annotations it replaces go, with or without persistence. Checked with
 * `WeakRef`s and a forced garbage collection.
 */
import 'fake-indexeddb/auto';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationFile } from '@/annotations/types';
import { createDataTable, type DataTable } from '@/index';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { AutoSave } from '@/persistence/AutoSave';
import { SessionStore } from '@/persistence/SessionStore';
import {
  deleteDatabase,
  makeAnnotations,
  makeState,
  rawAnnotations,
} from '../helpers/sessionDatabases';

/** `global.gc` when Node exposes it; else exposed the way Jest's leak detector does. */
function findGc(): (() => void) | undefined {
  const exposed = (globalThis as { gc?: () => void }).gc;
  if (exposed) return exposed;
  try {
    setFlagsFromString('--expose-gc');
    return runInNewContext('gc') as () => void;
  } catch {
    return undefined;
  }
}

const gc = findGc();
const itWithGc = gc ? it : it.skip;

async function collect(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    gc!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn(async (_source: unknown, options?: { tableName?: string }) => ({
      tableName: options?.tableName ?? 'A',
      rowCount: 0,
      schema,
    })),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    dropTable: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

const BARE = {
  presets: false,
  undoRedo: false,
  expressionFilter: false,
  visualizations: false,
  exportDialog: false,
} as const;

/**
 * 1,000 annotations; with `extra`, each with a field of the app's own, which
 * `toJSON` copies each annotation for. Without, a file holds the store's own
 * annotations.
 */
function fill(store: AnnotationStore, extra = false): void {
  store.addMany(
    Array.from({ length: 1000 }, (_, i) => ({
      id: `a${i}`,
      scope: 'row' as const,
      rowId: i,
      severity: 'error' as const,
      message: `m${i}`,
      ...(extra ? { ruleId: `rule-${i % 50}` } : {}),
    })),
  );
}

/**
 * WeakRefs to every file `store.toJSON` returns from now, and to its first
 * annotation. Wrapped by hand: a spy would keep what it returns.
 */
function watchFiles(store: AnnotationStore): WeakRef<object>[] {
  const refs: WeakRef<object>[] = [];
  const toJSON = store.toJSON.bind(store);
  store.toJSON = (): AnnotationFile => {
    const file = toJSON();
    refs.push(new WeakRef(file));
    if (file.annotations[0]) refs.push(new WeakRef(file.annotations[0]));
    return file;
  };
  return refs;
}

/**
 * The saves `store` is asked for from now, settled either way. Wrapped by
 * hand: a spy would keep the snapshots.
 */
function watchSaves(store: SessionStore): Promise<unknown>[] {
  const saves: Promise<unknown>[] = [];
  const save = store.save.bind(store);
  store.save = (snapshot) => {
    const done = save(snapshot);
    saves.push(done.catch(() => undefined));
    return done;
  };
  return saves;
}

const alive = (refs: WeakRef<object>[]) => refs.filter((ref) => ref.deref() !== undefined).length;

/**
 * Close `store` and delete both databases: fake-indexeddb keeps every
 * transaction it ran, with the handlers of its requests, until then, which
 * a browser does not.
 */
async function dropDatabases(store: SessionStore): Promise<void> {
  store.close();
  await deleteDatabase('dt-sessions');
  await deleteDatabase('dt-annotations');
}

const tables: DataTable[] = [];

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

beforeEach(async () => {
  await deleteDatabase('dt-sessions');
  await deleteDatabase('dt-annotations');
});

afterEach(async () => {
  for (const table of tables.splice(0)) if (!table.isDestroyed()) await table.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('the annotations’ file', () => {
  itWithGc(
    'is not held once a save has written it, nor taken by saves that change nothing',
    async () => {
      const store = new SessionStore();
      const state = makeState();
      const annotations = makeAnnotations(state);
      fill(annotations, true);
      const refs = watchFiles(annotations);
      const saved = watchSaves(store);
      const autoSave = new AutoSave(state, store, { annotationStore: annotations, debounceMs: 1 });
      autoSave.enable();
      const settle = async (count: number) => {
        await vi.waitFor(() => expect(saved).toHaveLength(count));
        await Promise.all(saved);
      };

      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
      await settle(1);
      expect((await rawAnnotations())?.['count']).toBe(1000);
      // Taken once, to write it; a merged copy of each annotation, for its field.
      expect(refs).toHaveLength(2);
      expect(annotations.get('a0')).not.toBe(refs[1]!.deref());

      state.sortColumns.set([{ column: 'name', direction: 'desc' }]);
      await settle(2);
      expect(refs).toHaveLength(2);
      autoSave.destroy();
      await dropDatabases(store);
      await collect();
      expect(alive(refs)).toBe(0);
    },
  );
});

describe('the annotations a load or a clear replaces', () => {
  itWithGc('go with a load, without persistence', async () => {
    const table = await createDataTable({
      container: container(),
      bridge: makeBridge(),
      persistence: false,
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    tables.push(table);
    fill(table.annotations);
    const probe = new WeakRef(table.annotations.get('a0')!);
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });
    expect(table.annotations.count()).toBe(0);
    await collect();
    expect(probe.deref()).toBeUndefined();
  });

  itWithGc('go with a load, once the save of them it found pending has written them', async () => {
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const table = await createDataTable({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    tables.push(table);
    const refs = watchFiles(table.annotations);
    fill(table.annotations);
    const probe = new WeakRef(table.annotations.get('a0')!);
    const saves = watchSaves(sessionStore);
    await table.loadData(new File([''], 'b.csv'), { tableName: 'B' });
    expect(saves).toHaveLength(1);
    await Promise.all(saves);
    expect((await rawAnnotations('A'))?.['count']).toBe(1000);
    await dropDatabases(sessionStore);
    await collect();
    expect(probe.deref()).toBeUndefined();
    expect(alive(refs)).toBe(0);
  });

  itWithGc('go with clearSession, and nothing keeps them past the debounce', async () => {
    const sessionStore = new SessionStore();
    await sessionStore.open();
    const table = await createDataTable({
      container: container(),
      bridge: makeBridge(),
      persistence: { sessionStore },
      source: new File([''], 'a.csv'),
      tableName: 'A',
      ...BARE,
    });
    tables.push(table);
    fill(table.annotations);
    const probe = new WeakRef(table.annotations.get('a0')!);
    await table.clearSession();
    expect(table.annotations.count()).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 1200)); // past AutoSave's debounce
    await dropDatabases(sessionStore);
    await collect();
    expect(probe.deref()).toBeUndefined();
  });
});
