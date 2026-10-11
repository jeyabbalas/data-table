/**
 * The annotations a save hands the session store: a token per content of
 * the store, so the store can tell unchanged ones without taking their file,
 * a file taken only when read and held by nothing here, and the marker and
 * head that name a record.
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
  annotationsToken,
  assembleAnnotationFile,
  estimateAnnotationBytes,
  headEntries,
  holdBackSnapshotAnnotations,
  newAnnotationsOwner,
  readAnnotationsHead,
  readAnnotationsMarker,
  setSnapshotAnnotations,
  settleSnapshotAnnotations,
  shareAnnotationFileToken,
  snapshotAnnotationsOf,
} from '@/persistence/annotationPersistence';
import type { AnnotationsHead } from '@/persistence/annotationPersistence';
import type { SessionSnapshot } from '@/persistence/types';

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

function snapshotOf(store: AnnotationStore, lazy = true): SessionSnapshot {
  const snapshot = {
    version: 6,
    timestamp: 0,
    tableName: 't',
    filters: [],
    sortColumns: [],
    visibleColumns: [],
    columnOrder: [],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
  } as unknown as SessionSnapshot;
  setSnapshotAnnotations(snapshot, store, lazy);
  return snapshot;
}

/** The token a session store compares for `snapshot`'s annotations, or its kind. */
function tokenOf(snapshot: SessionSnapshot): number | string {
  const annotations = snapshotAnnotationsOf(snapshot);
  return annotations.kind === 'file' ? annotations.token : annotations.kind;
}

describe('annotationsToken', () => {
  it('is null for an empty store', () => {
    const { store } = makeStore();
    expect(annotationsToken(store)).toBeNull();
  });

  it('is the same until the content changes, and takes no file', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const toJSON = vi.spyOn(store, 'toJSON');
    const token = annotationsToken(store);
    for (let i = 0; i < 10; i++) expect(annotationsToken(store)).toBe(token);
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('changes with every kind of content change', () => {
    const { store } = makeStore();
    const a = store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const seen = new Set([annotationsToken(store)]);
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
      const token = annotationsToken(store);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
    store.clear('all');
    expect(annotationsToken(store)).toBeNull();
  });

  it('stays across severity-filter changes', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const token = annotationsToken(store);
    store.setSeverityFilter({ error: false });
    store.setSeverityFilter({ warning: false, error: true });
    expect(annotationsToken(store)).toBe(token);
  });

  it('changes when the table name the store resolves changes', () => {
    const { store, name } = makeStore('t1');
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const first = annotationsToken(store);
    name.set('t2');
    expect(annotationsToken(store)).not.toBe(first);
  });

  it('is per store', () => {
    const one = makeStore('a').store;
    const two = makeStore('b').store;
    one.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    two.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    expect(annotationsToken(one)).not.toBe(annotationsToken(two));
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

  it('change when the file’s annotations array is replaced or changes length', () => {
    const a = fileOf(2);
    const token = annotationFileToken(a);
    a.annotations.push({ id: 'x', scope: 'row', rowId: 9, severity: 'info', message: 'x' });
    const pushed = annotationFileToken(a);
    expect(pushed).not.toBe(token);
    a.annotations = [...a.annotations];
    expect(annotationFileToken(a)).not.toBe(pushed);
  });

  it('stay through an edit in place that keeps the array and its length', () => {
    const a = fileOf(2);
    const token = annotationFileToken(a);
    a.annotations[0] = { ...a.annotations[0]!, message: 'edited' };
    expect(annotationFileToken(a)).toBe(token);
  });
});

describe('snapshot annotations', () => {
  it('take the file now, under the content’s token, unless lazy', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const eager = snapshotOf(store, false);
    expect(Object.getOwnPropertyDescriptor(eager, 'annotations')?.value).toBeDefined();
    expect(annotationFileToken(eager.annotations!)).toBe(annotationsToken(store));
    expect(tokenOf(eager)).toBe(annotationsToken(store));
  });

  it('take no file when lazy until read, and then under the content’s token', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const toJSON = vi.spyOn(store, 'toJSON');
    const snapshot = snapshotOf(store);
    expect(tokenOf(snapshot)).toBe(annotationsToken(store));
    expect(toJSON).not.toHaveBeenCalled();
    const file = snapshot.annotations!;
    expect(toJSON).toHaveBeenCalledTimes(1);
    expect(file.annotations).toHaveLength(1);
    expect(annotationFileToken(file)).toBe(annotationsToken(store));
    // Read once: a data property from then on.
    expect(snapshot.annotations).toBe(file);
    expect(JSON.parse(JSON.stringify(snapshot)).annotations.annotations).toHaveLength(1);
    expect(toJSON).toHaveBeenCalledTimes(1);
  });

  it('are none for an empty store, and held back when asked', () => {
    const { store } = makeStore();
    expect(tokenOf(snapshotOf(store))).toBe('none');
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const held = snapshotOf(store);
    delete held.annotations;
    holdBackSnapshotAnnotations(held);
    expect(tokenOf(held)).toBe('held');
  });

  it('are gone, and held back, when read after the content changed', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const snapshot = snapshotOf(store);
    store.add({ scope: 'row', rowId: 2, severity: 'error', message: 'b' });
    expect(snapshot.annotations).toBeUndefined();
    expect(tokenOf(snapshot)).toBe('held');
  });

  it('carry the table name of their content, though the store resolves another since', () => {
    const { store, name } = makeStore('t1');
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const snapshot = snapshotOf(store);
    // As a load resets the table name before it empties the store.
    name.set(null);
    expect(snapshot.annotations?.tableName).toBe('t1');
    const unnamed = makeStore(null).store;
    unnamed.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const other = snapshotOf(unnamed);
    expect(other.annotations).not.toHaveProperty('tableName');
  });

  it('are settled before a store is emptied, one file per content', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const first = snapshotOf(store);
    const second = snapshotOf(store);
    const toJSON = vi.spyOn(store, 'toJSON');
    settleSnapshotAnnotations([first, second]);
    expect(toJSON).toHaveBeenCalledTimes(1);
    store.clear('all');
    expect(first.annotations?.annotations).toHaveLength(1);
    expect(second.annotations).toBe(first.annotations);
  });

  it('take the value assigned to them, as a file of their own', () => {
    const { store } = makeStore();
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const snapshot = snapshotOf(store);
    const file = fileOf(2);
    snapshot.annotations = file;
    expect(snapshot.annotations).toBe(file);
    expect(tokenOf(snapshot)).toBe(annotationFileToken(file));
  });
});

