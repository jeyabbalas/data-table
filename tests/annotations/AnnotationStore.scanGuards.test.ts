/**
 * Scan-counting guards: what each `AnnotationStore` operation iterates.
 *
 * While a store is built and exercised, `globalThis.Map` and `globalThis.Set`
 * are counting subclasses, so every collection the store creates counts each
 * element any iteration of it visits (`for…of`, `keys` / `values` /
 * `entries`, `forEach`, `Array.from`) and records the largest collection
 * iterated. The store holds tens of thousands of annotations: an operation
 * that walked the whole store, or a whole index, would visit that many.
 *
 * The counts are machine-independent, so they hold on any runner. Cost
 * claims in wall-clock terms live in the gated perf suite.
 */

import { describe, expect, it } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createScopeSummary, SEVERITY_BIT } from '@/annotations/severity';
import type { Annotation, NewAnnotation } from '@/annotations/types';

let visited = 0;
let largest = 0;

function counted<T>(inner: Iterator<T>, size: number): IterableIterator<T> {
  largest = Math.max(largest, size);
  const it: IterableIterator<T> = {
    next() {
      const r = inner.next();
      if (!r.done) visited++;
      return r;
    },
    [Symbol.iterator]() {
      return it;
    },
  };
  return it;
}

class CountingMap<K, V> extends Map<K, V> {
  override keys(): any {
    return counted(super.keys(), this.size);
  }
  override values(): any {
    return counted(super.values(), this.size);
  }
  override entries(): any {
    return counted(super.entries(), this.size);
  }
  override [Symbol.iterator](): any {
    return this.entries();
  }
  override forEach(fn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    largest = Math.max(largest, this.size);
    for (const [k, v] of super.entries()) {
      visited++;
      fn.call(thisArg, v, k, this);
    }
  }
}

class CountingSet<T> extends Set<T> {
  override keys(): any {
    return counted(super.keys(), this.size);
  }
  override values(): any {
    return counted(super.values(), this.size);
  }
  override entries(): any {
    return counted(super.entries(), this.size);
  }
  override [Symbol.iterator](): any {
    return this.values();
  }
  override forEach(fn: (value: T, key: T, set: Set<T>) => void, thisArg?: unknown): void {
    largest = Math.max(largest, this.size);
    for (const v of super.values()) {
      visited++;
      fn.call(thisArg, v, v, this);
    }
  }
}

/** Runs `fn` with counting collections as the globals; nothing awaits inside. */
function withCountingCollections<T>(fn: () => T): T {
  const RealMap = globalThis.Map;
  const RealSet = globalThis.Set;
  (globalThis as any).Map = CountingMap;
  (globalThis as any).Set = CountingSet;
  try {
    return fn();
  } finally {
    (globalThis as any).Map = RealMap;
    (globalThis as any).Set = RealSet;
  }
}

/** What one call iterated: elements visited and the largest collection walked. */
function scan<T>(fn: () => T): { result: T; visited: number; largest: number } {
  visited = 0;
  largest = 0;
  const result = fn();
  return { result, visited, largest };
}

const ROWS = 2_000;
const COLUMNS = 40;
const HOT_ROW = 7;
const HOT_COLUMN = 'c3';

/**
 * ~30K annotations: 27K cells over 2,000 × 40, 2.7K row-scope, 300
 * column-scope, plus a hot row, column and cell whose buckets hold several
 * entries of every severity.
 */
function fixture(): NewAnnotation[] {
  const out: NewAnnotation[] = [];
  const sev = (i: number) => (['error', 'warning', 'info'] as const)[i % 3]!;
  for (let i = 0; i < 27_000; i++) {
    out.push({
      scope: 'cell',
      rowId: (i * 7919) % ROWS,
      column: `c${(i * 31) % COLUMNS}`,
      severity: sev(i),
      message: `cell ${i}`,
    });
  }
  for (let i = 0; i < 2_700; i++) {
    out.push({ scope: 'row', rowId: (i * 104_729) % ROWS, severity: sev(i), message: `row ${i}` });
  }
  for (let i = 0; i < 300; i++) {
    out.push({ scope: 'column', column: `c${i % COLUMNS}`, severity: sev(i), message: `col ${i}` });
  }
  for (let i = 0; i < 12; i++) {
    out.push({
      scope: 'cell',
      rowId: HOT_ROW,
      column: HOT_COLUMN,
      severity: sev(i),
      message: 'hot',
    });
    out.push({ scope: 'row', rowId: HOT_ROW, severity: sev(i), message: 'hot row' });
    out.push({ scope: 'column', column: HOT_COLUMN, severity: sev(i), message: 'hot col' });
  }
  return out;
}

