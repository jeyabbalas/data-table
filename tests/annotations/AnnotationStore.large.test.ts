/**
 * Bulk operations at sizes where the store used to fail.
 *
 * `clear()` once spread every id into one `push(...)` call, which threw a
 * `RangeError` from ~125K annotations, and removed annotations one by one by
 * splicing an insertion-order array (minutes at 100K); `loadJSON` and
 * `loadData` went through the same path. A failing `addMany` rolled back by
 * removing what it had inserted, one splice at a time. These tests assert
 * results and store state, not time: with the old paths they throw or time
 * out.
 */

import { describe, expect, it } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type {
  Annotation,
  AnnotationChangePayload,
  AnnotationFile,
  AnnotationScope,
  NewAnnotation,
} from '@/annotations/types';

const SEVERITIES = ['error', 'warning', 'info'] as const;

/** 90% cell, 9% row, 1% column, spread over 50K rows × 200 columns. */
function fixture(n: number, offset = 0): NewAnnotation[] {
  const out = new Array<NewAnnotation>(n);
  for (let k = 0; k < n; k++) {
    const i = k + offset;
    const severity = SEVERITIES[i % 3]!;
    const r = i % 100;
    if (r < 90) {
      out[k] = {
        scope: 'cell',
        rowId: (i * 7919) % 50_000,
        column: `c${(i * 31) % 200}`,
        severity,
        message: 'cell',
      };
    } else if (r < 99) {
      out[k] = { scope: 'row', rowId: (i * 104_729) % 50_000, severity, message: 'row' };
    } else {
      out[k] = { scope: 'column', column: `c${i % 200}`, severity, message: 'column' };
    }
  }
  return out;
}

function captureError(fn: () => unknown): { code?: string; details?: Record<string, unknown> } {
  try {
    fn();
  } catch (err) {
    return err as { code?: string; details?: Record<string, unknown> };
  }
  throw new Error('expected a throw');
}

/** What a failed call must leave as it was. */
function fingerprint(store: AnnotationStore) {
  const all = store.getAll();
  return {
    count: store.count(),
    revision: store.revision,
    contentRevision: store.contentRevision,
    ids: all.map((a) => a.id).join('\n'),
    byRow: store.getByRow(7919).map((a) => a.id),
    byColumn: store.getByColumn('c31').length,
    annotatedRows: store.annotatedRows().rowIds.length,
  };
}

function listen(store: AnnotationStore): AnnotationChangePayload[] {
  const events: AnnotationChangePayload[] = [];
  store.on('change', (e) => events.push(e));
  return events;
}

function expectParallel(event: AnnotationChangePayload, anns: Annotation[]): void {
  expect(event.ids).toHaveLength(anns.length);
  expect(event.annotations).toHaveLength(anns.length);
  for (let i = 0; i < anns.length; i += 997) {
    expect(event.ids[i]).toBe(anns[i]!.id);
    expect(event.annotations![i]).toBe(anns[i]);
  }
  expect(event.ids.at(-1)).toBe(anns.at(-1)!.id);
}