describe('adoptAnnotationFile', () => {
  it('gives the store’s content the token of the file it was loaded from', () => {
    const { store } = makeStore();
    const file = fileOf(3);
    store.loadJSON(file, 'replace');
    adoptAnnotationFile(store, file);
    expect(annotationsToken(store)).toBe(annotationFileToken(file));
    const taken = snapshotOf(store).annotations!;
    expect(taken).not.toBe(file);
    expect(annotationFileToken(taken)).toBe(annotationFileToken(file));
  });

  it('does not keep the file it adopts', () => {
    const { store } = makeStore();
    const file = fileOf(2);
    store.loadJSON(file, 'replace');
    adoptAnnotationFile(store, file);
    // A file taken since holds the store's own annotations, not the file's.
    const taken = snapshotOf(store).annotations!;
    expect(taken.annotations[0]).not.toBe(file.annotations[0]);
    expect(taken.annotations[0]).toBe(store.get('f0'));
  });

  it('adopts nothing when the store holds fewer annotations than the file', () => {
    const { store } = makeStore();
    const file = fileOf(3);
    file.annotations.push({ ...file.annotations[0]! });
    store.loadJSON(file, { mode: 'replace', duplicates: 'skip' });
    adoptAnnotationFile(store, file);
    expect(annotationsToken(store)).not.toBe(annotationFileToken(file));
  });

  it('adopts nothing for a file of another table or an older file version', () => {
    const other = makeStore('t').store;
    const otherFile = fileOf(1, 'elsewhere');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    other.loadJSON(otherFile, 'replace');
    adoptAnnotationFile(other, otherFile);
    expect(annotationsToken(other)).not.toBe(annotationFileToken(otherFile));

    const older = makeStore('t').store;
    const olderFile = { ...fileOf(1), version: 0 };
    older.loadJSON(olderFile, 'replace');
    adoptAnnotationFile(older, olderFile);
    expect(annotationsToken(older)).not.toBe(annotationFileToken(olderFile));
    vi.restoreAllMocks();
  });

  it('does nothing for an empty file', () => {
    const { store } = makeStore();
    const file = fileOf(0);
    store.loadJSON(file, 'replace');
    expect(() => adoptAnnotationFile(store, file)).not.toThrow();
    expect(annotationsToken(store)).toBeNull();
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
    expect(readAnnotationsMarker(marker)).toEqual(marker);
    for (const bad of [
      { ...marker, format: 2 },
      { ...marker, count: -1 },
      { ...marker, count: 1.5 },
      { ...marker, owner: '' },
      { format: 1, count: 2 },
      null,
      [marker],
    ]) {
      expect(readAnnotationsMarker(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('reads a marker’s fallback, and leaves out one it cannot read', () => {
    const fallback = { owner: 'o0', count: 1 };
    expect(readAnnotationsMarker({ ...marker, fallback })).toEqual({ ...marker, fallback });
    for (const bad of [{ owner: 'o0' }, { owner: '', count: 1 }, 'o0', { owner: 'o1', count: 2 }]) {
      expect(readAnnotationsMarker({ ...marker, fallback: bad }), JSON.stringify(bad)).toEqual(
        marker,
      );
    }
  });

  it('reads a head of this format, with the records it kept', () => {
    const kept = { owner: 'o0', count: 1, chunks: 1, file: fields };
    const value = head({ previous: [kept] });
    const read = readAnnotationsHead(value)!;
    expect(read).toEqual(value);
    expect(headEntries(read).map((entry) => entry.owner)).toEqual(['o1', 'o0']);
    const empty = head({ count: 0, chunks: 0 });
    expect(readAnnotationsHead(empty)).toEqual(empty);
  });

  it('leaves out a kept record it cannot read, or one that is the head’s own', () => {
    const kept = { owner: 'o0', count: 1, chunks: 1, file: fields };
    const read = readAnnotationsHead(
      head({ previous: [kept, { owner: 'o2', count: 1 }, head(), 'x'] }),
    );
    expect(read?.previous).toEqual([kept]);
    expect(readAnnotationsHead(head({ previous: [{ owner: 'o2' }] }))).not.toHaveProperty(
      'previous',
    );
  });

  it('reads no malformed head, nor one of another format', () => {
    for (const bad of [
      undefined,
      'a string',
      [head()],
      head({ format: 2 }),
      head({ owner: 7 }),
      head({ count: -1 }),
      head({ chunks: 1.5 }),
      head({ chunks: 0 }),
      head({ chunks: 3 }),
      head({ file: null }),
      head({ file: [] }),
      head({ file: { tableName: 't' } }),
    ]) {
      expect(readAnnotationsHead(bad), JSON.stringify(bad)).toBeNull();
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
