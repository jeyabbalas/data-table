import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationChangePayload } from '@/annotations/types';

function makeStore(): AnnotationStore {
  let seq = 0;
  return new AnnotationStore({
    idGenerator: () => `ann_test_${++seq}`,
    now: () => '2026-04-24T00:00:00.000Z',
  });
}

describe('AnnotationStore — events', () => {
  let store: AnnotationStore;
  let events: AnnotationChangePayload[];

  beforeEach(() => {
    store = makeStore();
    events = [];
    store.on('change', (e) => events.push(e));
  });

  it('fires exactly one `added` event per add', () => {
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('added');
    expect(events[0].ids).toHaveLength(1);
  });

  it('fires exactly one `added` event for an entire addMany batch', () => {
    store.addMany([
      { scope: 'row', rowId: 0, severity: 'info', message: 'a' },
      { scope: 'row', rowId: 1, severity: 'info', message: 'b' },
      { scope: 'row', rowId: 2, severity: 'info', message: 'c' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('added');
    expect(events[0].ids).toHaveLength(3);
  });

  it('does not fire any event when addMany aborts', () => {
    store.add({ id: 'dup', scope: 'row', rowId: 0, severity: 'info', message: 's' });
    events.length = 0;
    expect(() =>
      store.addMany([
        { scope: 'row', rowId: 1, severity: 'info', message: 'a' },
        { id: 'dup', scope: 'row', rowId: 2, severity: 'info', message: 'b' },
      ]),
    ).toThrow();
    expect(events).toHaveLength(0);
  });

  it('fires one `updated` event per update', () => {
    const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    events.length = 0;
    store.update(a.id, { severity: 'error' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'updated', ids: [a.id] });
  });

  it('fires one `removed` event per remove / removeMany', () => {
    const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    events.length = 0;
    store.remove(a.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'removed', ids: [a.id] });
    events.length = 0;
    store.removeMany([b.id, 'nope']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'removed', ids: [b.id] });
  });

  it('fires one `cleared` event per clear with the full removed-id list', () => {
    const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    events.length = 0;
    store.clear();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('cleared');
    expect(events[0].ids.sort()).toEqual([a.id, b.id].sort());
  });

  it('unsubscribes correctly', () => {
    const calls: AnnotationChangePayload[] = [];
    const off = store.on('change', (e) => calls.push(e));
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    expect(calls).toHaveLength(1);
    off();
    store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    expect(calls).toHaveLength(1);
  });

  it('continues firing other handlers if one throws', () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn().mockImplementation(() => {
      throw new Error('handler boom');
    });
    const spy3 = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.on('change', spy1);
    store.on('change', spy2);
    store.on('change', spy3);
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy3).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('destroy() silences subsequent mutations', () => {
    store.destroy();
    events.length = 0;
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    expect(events).toHaveLength(0);
  });

  it('rejects unknown event names', () => {
    expect(() =>
      // @ts-expect-error — runtime guard
      store.on('bogus', () => {}),
    ).toThrow();
  });
});

describe('AnnotationStore — event payloads', () => {
  let store: AnnotationStore;
  let events: AnnotationChangePayload[];

  beforeEach(() => {
    store = makeStore();
    events = [];
    store.on('change', (e) => events.push(e));
  });

  it('carries the added annotations, as stored, in an array of its own', () => {
    const added = store.addMany([
      { scope: 'row', rowId: 0, severity: 'info', message: 'a' },
      { scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'b' },
    ]);
    expect(events).toEqual([{ kind: 'added', ids: added.map((a) => a.id), annotations: added }]);
    expect(events[0]!.annotations![1]).toBe(store.get(added[1]!.id));
    expect(events[0]!.annotations).not.toBe(added);
  });

  it('carries the updated annotation and the one it replaced', () => {
    const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    events.length = 0;
    const updated = store.update(a.id, { severity: 'error' });
    expect(events).toEqual([
      { kind: 'updated', ids: [a.id], annotations: [updated], previous: [a] },
    ]);
    expect(events[0]!.annotations![0]).toBe(store.get(a.id));
    expect(events[0]!.previous![0]).toBe(a);
  });

  it('carries removed and cleared annotations as they were, in order', () => {
    const [a, b, c, d] = store.addMany([
      { scope: 'row', rowId: 0, severity: 'info', message: 'a' },
      { scope: 'cell', rowId: 0, column: 'x', severity: 'info', message: 'b' },
      { scope: 'row', rowId: 1, severity: 'info', message: 'c' },
      { scope: 'row', rowId: 2, severity: 'info', message: 'd' },
    ]);
    const updatedD = store.update(d!.id, { message: 'd2' });
    events.length = 0;
    store.removeMany([c!.id, a!.id, 'nope']);
    expect(events).toEqual([{ kind: 'removed', ids: [c!.id, a!.id], annotations: [c, a] }]);
    events.length = 0;
    const [e] = store.addMany([{ scope: 'row', rowId: 3, severity: 'info', message: 'e' }]);
    events.length = 0;
    // Insertion order, whichever way `clear(scope)` walks.
    store.clear('row');
    expect(events).toEqual([{ kind: 'cleared', ids: [d!.id, e!.id], annotations: [updatedD, e] }]);
    events.length = 0;
    store.clear('all');
    expect(events).toEqual([{ kind: 'cleared', ids: [b!.id], annotations: [b] }]);
  });

  it('keeps filterChanged to its kind and an empty id list', () => {
    store.setSeverityFilter({ warning: false });
    expect(events).toStrictEqual([{ kind: 'filterChanged', ids: [] }]);
  });

  it("loadJSON('replace') fires cleared for what was there, then added for the file", () => {
    const prior = store.addMany([
      { scope: 'row', rowId: 0, severity: 'info', message: 'old 1' },
      { scope: 'column', column: 'x', severity: 'info', message: 'old 2' },
    ]);
    events.length = 0;
    let seenDuringCleared: string[] = [];
    store.on('change', (e) => {
      if (e.kind === 'cleared') seenDuringCleared = store.getAll().map((a) => a.id);
    });
    store.loadJSON({
      version: 1,
      annotations: [{ id: 'f1', scope: 'row', rowId: 4, severity: 'error', message: 'new' }],
    });
    expect(events.map((e) => e.kind)).toEqual(['cleared', 'added']);
    expect(events[0]).toEqual({
      kind: 'cleared',
      ids: prior.map((a) => a.id),
      annotations: prior,
    });
    expect(events[1]).toEqual({ kind: 'added', ids: ['f1'], annotations: [store.get('f1')] });
    // Events fire after the change: handlers already see the file's contents.
    expect(seenDuringCleared).toEqual(['f1']);
  });

  it("loadJSON('replace') fires only what applies: added onto an empty store, cleared for an empty file", () => {
    store.loadJSON({
      version: 1,
      annotations: [{ id: 'f1', scope: 'row', rowId: 4, severity: 'error', message: 'new' }],
    });
    expect(events.map((e) => e.kind)).toEqual(['added']);
    events.length = 0;
    store.loadJSON({ version: 1, annotations: [] });
    expect(events.map((e) => e.kind)).toEqual(['cleared']);
    events.length = 0;
    store.loadJSON({ version: 1, annotations: [] });
    expect(events).toEqual([]);
  });
});
