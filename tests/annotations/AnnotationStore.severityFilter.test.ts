import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationChangePayload } from '@/annotations/types';

function makeStore(): AnnotationStore {
  let seq = 0;
  return new AnnotationStore({
    idGenerator: () => `ann_test_${++seq}`,
    now: () => '2026-04-24T00:00:00.000Z',
  });
}

describe('AnnotationStore — severity filter', () => {
  let store: AnnotationStore;
  let events: AnnotationChangePayload[];

  beforeEach(() => {
    store = makeStore();
    events = [];
    store.on('change', (e) => events.push(e));
  });

  it('defaults to all three severities enabled', () => {
    expect(store.getSeverityFilter()).toEqual({ error: true, warning: true, info: true });
  });

  it('returns a fresh copy from getSeverityFilter (no internal aliasing)', () => {
    const a = store.getSeverityFilter();
    a.error = false;
    expect(store.getSeverityFilter()).toEqual({ error: true, warning: true, info: true });
  });

  it('emits exactly one filterChanged event when a flag actually flips', () => {
    store.setSeverityFilter({ error: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'filterChanged', ids: [] });
    expect(store.getSeverityFilter()).toEqual({ error: false, warning: true, info: true });
  });

  it('emits one event per setSeverityFilter call when flags change in a batch', () => {
    store.setSeverityFilter({ error: false, info: false });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('filterChanged');
    expect(store.getSeverityFilter()).toEqual({ error: false, warning: true, info: false });
  });

  it('does not emit when the patch is a no-op', () => {
    store.setSeverityFilter({ error: true, warning: true, info: true });
    expect(events).toHaveLength(0);
    store.setSeverityFilter({});
    expect(events).toHaveLength(0);
  });

  it('does not emit when none of the patched flags actually change', () => {
    store.setSeverityFilter({ error: false });
    events.length = 0;
    store.setSeverityFilter({ error: false, warning: true });
    expect(events).toHaveLength(0);
  });

  it('ignores non-boolean values silently', () => {
    store.setSeverityFilter({ error: undefined, warning: false });
    expect(events).toHaveLength(1);
    expect(store.getSeverityFilter()).toEqual({ error: true, warning: false, info: true });
  });

  it('does not modify any annotations when filter changes', () => {
    const a = store.add({ scope: 'cell', rowId: 1, column: 'c', severity: 'error', message: 'm' });
    events.length = 0;
    store.setSeverityFilter({ error: false });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('filterChanged');
    expect(store.getAll()).toEqual([a]);
  });

  it('destroy() silences subsequent filter changes', () => {
    store.destroy();
    events.length = 0;
    store.setSeverityFilter({ error: false });
    expect(events).toHaveLength(0);
    expect(store.getSeverityFilter()).toEqual({ error: false, warning: true, info: true });
  });
});
