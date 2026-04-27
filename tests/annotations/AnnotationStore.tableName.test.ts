import { describe, it, expect } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createSignal } from '@/core/Signal';

/**
 * Phase 7 — multi-table tagging round-trip lock.
 *
 * `AnnotationStoreOptions.tableName` accepts `Signal<string|null> | string |
 * null`. The Signal case lets the facade pass `state.baseTableName` so
 * `toJSON()` reflects loader-assigned table renames at serialisation time.
 * These tests lock the dynamic-Signal path that the existing JSON tests do
 * not exercise (they use literal strings).
 */

describe('AnnotationStore — tableName Signal binding', () => {
  it('captures a literal string at construction (static binding)', () => {
    const store = new AnnotationStore({ tableName: 'static_table' });
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    expect(store.toJSON().tableName).toBe('static_table');
  });

  it('omits tableName when null was passed', () => {
    const store = new AnnotationStore({ tableName: null });
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
    expect(store.toJSON().tableName).toBeUndefined();
  });

  it('reads a Signal at toJSON time, tracking dynamic renames', () => {
    const tableName = createSignal<string | null>('initial_name');
    const store = new AnnotationStore({ tableName });
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });

    expect(store.toJSON().tableName).toBe('initial_name');

    // Loader-assigned rename mid-session: the Signal is updated.
    tableName.set('renamed_after_load');
    expect(store.toJSON().tableName).toBe('renamed_after_load');
  });

  it('Signal that flips to null causes toJSON to omit the field', () => {
    const tableName = createSignal<string | null>('alpha');
    const store = new AnnotationStore({ tableName });
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });

    expect(store.toJSON().tableName).toBe('alpha');

    tableName.set(null);
    expect(store.toJSON().tableName).toBeUndefined();
  });

  it('round-trip: write file with tableName, load into nameless store, re-emit preserves nothing extra', () => {
    // Source store knows its name.
    const source = new AnnotationStore({ tableName: 'source_table' });
    source.add({ scope: 'row', rowId: 0, severity: 'info', message: 'm', id: 'x1' });
    const file = source.toJSON();
    expect(file.tableName).toBe('source_table');

    // Destination has no name. Load should succeed; the destination's toJSON
    // omits tableName (it's not the source's job to inject the name into the
    // destination's resolved identity).
    const dest = new AnnotationStore({ tableName: null });
    dest.loadJSON(file, 'replace');

    const reEmitted = dest.toJSON();
    expect(reEmitted.tableName).toBeUndefined();
    expect(reEmitted.annotations).toHaveLength(1);
    expect(reEmitted.annotations[0].id).toBe('x1');
  });

  it('round-trip into a Signal-backed destination uses the destination Signal at re-emit', () => {
    const source = new AnnotationStore({ tableName: 'source_table' });
    source.add({ scope: 'row', rowId: 0, severity: 'info', message: 'm', id: 'x1' });
    const file = source.toJSON();

    const destName = createSignal<string | null>('dest_initial');
    const dest = new AnnotationStore({ tableName: destName });
    dest.loadJSON(file, 'replace');

    expect(dest.toJSON().tableName).toBe('dest_initial');

    destName.set('dest_renamed');
    expect(dest.toJSON().tableName).toBe('dest_renamed');
  });
});
