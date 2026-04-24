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
    expect(events[0]).toEqual({ kind: 'updated', ids: [a.id] });
  });

  it('fires one `removed` event per remove / removeMany', () => {
    const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    events.length = 0;
    store.remove(a.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'removed', ids: [a.id] });
    events.length = 0;
    store.removeMany([b.id, 'nope']);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'removed', ids: [b.id] });
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
    const spy2 = vi.fn().mockImplementation(() => { throw new Error('handler boom'); });
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
