/**
 * FilterPresetManager — unit tests for CRUD, export/import, signal reactivity,
 * and validation of imported filter data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterPresetManager } from '@/filters/FilterPresets';
import type { Filter, RawSQLFilter } from '@/filters/FilterTypes';
import type { StateActions } from '@/core/Actions';

// --- Helpers ---

function rangeFilter(column = 'price', min = 0, max = 100): Filter {
  return { type: 'range', column, min, max };
}

function rawSQLFilter(sql = 'age > 30', id = 'test-id'): RawSQLFilter {
  return { type: 'raw-sql', column: `__raw_sql_${id}__`, sql, id, label: 'Test' };
}

function mockActions(): StateActions {
  return {
    loadFilterPreset: vi.fn(),
  } as unknown as StateActions;
}

// --- Tests ---

describe('FilterPresetManager', () => {
  let manager: FilterPresetManager;

  beforeEach(() => {
    manager = new FilterPresetManager();
  });

  // ==========================================
  // save()
  // ==========================================

  describe('save()', () => {
    it('creates a preset with correct fields', () => {
      const filters: Filter[] = [rangeFilter()];
      const preset = manager.save('My Preset', filters);

      expect(preset.id).toBeDefined();
      expect(preset.name).toBe('My Preset');
      expect(preset.filters).toHaveLength(1);
      expect(preset.filters[0]).toHaveProperty('type', 'range');
      expect(preset.createdAt).toBeGreaterThan(0);
      expect(preset.updatedAt).toBe(preset.createdAt);
    });

    it('trims whitespace from name', () => {
      const preset = manager.save('  spaced  ', [rangeFilter()]);
      expect(preset.name).toBe('spaced');
    });

    it('throws on empty name', () => {
      expect(() => manager.save('', [rangeFilter()])).toThrow('Preset name is required');
      expect(() => manager.save('   ', [rangeFilter()])).toThrow('Preset name is required');
    });

    it('stores description when provided', () => {
      const preset = manager.save('P', [rangeFilter()], undefined, 'A description');
      expect(preset.description).toBe('A description');
    });

    it('omits description when empty', () => {
      const preset = manager.save('P', [rangeFilter()], undefined, '   ');
      expect(preset.description).toBeUndefined();
    });

    it('stores sort columns when provided', () => {
      const preset = manager.save('P', [rangeFilter()], [{ column: 'price', direction: 'asc' }]);
      expect(preset.sortColumns).toEqual([{ column: 'price', direction: 'asc' }]);
    });

    it('serializes RawSQLFilter correctly', () => {
      const filters: Filter[] = [rawSQLFilter()];
      const preset = manager.save('SQL preset', filters);
      expect(preset.filters[0]).toHaveProperty('type', 'raw-sql');
      expect((preset.filters[0] as RawSQLFilter).sql).toBe('age > 30');
    });

    it('adds preset to signal', () => {
      manager.save('P1', [rangeFilter()]);
      manager.save('P2', [rangeFilter()]);
      expect(manager.getPresets()).toHaveLength(2);
    });
  });

  // ==========================================
  // load()
  // ==========================================

  describe('load()', () => {
    it('calls actions.loadFilterPreset with deserialized filters', () => {
      const actions = mockActions();
      manager.save('P', [rangeFilter()]);
      const presets = manager.getPresets();

      manager.load(presets[0].id, actions);

      expect(actions.loadFilterPreset).toHaveBeenCalledTimes(1);
      const [filters, sortCols] = (actions.loadFilterPreset as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(filters).toHaveLength(1);
      expect(filters[0].type).toBe('range');
      expect(sortCols).toBeUndefined();
    });

    it('passes sort columns when present', () => {
      const actions = mockActions();
      manager.save('P', [rangeFilter()], [{ column: 'price', direction: 'desc' }]);
      const presets = manager.getPresets();

      manager.load(presets[0].id, actions);

      const sortCols = (actions.loadFilterPreset as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(sortCols).toEqual([{ column: 'price', direction: 'desc' }]);
    });

    it('no-ops for unknown id', () => {
      const actions = mockActions();
      manager.load('nonexistent', actions);
      expect(actions.loadFilterPreset).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // delete() / rename() / update()
  // ==========================================

  describe('delete()', () => {
    it('removes preset by id', () => {
      manager.save('P1', [rangeFilter()]);
      manager.save('P2', [rangeFilter()]);
      const id = manager.getPresets()[0].id;

      manager.delete(id);

      expect(manager.getPresets()).toHaveLength(1);
      expect(manager.getPresets()[0].name).toBe('P2');
    });

    it('no-ops for unknown id', () => {
      manager.save('P1', [rangeFilter()]);
      manager.delete('nonexistent');
      expect(manager.getPresets()).toHaveLength(1);
    });
  });

  describe('rename()', () => {
    it('updates name and updatedAt', () => {
      manager.save('Old', [rangeFilter()]);
      const id = manager.getPresets()[0].id;
      const before = manager.getPresets()[0].updatedAt;

      manager.rename(id, 'New Name');

      const preset = manager.getPresets()[0];
      expect(preset.name).toBe('New Name');
      expect(preset.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('trims whitespace', () => {
      manager.save('Old', [rangeFilter()]);
      manager.rename(manager.getPresets()[0].id, '  Trimmed  ');
      expect(manager.getPresets()[0].name).toBe('Trimmed');
    });

    it('no-ops on empty name', () => {
      manager.save('Original', [rangeFilter()]);
      manager.rename(manager.getPresets()[0].id, '   ');
      expect(manager.getPresets()[0].name).toBe('Original');
    });
  });

  describe('update()', () => {
    it('replaces filters and updates timestamp', () => {
      manager.save('P', [rangeFilter()]);
      const id = manager.getPresets()[0].id;

      const newFilters: Filter[] = [rangeFilter('age', 18, 99), rawSQLFilter()];
      manager.update(id, newFilters);

      const preset = manager.getPresets()[0];
      expect(preset.filters).toHaveLength(2);
      expect(preset.filters[1]).toHaveProperty('type', 'raw-sql');
    });
  });

  // ==========================================
  // exportToJSON() / importFromJSON()
  // ==========================================

  describe('exportToJSON()', () => {
    it('returns valid JSON with version field', () => {
      manager.save('P1', [rangeFilter()]);
      const json = manager.exportToJSON();
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe(1);
      expect(parsed.presets).toHaveLength(1);
      expect(parsed.presets[0].name).toBe('P1');
    });

    it('round-trips with importFromJSON', () => {
      manager.save('P1', [rangeFilter(), rawSQLFilter()]);
      manager.save('P2', [rangeFilter('age', 0, 50)]);
      const json = manager.exportToJSON();

      const manager2 = new FilterPresetManager();
      const result = manager2.importFromJSON(json);

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(manager2.getPresets()).toHaveLength(2);
      // IDs should be new
      expect(manager2.getPresets()[0].id).not.toBe(manager.getPresets()[0].id);
    });
  });

  describe('importFromJSON()', () => {
    it('handles invalid JSON', () => {
      const result = manager.importFromJSON('not json');
      expect(result.imported).toBe(0);
      expect(result.errors).toContain('Invalid JSON');
    });

    it('rejects non-object', () => {
      const result = manager.importFromJSON('"string"');
      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('Expected a JSON object');
    });

    it('rejects missing version', () => {
      const result = manager.importFromJSON('{"presets":[]}');
      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('version');
    });

    it('rejects missing presets array', () => {
      const result = manager.importFromJSON('{"version":1}');
      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('presets');
    });

    it('reports error for preset with missing name', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{ filters: [] }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('missing or empty name');
    });

    it('reports error for preset with missing filters', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{ name: 'P1' }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors[0]).toContain('missing filters array');
    });

    it('assigns new UUIDs to imported presets', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          id: 'old-id',
          name: 'P',
          filters: [{ type: 'range', column: 'x', min: 0, max: 10 }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(manager.getPresets()[0].id).not.toBe('old-id');
    });

    it('validates individual filters — rejects unknown types', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [
            { type: 'range', column: 'x', min: 0, max: 10 },
            { type: 'unknown-type', column: 'y' },
            { type: 'set', column: 'z', values: [1, 2] },
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('skipped 1 invalid filter(s)');
      // Only 2 valid filters kept
      expect(manager.getPresets()[0].filters).toHaveLength(2);
    });

    it('validates individual filters — rejects missing column', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [
            { type: 'range' }, // missing column
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
      expect(result.errors.some(e => e.includes('no valid filters'))).toBe(true);
    });

    it('validates raw-sql filters require sql and id fields', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [
            { type: 'raw-sql', column: '__raw_sql_a__' }, // missing sql and id
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('rejects non-object filters', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [42, null, 'string'],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('3 invalid filter'))).toBe(true);
    });

    it('appends to existing presets', () => {
      manager.save('Existing', [rangeFilter()]);
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'Imported',
          filters: [{ type: 'range', column: 'x', min: 0, max: 10 }],
        }],
      });

      manager.importFromJSON(json);
      expect(manager.getPresets()).toHaveLength(2);
    });

    // --- Type-specific field validation ---

    it('rejects range filter missing min/max', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'range', column: 'x' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('rejects range filter missing only max', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [
            { type: 'range', column: 'x', min: 0 },
            { type: 'null', column: 'y' },
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(result.errors.some(e => e.includes('skipped 1 invalid filter'))).toBe(true);
      expect(manager.getPresets()[0].filters).toHaveLength(1);
    });

    it('rejects set filter without values array', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'set', column: 'x', values: 'not-array' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('rejects not-set filter without values array', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'not-set', column: 'x' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('rejects pattern filter missing mode', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'pattern', column: 'x', pattern: 'test' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('rejects pattern filter with invalid mode', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'pattern', column: 'x', pattern: 'test', mode: 'invalid' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(0);
      expect(result.errors.some(e => e.includes('invalid filter'))).toBe(true);
    });

    it('accepts valid filters of all types', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [
            { type: 'range', column: 'a', min: 0, max: 10 },
            { type: 'point', column: 'b', value: 'x' },
            { type: 'set', column: 'c', values: [1, 2] },
            { type: 'not-set', column: 'd', values: [3] },
            { type: 'null', column: 'e' },
            { type: 'not-null', column: 'f' },
            { type: 'pattern', column: 'g', pattern: 'test', mode: 'contains' },
            { type: 'raw-sql', column: '__raw_sql_x__', sql: 'a > 1', id: 'x' },
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(manager.getPresets()[0].filters).toHaveLength(8);
    });

    // --- sortColumns validation ---

    it('rejects sortColumns with non-string column', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'null', column: 'x' }],
          sortColumns: [{ column: 123, direction: 'asc' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(manager.getPresets()[0].sortColumns).toBeUndefined();
    });

    it('rejects sortColumns with invalid direction', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'null', column: 'x' }],
          sortColumns: [{ column: 'x', direction: 'up' }],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(manager.getPresets()[0].sortColumns).toBeUndefined();
    });

    it('keeps valid sortColumns and rejects invalid ones', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'null', column: 'x' }],
          sortColumns: [
            { column: 'a', direction: 'asc' },
            { column: 123, direction: 'desc' },
            { column: 'b', direction: 'desc' },
          ],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(manager.getPresets()[0].sortColumns).toEqual([
        { column: 'a', direction: 'asc' },
        { column: 'b', direction: 'desc' },
      ]);
    });

    it('converts all-invalid sortColumns to undefined', () => {
      const json = JSON.stringify({
        version: 1,
        presets: [{
          name: 'P',
          filters: [{ type: 'null', column: 'x' }],
          sortColumns: [null, 42, 'string'],
        }],
      });
      const result = manager.importFromJSON(json);
      expect(result.imported).toBe(1);
      expect(manager.getPresets()[0].sortColumns).toBeUndefined();
    });
  });

  // ==========================================
  // loadPresets()
  // ==========================================

  describe('loadPresets()', () => {
    it('replaces all presets', () => {
      manager.save('P1', [rangeFilter()]);
      manager.save('P2', [rangeFilter()]);

      manager.loadPresets([{
        id: 'new-1',
        name: 'Restored',
        filters: [],
        createdAt: 1000,
        updatedAt: 1000,
      }]);

      expect(manager.getPresets()).toHaveLength(1);
      expect(manager.getPresets()[0].name).toBe('Restored');
    });

    it('creates shallow copies', () => {
      const original = {
        id: 'id-1',
        name: 'P',
        filters: [],
        createdAt: 1000,
        updatedAt: 1000,
      };
      manager.loadPresets([original]);
      // Mutation of original should not affect manager
      original.name = 'Mutated';
      expect(manager.getPresets()[0].name).toBe('P');
    });
  });

  // ==========================================
  // Signal reactivity
  // ==========================================

  describe('signal reactivity', () => {
    it('fires on save', () => {
      const listener = vi.fn();
      manager.presets.subscribe(listener);
      listener.mockClear(); // clear initial call from subscribe

      manager.save('P', [rangeFilter()]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on delete', () => {
      manager.save('P', [rangeFilter()]);
      const listener = vi.fn();
      manager.presets.subscribe(listener);
      listener.mockClear();

      manager.delete(manager.getPresets()[0].id);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('fires on importFromJSON', () => {
      const listener = vi.fn();
      manager.presets.subscribe(listener);
      listener.mockClear();

      const json = JSON.stringify({
        version: 1,
        presets: [{ name: 'P', filters: [{ type: 'null', column: 'x' }] }],
      });
      manager.importFromJSON(json);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
