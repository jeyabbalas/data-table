/**
 * The annotation file a save hands the session store: taken once per change
 * of the store's content, so the store can tell an unchanged one by its
 * token alone, and adopted after a restore, so a reload writes nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationFile } from '@/annotations/types';
import { createSignal } from '@/core/Signal';
import {
  ANNOTATIONS_RECORD_FORMAT,
  adoptAnnotationFile,
  annotationFileToken,
  checkAnnotationsRecord,
  currentAnnotationFile,
  isAnnotationsMarker,
  newAnnotationsOwner,
  shareAnnotationFileToken,
} from '@/persistence/annotationPersistence';

function makeStore(tableName: string | null = 't') {
  const name = createSignal<string | null>(tableName);
  let seq = 0;
  const store = new AnnotationStore({
    tableName: name,
    idGenerator: () => `ann_${++seq}`,
    now: () => '2026-10-10T00:00:00.000Z',
  });
  return { store, name };
}

function fileOf(count: number, tableName = 't'): AnnotationFile {
  return {
    version: 1,
    tableName,
    annotations: Array.from({ length: count }, (_, i) => ({
      id: `f${i}`,
      scope: 'row' as const,
      rowId: i,
      severity: 'warning' as const,
      message: `m${i}`,
    })),
  };
}

describe('currentAnnotationFile', () => {
  it('is null for an empty store', () => {
    const { store } = makeStore();
    expect(currentAnnotationFile(store)).toBeNull();
  });

  it('returns the same object until the content changes', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const first = currentAnnotationFile(store);
    expect(first?.annotations).toHaveLength(1);
    expect(currentAnnotationFile(store)).toBe(first);
    expect(currentAnnotationFile(store)).toBe(first);
  });

  it('takes the file once per content change, not per call', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const toJSON = vi.spyOn(store, 'toJSON');
    for (let i = 0; i < 10; i++) currentAnnotationFile(store);
    expect(toJSON).toHaveBeenCalledTimes(1);
    store.add({ scope: 'row', rowId: 2, severity: 'info', message: 'b' });
    for (let i = 0; i < 10; i++) currentAnnotationFile(store);
    expect(toJSON).toHaveBeenCalledTimes(2);
  });

  it('takes a new file after every kind of content change', () => {
    const { store } = makeStore();
    const a = store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    let previous = currentAnnotationFile(store);
    const changes: (() => unknown)[] = [
      () => store.add({ scope: 'column', column: 'x', severity: 'info', message: 'c' }),
      () => store.update(a.id, { message: 'a2' }),
      () =>
        store.addMany([
          { scope: 'cell', rowId: 2, column: 'x', severity: 'warning', message: 'd' },
        ]),
      () => store.remove(a.id),
      () => store.loadJSON(fileOf(3), 'replace'),
      () => store.clear('row'),
    ];
    for (const change of changes) {
      change();
      const next = currentAnnotationFile(store);
      expect(next).not.toBe(previous);
      previous = next;
    }
    store.clear('all');
    expect(currentAnnotationFile(store)).toBeNull();
  });

  it('keeps the file across severity-filter changes', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const file = currentAnnotationFile(store);
    store.setSeverityFilter({ error: false });
    store.setSeverityFilter({ warning: false, error: true });
    expect(currentAnnotationFile(store)).toBe(file);
  });

  it('takes a new file when the table name the store resolves changes', () => {
    const { store, name } = makeStore('t1');
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const first = currentAnnotationFile(store);
    expect(first?.tableName).toBe('t1');
    name.set('t2');
    const second = currentAnnotationFile(store);
    expect(second).not.toBe(first);
    expect(second?.tableName).toBe('t2');
  });

  it('keeps a file per store', () => {
    const one = makeStore('a').store;
    const two = makeStore('b').store;
    one.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    two.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const fileOne = currentAnnotationFile(one);
    const fileTwo = currentAnnotationFile(two);
    expect(fileOne).not.toBe(fileTwo);
    expect(currentAnnotationFile(one)).toBe(fileOne);
    expect(currentAnnotationFile(two)).toBe(fileTwo);
  });
});

describe('annotation file tokens', () => {
  it('are stable per object and distinct between objects', () => {
    const a = fileOf(1);
    const b = fileOf(1);
    expect(annotationFileToken(a)).toBe(annotationFileToken(a));
    expect(annotationFileToken(a)).not.toBe(annotationFileToken(b));
  });

  it('can be shared with a copy of a file', () => {
    const a = fileOf(1);
    const copy = structuredClone(a);
    shareAnnotationFileToken(copy, annotationFileToken(a));
    expect(annotationFileToken(copy)).toBe(annotationFileToken(a));
  });
});

describe('adoptAnnotationFile', () => {
  it('gives the store’s current file the token of the file it was loaded from', () => {
    const { store } = makeStore();
    const file = fileOf(3);
    store.loadJSON(file, 'replace');
    adoptAnnotationFile(store, file);
    const current = currentAnnotationFile(store);
    expect(current).not.toBe(file);
    expect(annotationFileToken(current!)).toBe(annotationFileToken(file));
  });

  it('does not keep the file it adopts', () => {
    const { store } = makeStore();
    const file = fileOf(2);
    store.loadJSON(file, 'replace');
    adoptAnnotationFile(store, file);
    // The current file holds the store's own annotations, not the file's.
    const current = currentAnnotationFile(store)!;
    expect(current.annotations[0]).not.toBe(file.annotations[0]);
    expect(current.annotations[0]).toBe(store.get('f0'));
  });

  it('adopts nothing when the store holds fewer annotations than the file', () => {
    const { store } = makeStore();
    const file = fileOf(3);
    file.annotations.push({ ...file.annotations[0]! });
    store.loadJSON(file, { mode: 'replace', duplicates: 'skip' });
    adoptAnnotationFile(store, file);
    expect(annotationFileToken(currentAnnotationFile(store)!)).not.toBe(annotationFileToken(file));
  });

  it('adopts nothing for a file of another table or an older file version', () => {
    const other = makeStore('t').store;
    const otherFile = fileOf(1, 'elsewhere');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    other.loadJSON(otherFile, 'replace');
    adoptAnnotationFile(other, otherFile);
    expect(annotationFileToken(currentAnnotationFile(other)!)).not.toBe(
      annotationFileToken(otherFile),
    );

    const older = makeStore('t').store;
    const olderFile = { ...fileOf(1), version: 0 };
    older.loadJSON(olderFile, 'replace');
    adoptAnnotationFile(older, olderFile);
    expect(annotationFileToken(currentAnnotationFile(older)!)).not.toBe(
      annotationFileToken(olderFile),
    );
    vi.restoreAllMocks();
  });

  it('does nothing for an empty file', () => {
    const { store } = makeStore();
    const file = fileOf(0);
    store.loadJSON(file, 'replace');
    expect(() => adoptAnnotationFile(store, file)).not.toThrow();
    expect(currentAnnotationFile(store)).toBeNull();
  });
});

describe('the annotations record and its marker', () => {
  const marker = { format: ANNOTATIONS_RECORD_FORMAT, count: 2, owner: 'o1' };
  const record = (overrides: Record<string, unknown> = {}) => ({
    format: ANNOTATIONS_RECORD_FORMAT,
    owner: 'o1',
    count: 2,
    file: fileOf(2),
    ...overrides,
  });

  it('owners are unique', () => {
    const owners = new Set(Array.from({ length: 1000 }, () => newAnnotationsOwner()));
    expect(owners.size).toBe(1000);
  });

  it('reads a marker of this format only', () => {
    expect(isAnnotationsMarker(marker)).toBe(true);
    expect(isAnnotationsMarker({ ...marker, format: 2 })).toBe(false);
    expect(isAnnotationsMarker({ ...marker, count: -1 })).toBe(false);
    expect(isAnnotationsMarker({ ...marker, count: 1.5 })).toBe(false);
    expect(isAnnotationsMarker({ ...marker, owner: '' })).toBe(false);
    expect(isAnnotationsMarker({ format: 1, count: 2 })).toBe(false);
    expect(isAnnotationsMarker(null)).toBe(false);
    expect(isAnnotationsMarker([marker])).toBe(false);
  });

  it('attaches the record written with the session record', () => {
    const value = record();
    expect(checkAnnotationsRecord(marker, value)).toEqual({ ok: true, file: value.file });
  });

  it('tells a missing record, another save’s, and a malformed one apart', () => {
    expect(checkAnnotationsRecord(marker, undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(checkAnnotationsRecord(marker, record({ owner: 'o2' }))).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    for (const bad of [
      'a string',
      [record()],
      record({ format: 2 }),
      record({ owner: 7 }),
      record({ count: 3 }),
      record({ count: -1 }),
      record({ file: null }),
      record({ file: [] }),
      record({ file: { version: 1, annotations: 'x' } }),
      record({ file: { annotations: fileOf(2).annotations } }),
      record({ file: fileOf(3), count: 2 }),
    ]) {
      expect(checkAnnotationsRecord(marker, bad), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
  });
});
