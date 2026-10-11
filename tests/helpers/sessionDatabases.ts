/**
 * IndexedDB helpers for the session store's tests: a table state and
 * annotation store to save, and reads, writes and write counts of the
 * `dt-sessions` and `dt-annotations` databases made the way another writer
 * (an older version, another tab, a tamperer) would make them. Import
 * `fake-indexeddb/auto` in the test file first.
 */
import { vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationFile } from '@/annotations/types';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SessionSnapshot } from '@/persistence/types';

export const schema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

export function makeState(tableName = 't'): TableState {
  const state = createTableState();
  state.tableName.set(tableName);
  state.baseTableName.set(tableName);
  state.totalRows.set(10);
  state.filteredRows.set(10);
  initializeColumnsFromSchema(state, schema);
  return state;
}

export function makeAnnotations(state: TableState): AnnotationStore {
  return new AnnotationStore({
    tableName: state.baseTableName,
    now: () => '2026-10-10T00:00:00.000Z',
  });
}

export function annotate(store: AnnotationStore, count: number, from = 0): void {
  store.addMany(
    Array.from({ length: count }, (_, i) => ({
      id: `a${from + i}`,
      scope: 'cell' as const,
      rowId: from + i,
      column: 'name',
      severity: 'warning' as const,
      message: `m${from + i}`,
    })),
  );
}

export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Read a stored value directly, without creating the database. */
export function readRaw(dbName: string, storeName: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(undefined);
        return;
      }
      const get = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
      get.onerror = () => {
        db.close();
        reject(get.error);
      };
    };
  });
}

/** The stores of `dt-annotations`, made as this version's upgrade makes them. */
export function createAnnotationStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations');
  if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
}

/**
 * Put values as another writer (an older version, a tamperer) would: each
 * `[value, key]` in `store` of `dbName`.
 */
export function plantIn(
  dbName: 'dt-sessions' | 'dt-annotations',
  storeName: 'sessions' | 'annotations' | 'chunks',
  entries: [unknown, IDBValidKey?][],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (dbName === 'dt-sessions') {
        request.result.createObjectStore('sessions', { keyPath: 'tableName' });
      } else {
        createAnnotationStores(request.result);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readwrite');
      for (const [value, key] of entries) {
        if (key === undefined) tx.objectStore(storeName).put(value);
        else tx.objectStore(storeName).put(value, key);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Delete `key` from `store` of `dt-annotations`, as another writer would. */
export function deleteRaw(storeName: 'annotations' | 'chunks', key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dt-annotations', 1);
    request.onupgradeneeded = () => createAnnotationStores(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Put a session record, or an annotations head under `key`, as another writer would. */
export function plant(
  dbName: 'dt-sessions' | 'dt-annotations',
  value: unknown,
  key?: string,
): Promise<void> {
  return plantIn(dbName, dbName === 'dt-sessions' ? 'sessions' : 'annotations', [[value, key]]);
}

/** Put `file` as `table`'s annotations record under `owner`, as this version writes one. */
export async function plantRecord(
  table: string,
  owner: string,
  file: AnnotationFile,
  chunkSize = 10_000,
): Promise<void> {
  const chunks: [unknown, IDBValidKey][] = [];
  for (let start = 0; start < file.annotations.length; start += chunkSize) {
    chunks.push([file.annotations.slice(start, start + chunkSize), [table, owner, chunks.length]]);
  }
  const { annotations, ...fields } = file;
  await plantIn('dt-annotations', 'chunks', chunks);
  await plant(
    'dt-annotations',
    { format: 1, owner, count: annotations.length, chunks: chunks.length, file: fields },
    table,
  );
}

export const rawSession = (key = 't') =>
  readRaw('dt-sessions', 'sessions', key) as Promise<Record<string, unknown> | undefined>;
/** The head of `key`'s annotations record. */
export const rawAnnotations = (key = 't') =>
  readRaw('dt-annotations', 'annotations', key) as Promise<Record<string, unknown> | undefined>;

/** Every stored chunk of `table`, in key order. */
export function rawChunks(
  table = 't',
): Promise<{ key: [string, string, number]; value: unknown }[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dt-annotations');
    request.onupgradeneeded = () => request.transaction!.abort();
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('chunks')) {
        db.close();
        resolve([]);
        return;
      }
      const range = IDBKeyRange.bound([table], [table, []]);
      const store = db.transaction('chunks', 'readonly').objectStore('chunks');
      const keys = store.getAllKeys(range);
      const values = store.getAll(range);
      values.onsuccess = () => {
        db.close();
        resolve(
          values.result.map((value, i) => ({
            key: keys.result[i] as [string, string, number],
            value,
          })),
        );
      };
      values.onerror = () => {
        db.close();
        reject(values.error);
      };
    };
  });
}

/** The ids the stored chunks of `table` hold, in order. */
export async function rawIds(table = 't'): Promise<string[]> {
  return (await rawChunks(table)).flatMap((chunk) =>
    (chunk.value as { id: string }[]).map((a) => a.id),
  );
}

export type Store = 'sessions' | 'annotations' | 'chunks';

/** Counts the puts and deletes each object store receives. */
export function countWrites() {
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  const del = vi.spyOn(IDBObjectStore.prototype, 'delete');
  const tally = (spy: { mock: { contexts: unknown[] } }, store: Store) =>
    spy.mock.contexts.filter((ctx) => (ctx as IDBObjectStore).name === store).length;
  return {
    puts: (store: Store) => tally(put, store),
    deletes: (store: Store) => tally(del, store),
  };
}

export function sessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: 0,
    tableName: 't',
    filters: [],
    sortColumns: [{ column: 'id', direction: 'desc' }],
    visibleColumns: ['id', 'name'],
    columnOrder: ['__rowid__', 'id', 'name'],
    columnWidths: { id: 90 },
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

export function annotationFile(count: number): AnnotationFile {
  return {
    version: 1,
    tableName: 't',
    annotations: Array.from({ length: count }, (_, i) => ({
      id: `old${i}`,
      scope: 'row' as const,
      rowId: i,
      severity: 'error' as const,
      message: `old ${i}`,
    })),
  };
}

/**
 * Hold a readwrite transaction on both stores of `dt-annotations` open, as
 * a long write does (another tab's, or one of a million annotations): every
 * readwrite transaction on them waits until `release()`.
 */
export async function holdAnnotationsDb(): Promise<{ release: () => Promise<void> }> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dt-annotations', 1);
    request.onupgradeneeded = () => createAnnotationStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(['annotations', 'chunks'], 'readwrite');
  const store = tx.objectStore('annotations');
  let held = true;
  const spin = (): void => {
    const request = store.get('__held__');
    request.onsuccess = () => {
      if (held) spin();
    };
  };
  spin();
  const done = new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => resolve();
  });
  return {
    release: async () => {
      held = false;
      await done;
      db.close();
    },
  };
}