describe('AnnotationStore — large batches', () => {
  it('clear() removes 150K annotations, with one event carrying every id', () => {
    const store = new AnnotationStore();
    const added = store.addMany(fixture(150_000));
    const events = listen(store);
    expect(store.clear()).toBe(150_000);
    expect(store.count()).toBe(0);
    expect(store.getByCell(7919, 'c31')).toEqual([]);
    expect(store.annotatedRows().rowIds).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('cleared');
    expectParallel(events[0]!, added);
  });

  for (const scope of ['cell', 'row', 'column'] as AnnotationScope[]) {
    it(`clear('${scope}') at 150K removes that scope only, in insertion order`, () => {
      const store = new AnnotationStore();
      const added = store.addMany(fixture(150_000));
      const removed = added.filter((a) => a.scope === scope);
      const kept = added.filter((a) => a.scope !== scope);
      const events = listen(store);
      expect(store.clear(scope)).toBe(removed.length);
      expect(store.count()).toBe(kept.length);
      expect(store.getAll().every((a) => a.scope !== scope)).toBe(true);
      expect(store.getAll().map((a) => a.id)).toEqual(kept.map((a) => a.id));
      expect(events).toHaveLength(1);
      expectParallel(events[0]!, removed);
      // The other scopes still answer.
      const sample = kept[kept.length >> 1]!;
      expect(store.get(sample.id)).toBe(sample);
    });
  }

  it("loadJSON('replace') of 150K onto 150K emits cleared, then added", () => {
    const source = new AnnotationStore();
    source.addMany(fixture(150_000, 7));
    const file = source.toJSON();

    const store = new AnnotationStore();
    const prior = store.addMany(fixture(150_000));
    const events = listen(store);
    expect(store.loadJSON(file, 'replace')).toEqual({ added: 150_000, skipped: 0 });
    expect(store.count()).toBe(150_000);
    expect(events.map((e) => e.kind)).toEqual(['cleared', 'added']);
    expectParallel(events[0]!, prior);
    expectParallel(events[1]!, store.getAll());
    expect(store.getAll().map((a) => a.id)).toEqual(file.annotations.map((a) => a.id));

    // And clearing what was loaded.
    expect(store.clear('all')).toBe(150_000);
  });

  it('addMany(100K) with an invalid last entry throws with its index and changes nothing', () => {
    const store = new AnnotationStore();
    store.addMany(fixture(1_000, 500_000));
    const before = fingerprint(store);
    const events = listen(store);
    const batch = fixture(100_000);
    const bad = { ...batch[99_999]!, severity: 'fatal' } as unknown as NewAnnotation;
    const err = captureError(() => store.addMany([...batch.slice(0, 99_999), bad]));
    expect(err.code).toBe('ANNOTATION_INVALID_SHAPE');
    expect(err.details).toEqual({ index: 99_999, field: 'severity' });
    expect(fingerprint(store)).toEqual(before);
    expect(events).toHaveLength(0);
  });

  it('addMany(100K) whose last id is stored throws with that id and index, and changes nothing', () => {
    const store = new AnnotationStore();
    store.add({ id: 'taken', scope: 'row', rowId: 1, severity: 'info', message: 'x' });
    const before = fingerprint(store);
    const events = listen(store);
    const batch = fixture(100_000).map((a, i) => ({ ...a, id: `b${i}` }));
    batch[99_999] = { ...batch[99_999]!, id: 'taken' };
    const err = captureError(() => store.addMany(batch));
    expect(err.code).toBe('ANNOTATION_DUPLICATE_ID');
    expect(err.details).toEqual({ id: 'taken', index: 99_999 });
    expect(fingerprint(store)).toEqual(before);
    expect(events).toHaveLength(0);
    // The ids the failed call claimed are free again.
    expect(store.addMany(batch.slice(0, 99_999))).toHaveLength(99_999);
    expect(store.count()).toBe(100_000);
  });

  it('addMany(100K) repeating an id within the batch throws at the repeat', () => {
    const store = new AnnotationStore();
    const before = fingerprint(store);
    const batch = fixture(100_000).map((a, i) => ({ ...a, id: `b${i}` }));
    batch[99_998] = { ...batch[99_998]!, id: 'b5' };
    const err = captureError(() => store.addMany(batch));
    expect(err.code).toBe('ANNOTATION_DUPLICATE_ID');
    expect(err.details).toEqual({ id: 'b5', index: 99_998 });
    expect(fingerprint(store)).toEqual(before);
    expect(store.get('b0')).toBeNull();
  });

  it("loadJSON('merge') of 100K with a late collision throws and changes nothing", () => {
    const store = new AnnotationStore();
    store.add({ id: 'taken', scope: 'row', rowId: 1, severity: 'info', message: 'x' });
    const before = fingerprint(store);
    const anns = fixture(100_000).map((a, i) => ({ ...a, id: `f${i}` })) as Annotation[];
    anns[99_999] = { ...anns[99_999]!, id: 'taken' };
    const file: AnnotationFile = { version: 1, annotations: anns };
    const err = captureError(() => store.loadJSON(file, 'merge'));
    expect(err.code).toBe('ANNOTATION_DUPLICATE_ID');
    expect(err.details).toEqual({ id: 'taken', index: 99_999 });
    expect(fingerprint(store)).toEqual(before);
  });
});
