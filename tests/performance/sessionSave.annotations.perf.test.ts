/**
 * What a session save costs with a million annotations when only the sort
 * changed: the annotations are neither serialized nor cloned again, and the
 * session record is the only write. Before they had a record of their own,
 * every save did both. And a reload restores them without writing them back.
 *
 * Gated by `RUN_ANNOTATION_PERF=1` (`npm run test:perf` sets it): building
 * and first writing a million annotations takes seconds, and the budgets are
 * wall-clock. The default run asserts the same by counts (puts per object
 * store, `toJSON` calls) in `tests/persistence/`.
 *
 * Fixture: 1M annotations, 90% cell / 9% row / 1% column, over 200K rows ×
 * 1,000 columns, seeded, as `annotations.scale.perf.test.ts` builds them.
 * IndexedDB is fake-indexeddb, whose clone is Node's `structuredClone`.
 *
 * Measured on an M1 Pro, Node 22:
 *
 *   a sort-change save, before (toJSON + clone of every annotation)   ~1.2 s
 *   a sort-change save, after (the session record alone)              0.18 ms
 *     of which the annotations' part (`currentAnnotationFile`)        0.4 µs
 *   the first save, which writes the record in 100 chunks             ~1 s
 *     its longest task                                                30 ms
 *   a reload: load (the head and one `getAll` of the chunks)          ~1.3 s
 *             restore (`loadJSON` and the adopting `toJSON`)          ~1.1 s
 *             its first save, with no annotations written             ~2 ms
 *
 * In Chromium the same write takes 0.48 s with no task over 13 ms, and the
 * load 0.57 s, of which `getAll`'s 0.52 s is one task.
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { NewAnnotation } from '@/annotations/types';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { currentAnnotationFile } from '@/persistence/annotationPersistence';
import { restoreStateFromSnapshot, snapshotFromState } from '@/persistence/serialization';
import { SessionStore } from '@/persistence/SessionStore';

const RUN = process.env['RUN_ANNOTATION_PERF'] === '1';
const describeIfPerf = RUN ? describe : describe.skip;

const N = 1_000_000;
const ROWS = 200_000;
const COLS = 1_000;
const columns = Array.from({ length: COLS }, (_, i) => `col_${String(i).padStart(4, '0')}`);
const messages = Array.from({ length: 100 }, (_, i) => `Value violates rule ${i}`);

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 90% cell, 9% row, 1% column, over 200K rows × 1,000 columns, seeded. */
function fixture(seed: number): NewAnnotation[] {
  const rand = mulberry32(seed);
  const out = new Array<NewAnnotation>(N);
  for (let i = 0; i < N; i++) {
    const r = rand();
    const s = rand();
    const severity = s < 0.2 ? 'error' : s < 0.5 ? 'warning' : 'info';
    const message = messages[(rand() * 100) | 0]!;
    if (r < 0.9) {
      out[i] = {
        scope: 'cell',
        rowId: (rand() * ROWS) | 0,
        column: columns[(rand() * COLS) | 0]!,
        severity,
        message,
      };
    } else if (r < 0.99) {
      out[i] = { scope: 'row', rowId: (rand() * ROWS) | 0, severity, message };
    } else {
      out[i] = { scope: 'column', column: columns[(rand() * COLS) | 0]!, severity, message };
    }
  }
  return out;
}

/**
 * The longest stretch the event loop was blocked while `work` ran, as gaps
 * between ticks of a `setImmediate` probe: the longest task.
 */
