/**
 * The annotation file a save hands the session store: taken once per change
 * of the store's content, so the store can tell an unchanged one by its
 * token alone, and adopted after a restore, so a reload writes nothing.
 */
import { serialize } from 'node:v8';
import { describe, expect, it, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationFile } from '@/annotations/types';
import { createSignal } from '@/core/Signal';
import {
  ANNOTATION_CHUNK_MAX_BYTES,
  ANNOTATION_CHUNK_MAX_COUNT,
  ANNOTATIONS_RECORD_FORMAT,
  adoptAnnotationFile,
  annotationChunkEnd,
  annotationFileToken,
  assembleAnnotationFile,
  checkAnnotationsHead,
  currentAnnotationFile,
  estimateAnnotationBytes,
  isAnnotationsMarker,
  newAnnotationsOwner,
  shareAnnotationFileToken,
} from '@/persistence/annotationPersistence';
import type { AnnotationsHead } from '@/persistence/annotationPersistence';

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
  const { annotations: _annotations, ...fields } = fileOf(2);
  const head = (overrides: Record<string, unknown> = {}) => ({
    format: ANNOTATIONS_RECORD_FORMAT,
    owner: 'o1',
    count: 2,
    chunks: 1,
    file: fields,
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

  it('attaches the head written with the session record', () => {
    const value = head();
    expect(checkAnnotationsHead(marker, value)).toEqual({ ok: true, head: value });
    const empty = head({ count: 0, chunks: 0 });
    expect(checkAnnotationsHead({ ...marker, count: 0 }, empty)).toEqual({ ok: true, head: empty });
  });

  it('tells a missing head, another save’s, and a malformed one apart', () => {
    expect(checkAnnotationsHead(marker, undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(checkAnnotationsHead(marker, head({ owner: 'o2' }))).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    for (const bad of [
      'a string',
      [head()],
      head({ format: 2 }),
      head({ owner: 7 }),
      head({ count: 3 }),
      head({ count: -1 }),
      head({ chunks: 1.5 }),
      head({ chunks: 0 }),
      head({ chunks: 3 }),
      head({ file: null }),
      head({ file: [] }),
      head({ file: { tableName: 't' } }),
    ]) {
      expect(checkAnnotationsHead(marker, bad), JSON.stringify(bad)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
  });

  it('reassembles the file from its chunks, in order', () => {
    const file = fileOf(5);
    const value = head({ count: 5, chunks: 3 }) as unknown as AnnotationsHead;
    const chunks = [
      file.annotations.slice(0, 2),
      file.annotations.slice(2, 4),
      file.annotations.slice(4),
    ];
    const assembled = assembleAnnotationFile(value, chunks);
    expect(assembled).toEqual({ ...fields, annotations: file.annotations });
    expect(assembled?.annotations[3]).toBe(file.annotations[3]);
  });

  it('assembles nothing from chunks that disagree with the head', () => {
    const file = fileOf(5);
    const value = head({ count: 5, chunks: 2 }) as unknown as AnnotationsHead;
    const [first, rest] = [file.annotations.slice(0, 2), file.annotations.slice(2)];
    expect(assembleAnnotationFile(value, [first])).toBeNull();
    expect(assembleAnnotationFile(value, [first, rest, rest])).toBeNull();
    expect(assembleAnnotationFile(value, [first, rest.slice(1)])).toBeNull();
    expect(assembleAnnotationFile(value, [first, []])).toBeNull();
    expect(assembleAnnotationFile(value, [first, { length: 3 }])).toBeNull();
  });
});

describe('annotation chunks', () => {
  const annotation = (message: string, metadata?: unknown) => ({
    id: 'ann_0',
    scope: 'row',
    rowId: 0,
    severity: 'info',
    message,
    ...(metadata === undefined ? {} : { metadata }),
  });

  it('estimates two bytes to a character, and more than a clone takes', () => {
    const short = estimateAnnotationBytes(annotation('m'));
    const long = estimateAnnotationBytes(annotation('m'.repeat(1001)));
    expect(long - short).toBe(2_000);
    const value = annotation('Value violates rule 7', { rule: 'max', path: ['a', 'b', 3] });
    expect(estimateAnnotationBytes(value)).toBeGreaterThan(structuredCloneSize(value));
  });

  it('counts metadata, binary data, maps and sets', () => {
    const base = estimateAnnotationBytes(annotation('m', {}));
    expect(
      estimateAnnotationBytes(annotation('m', { data: new Uint8Array(5000) })),
    ).toBeGreaterThan(base + 5000);
    expect(
      estimateAnnotationBytes(annotation('m', { data: new ArrayBuffer(5000) })),
    ).toBeGreaterThan(base + 5000);
    expect(
      estimateAnnotationBytes(annotation('m', { map: new Map([['k', 'v'.repeat(500)]]) })),
    ).toBeGreaterThan(base + 1000);
    expect(
      estimateAnnotationBytes(annotation('m', { set: new Set(['v'.repeat(500)]) })),
    ).toBeGreaterThan(base + 1000);
  });

  it('counts a value of too many parts, a cycle among them, as a chunk of its own', () => {
    const cycle: Record<string, unknown> = { name: 'loop' };
    cycle['self'] = cycle;
    cycle['again'] = cycle;
    expect(estimateAnnotationBytes(annotation('m', cycle))).toBe(ANNOTATION_CHUNK_MAX_BYTES);
    const wide = Array.from({ length: 5000 }, (_, i) => i);
    expect(estimateAnnotationBytes(annotation('m', wide))).toBe(ANNOTATION_CHUNK_MAX_BYTES);
  });

  it('ends a chunk at the count, at the bytes, or at the end', () => {
    const plain = Array.from({ length: 25_000 }, () => annotation('m'));
    expect(annotationChunkEnd(plain, 0)).toBe(ANNOTATION_CHUNK_MAX_COUNT);
    expect(annotationChunkEnd(plain, 20_000)).toBe(25_000);
    expect(annotationChunkEnd(plain, 24_999)).toBe(25_000);

    const heavy = Array.from({ length: 100 }, () => annotation('m'.repeat(1024 * 1024)));
    // Over two megabytes each, as estimated: three fit in eight.
    expect(annotationChunkEnd(heavy, 0)).toBe(3);
    expect(annotationChunkEnd(heavy, 99)).toBe(100);
  });

  it('puts an annotation past the bytes in a chunk of its own', () => {
    const huge = [annotation('m'.repeat(5 * 1024 * 1024)), annotation('m'), annotation('m')];
    expect(annotationChunkEnd(huge, 0)).toBe(1);
    expect(annotationChunkEnd(huge, 1)).toBe(3);
  });
});

/** The bytes V8's serializer, which structured clone uses, writes for `value`. */
function structuredCloneSize(value: unknown): number {
  return serialize(value).length;
}