function buildStore(): { store: AnnotationStore; added: Annotation[] } {
  const store = new AnnotationStore();
  const added = store.addMany(fixture());
  return { store, added };
}

describe('AnnotationStore — scan guards', () => {
  it('lookups, summaries, lists and masks visit only what they return', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      const total = store.count();
      // Built once, on first use; checked below.
      store.getByRow(0);
      store.annotatedRows();
      const summary = createScopeSummary();

      const lookups: [string, () => Annotation[]][] = [
        ['getByCell hot', () => store.getByCell(HOT_ROW, HOT_COLUMN)],
        ['getByCell plain', () => store.getByCell(11, 'c5')],
        ['getByRow hot', () => store.getByRow(HOT_ROW)],
        ['getByRow plain', () => store.getByRow(1_234)],
        ['listRowScope', () => store.listRowScope(HOT_ROW)],
        ['listColumnScope', () => store.listColumnScope(HOT_COLUMN)],
        ['listCellScope', () => store.listCellScope(HOT_ROW, HOT_COLUMN)],
      ];
      for (const [name, fn] of lookups) {
        const r = scan(fn);
        expect(r.result.length, name).toBeGreaterThan(0);
        expect(r.visited, name).toBeLessThanOrEqual(r.result.length);
        expect(r.largest, name).toBeLessThanOrEqual(r.result.length);
      }

      // A column's cells sit in one map per column: walking it visits each
      // annotated row of the column once, plus the entries of shared buckets.
      const byColumn = scan(() => store.getByColumn(HOT_COLUMN));
      expect(byColumn.visited).toBeLessThanOrEqual(2 * byColumn.result.length);
      expect(byColumn.largest).toBeLessThanOrEqual(byColumn.result.length);
      expect(byColumn.result.length).toBeLessThan(total / 20);

      const hotId = store.getByCell(HOT_ROW, HOT_COLUMN)[0]!.id;
      const constant: [string, () => unknown][] = [
        ['get', () => store.get(hotId)],
        ['count', () => store.count()],
        ['summarizeRowScope', () => store.summarizeRowScope(HOT_ROW, summary)],
        ['summarizeColumnScope', () => store.summarizeColumnScope(HOT_COLUMN, summary)],
        ['summarizeCellScope', () => store.summarizeCellScope(HOT_ROW, HOT_COLUMN, summary)],
        ['rowScopeMask', () => store.rowScopeMask(HOT_ROW)],
        ['columnScopeMask', () => store.columnScopeMask(HOT_COLUMN)],
        ['cellScopeMask', () => store.cellScopeMask(HOT_ROW, HOT_COLUMN)],
        ['annotatedRowMask', () => store.annotatedRowMask(HOT_ROW)],
        ['annotatedRows (cached)', () => store.annotatedRows()],
      ];
      for (const [name, fn] of constant) {
        expect(scan(fn).visited, name).toBe(0);
      }
    });
  });

  it('mutations visit nothing beyond their own entries', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      store.getByRow(0); // with the by-row index maintained too
      const hot = store.listCellScope(HOT_ROW, HOT_COLUMN);
      const hotRow = store.listRowScope(HOT_ROW);

      expect(scan(() => store.update(hot[0]!.id, { severity: 'info' })).visited).toBe(0);
      expect(scan(() => store.update(hot[1]!.id, { message: 'edited' })).visited).toBe(0);
      expect(scan(() => store.update(hotRow[0]!.id, { severity: 'error' })).visited).toBe(0);

      // Leaving a bucket of two picks up the entry that stays: one visit in
      // each index holding the cell (by column, and by row).
      const pair = store.addMany([
        { scope: 'cell', rowId: 1_999_999, column: 'c0', severity: 'error', message: 'a' },
        { scope: 'cell', rowId: 1_999_999, column: 'c0', severity: 'info', message: 'b' },
      ]);
      expect(scan(() => store.remove(pair[0]!.id)).visited).toBeLessThanOrEqual(2);
      expect(scan(() => store.remove(hot[2]!.id)).visited).toBe(0);

      const some = store.getByRow(HOT_ROW).slice(0, 10);
      const many = scan(() => store.removeMany(some.map((a) => a.id)));
      expect(many.result).toBe(10);
      expect(many.visited).toBeLessThanOrEqual(10);

      const one = scan(() =>
        store.add({ scope: 'cell', rowId: 5, column: 'c1', severity: 'warning', message: 'x' }),
      );
      expect(one.visited).toBe(0);
      const batch = Array.from({ length: 500 }, (_, i) => ({
        scope: 'cell' as const,
        rowId: i,
        column: 'c2',
        severity: 'error' as const,
        message: `batch ${i}`,
      }));
      expect(scan(() => store.addMany(batch)).visited).toBe(0);
    });
  });

  it('clearing a small scope walks that scope, not the store', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      const total = store.count();
      const columns = store.getAll().filter((a) => a.scope === 'column').length;
      const r = scan(() => store.clear('column'));
      expect(r.result).toBe(columns);
      // Each column's bucket, then its entries.
      expect(r.visited).toBeLessThanOrEqual(2 * columns + COLUMNS);
      expect(r.largest).toBeLessThan(total / 20);
    });
  });

  it('builds payloads only for listeners', () => {
    withCountingCollections(() => {
      const quiet = buildStore().store;
      const total = quiet.count();
      expect(scan(() => quiet.clear()).visited).toBe(0);

      const watched = buildStore().store;
      let received = 0;
      watched.on('change', (e) => {
        received = e.ids.length;
      });
      const r = scan(() => watched.clear());
      expect(received).toBe(total);
      // The ids, then the annotations: one pass each; and the one listener.
      expect(r.visited).toBe(2 * total + 1);
    });
  });

  it('getByRow indexes the cells by row once, then reads that index', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      const cells = store.getAll().filter((a) => a.scope === 'cell').length;
      const first = scan(() => store.getByRow(HOT_ROW));
      expect(first.visited).toBeGreaterThanOrEqual(cells);
      const second = scan(() => store.getByRow(HOT_ROW));
      expect(second.visited).toBeLessThanOrEqual(second.result.length);
      // Kept up to date afterwards: a new cell shows without a rebuild.
      store.add({ scope: 'cell', rowId: HOT_ROW, column: 'c9', severity: 'info', message: 'n' });
      const third = scan(() => store.getByRow(HOT_ROW));
      expect(third.result.length).toBe(second.result.length + 1);
      expect(third.visited).toBeLessThanOrEqual(third.result.length);
    });
  });

  it('annotatedRowMask reads the indexes, never rebuilding annotatedRows after a change', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      const cells = store.getAll().filter((a) => a.scope === 'cell').length;
      // The first read that meets cell annotations builds the by-row index, once.
      expect(scan(() => store.annotatedRowMask(HOT_ROW)).visited).toBeGreaterThanOrEqual(cells);

      // Changes to row and cell scope, as navigation meets after an issue is
      // resolved: a rebuild of annotatedRows would walk every index again.
      const hot = store.listCellScope(HOT_ROW, HOT_COLUMN)[0]!;
      store.add({ scope: 'cell', rowId: 1_500, column: 'c1', severity: 'error', message: 'x' });
      store.add({ scope: 'row', rowId: 1_501, severity: 'info', message: 'y' });
      store.update(hot.id, { severity: 'info' });
      const all = store.getAll();
      for (const rowId of [HOT_ROW, 1_500, 1_501, 1_999, ROWS + 1]) {
        let expected = 0;
        for (const a of all) {
          if (a.scope !== 'column' && a.rowId === rowId) expected |= SEVERITY_BIT[a.severity];
        }
        const read = scan(() => store.annotatedRowMask(rowId));
        expect(read.result, `row ${rowId}`).toBe(expected);
        expect(read.visited, `row ${rowId}`).toBe(0);
      }
    });
  });

  it('annotatedRows rebuilds after a change to row or cell scope only', () => {
    withCountingCollections(() => {
      const { store } = buildStore();
      const first = store.annotatedRows();
      expect(scan(() => store.annotatedRows()).result).toBe(first);

      store.add({ scope: 'column', column: 'c1', severity: 'error', message: 'col' });
      store.setSeverityFilter({ info: false });
      const message = store.listCellScope(HOT_ROW, HOT_COLUMN)[0]!;
      store.update(message.id, { message: 'reworded' });
      expect(store.annotatedRows()).toBe(first);

      store.add({ scope: 'cell', rowId: 1_500, column: 'c1', severity: 'error', message: 'x' });
      const rebuilt = store.annotatedRows();
      expect(rebuilt).not.toBe(first);
      expect(scan(() => store.annotatedRows()).visited).toBe(0);
    });
  });
});