async function longestTask<T>(work: () => Promise<T>): Promise<[number, T]> {
  let longest = 0;
  let last = performance.now();
  let running = true;
  const tick = (): void => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (running) setImmediate(tick);
  };
  setImmediate(tick);
  const result = await work();
  running = false;
  return [Math.max(longest, performance.now() - last), result];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describeIfPerf('session save with 1M annotations (opt-in via RUN_ANNOTATION_PERF=1)', () => {
  const schema: ColumnSchema[] = [
    { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `c${i}`,
      type: 'integer' as const,
      nullable: true,
      originalType: 'INTEGER',
    })),
  ];
  let state: TableState;
  let annotations: AnnotationStore;
  let store: SessionStore;
  let firstSaveMs = 0;
  let firstSaveLongestMs = 0;

  beforeAll(async () => {
    state = createTableState();
    state.tableName.set('perf');
    state.baseTableName.set('perf');
    initializeColumnsFromSchema(state, schema);
    annotations = new AnnotationStore({ tableName: state.baseTableName });
    annotations.addMany(fixture(7));
    store = new SessionStore();
    await store.open();
    const start = performance.now();
    const [longest] = await longestTask(() =>
      store.save(snapshotFromState(state, undefined, undefined, annotations)),
    );
    firstSaveMs = performance.now() - start;
    firstSaveLongestMs = longest;
  }, 120_000);

  afterAll(() => {
    store?.close();
  });

  it('a sort change saves the session record alone, in well under the old second', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const lookups: number[] = [];
    for (let i = 0; i < 101; i++) {
      const start = performance.now();
      currentAnnotationFile(annotations);
      lookups.push(performance.now() - start);
    }

    const saves: number[] = [];
    const snapshots: number[] = [];
    for (let i = 0; i < 5; i++) {
      state.sortColumns.set([{ column: `c${i}`, direction: i % 2 ? 'desc' : 'asc' }]);
      const start = performance.now();
      const snapshot = snapshotFromState(state, undefined, undefined, annotations);
      const taken = performance.now();
      await store.save(snapshot);
      snapshots.push(taken - start);
      saves.push(performance.now() - start);
    }
    const annotationPuts = put.mock.contexts.filter(
      (ctx) => (ctx as IDBObjectStore).name === 'annotations',
    ).length;
    put.mockRestore();

    // For scale: what each of these saves did before.
    const start = performance.now();
    structuredClone(annotations.toJSON());
    const oldSaveMs = performance.now() - start;

    console.log(
      `[sessionSave 1M] first save (writes the record) ${firstSaveMs.toFixed(0)} ms, ` +
        `its longest task ${firstSaveLongestMs.toFixed(0)} ms; ` +
        `currentAnnotationFile median ${(median(lookups) * 1000).toFixed(1)} µs; ` +
        `snapshot median ${median(snapshots).toFixed(2)} ms; ` +
        `sort-change save median ${median(saves).toFixed(2)} ms; ` +
        `old per-save toJSON + clone ${oldSaveMs.toFixed(0)} ms`,
    );
    expect(annotationPuts).toBe(0);
    // A hundred chunks of 10,000, none of them one long task.
    expect(firstSaveLongestMs).toBeLessThan(250);
    expect(median(lookups)).toBeLessThan(1);
    expect(median(snapshots)).toBeLessThan(5);
    expect(median(saves)).toBeLessThan(50);
  }, 120_000);

  it('a reload restores them, and its first save does not write them back', async () => {
    store.close();
    const reloaded = new SessionStore();
    const nextState = createTableState();
    nextState.tableName.set('perf');
    nextState.baseTableName.set('perf');
    initializeColumnsFromSchema(nextState, schema);
    const nextAnnotations = new AnnotationStore({ tableName: nextState.baseTableName });

    let start = performance.now();
    const [loadLongestMs, snapshot] = await longestTask(() => reloaded.load('perf'));
    const loadMs = performance.now() - start;
    start = performance.now();
    restoreStateFromSnapshot(nextState, snapshot!, undefined, undefined, nextAnnotations);
    const restoreMs = performance.now() - start;
    expect(nextAnnotations.count()).toBe(N);

    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    nextState.sortColumns.set([{ column: 'c1', direction: 'asc' }]);
    start = performance.now();
    await reloaded.save(snapshotFromState(nextState, undefined, undefined, nextAnnotations));
    const saveMs = performance.now() - start;
    const annotationPuts = put.mock.contexts.filter(
      (ctx) => (ctx as IDBObjectStore).name === 'annotations',
    ).length;
    put.mockRestore();
    reloaded.close();

    console.log(
      `[sessionSave 1M] reload: load ${loadMs.toFixed(0)} ms ` +
        `(longest task ${loadLongestMs.toFixed(0)} ms); ` +
        `restore (loadJSON + adopt) ${restoreMs.toFixed(0)} ms; ` +
        `first save after it ${saveMs.toFixed(2)} ms`,
    );
    expect(annotationPuts).toBe(0);
    expect(saveMs).toBeLessThan(50);
  }, 120_000);
});
