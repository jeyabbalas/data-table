/**
 * FilterPresetManager — manages saved filter presets
 *
 * Provides CRUD operations for named filter presets, plus JSON export/import
 * for sharing presets across sessions or with downstream applications.
 */

import { createSignal } from '../core/Signal';
import type { Signal } from '../core/Signal';
import type { Filter } from './FilterTypes';
import type { SortColumn } from '../core/types';
import type { StateActions } from '../core/Actions';
import { serializeFilter, deserializeFilter } from '../persistence/SessionStore';
import type { SerializedFilter } from '../persistence/types';
import type { FilterPreset, FilterPresetCollection } from './FilterPresetTypes';

/** Known filter type discriminants for import validation */
const KNOWN_FILTER_TYPES = new Set([
  'range', 'point', 'set', 'not-set', 'null', 'not-null', 'pattern', 'raw-sql',
]);

export class FilterPresetManager {
  readonly presets: Signal<FilterPreset[]>;

  constructor() {
    this.presets = createSignal<FilterPreset[]>([]);
  }

  /**
   * Save current filters as a named preset.
   */
  save(
    name: string,
    filters: Filter[],
    sortColumns?: SortColumn[],
    description?: string
  ): FilterPreset {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Preset name is required');
    }

    const now = Date.now();
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name: trimmed,
      description: description?.trim() || undefined,
      filters: filters.map(serializeFilter),
      sortColumns: sortColumns ? sortColumns.map((s) => ({ ...s })) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    this.presets.set([...this.presets.get(), preset]);
    return preset;
  }

  /**
   * Load a preset by id: clears existing filters and applies the preset's
   * filters (and optionally sort state) in a single undo step.
   */
  load(id: string, actions: StateActions): void {
    const preset = this.presets.get().find((p) => p.id === id);
    if (!preset) return;

    const filters = preset.filters.map(deserializeFilter).filter((f): f is Filter => f !== null);
    actions.loadFilterPreset(filters, preset.sortColumns);
  }

  /**
   * Delete a preset by id.
   */
  delete(id: string): void {
    this.presets.set(this.presets.get().filter((p) => p.id !== id));
  }

  /**
   * Rename a preset.
   */
  rename(id: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) return;

    this.presets.set(
      this.presets.get().map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p
      )
    );
  }

  /**
   * Update a preset's filters with the current set.
   */
  update(id: string, filters: Filter[]): void {
    this.presets.set(
      this.presets.get().map((p) =>
        p.id === id
          ? { ...p, filters: filters.map(serializeFilter), updatedAt: Date.now() }
          : p
      )
    );
  }

  /**
   * Export all presets as a JSON string.
   */
  exportToJSON(): string {
    const collection: FilterPresetCollection = {
      version: 1,
      presets: this.presets.get(),
    };
    return JSON.stringify(collection, null, 2);
  }

  /**
   * Import presets from a JSON string. Assigns new IDs to avoid collisions.
   * Returns the count of successfully imported presets and any validation errors.
   */
  importFromJSON(json: string): { imported: number; errors: string[] } {
    const errors: string[] = [];
    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    } catch {
      return { imported: 0, errors: ['Invalid JSON'] };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { imported: 0, errors: ['Expected a JSON object'] };
    }

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.version !== 'number') {
      return { imported: 0, errors: ['Missing or invalid "version" field'] };
    }
    if (!Array.isArray(obj.presets)) {
      return { imported: 0, errors: ['Missing or invalid "presets" array'] };
    }

    const valid: FilterPreset[] = [];
    for (let i = 0; i < obj.presets.length; i++) {
      const entry = obj.presets[i];
      if (typeof entry !== 'object' || entry === null) {
        errors.push(`Preset ${i}: not an object`);
        continue;
      }
      const p = entry as Record<string, unknown>;
      if (typeof p.name !== 'string' || !p.name.trim()) {
        errors.push(`Preset ${i}: missing or empty name`);
        continue;
      }
      if (!Array.isArray(p.filters)) {
        errors.push(`Preset ${i}: missing filters array`);
        continue;
      }

      // Validate individual filters — reject objects with unknown/missing types
      const validatedFilters: unknown[] = [];
      let filterErrors = 0;
      for (const f of p.filters as unknown[]) {
        if (typeof f !== 'object' || f === null) { filterErrors++; continue; }
        const fObj = f as Record<string, unknown>;
        if (typeof fObj.type !== 'string' || !KNOWN_FILTER_TYPES.has(fObj.type)) { filterErrors++; continue; }
        if (typeof fObj.column !== 'string' || !fObj.column) { filterErrors++; continue; }
        if (fObj.type === 'raw-sql' && (typeof fObj.sql !== 'string' || typeof fObj.id !== 'string')) {
          filterErrors++;
          continue;
        }
        validatedFilters.push(f);
      }
      if (filterErrors > 0) {
        errors.push(`Preset ${i}: skipped ${filterErrors} invalid filter(s)`);
      }
      if (validatedFilters.length === 0 && (p.filters as unknown[]).length > 0) {
        errors.push(`Preset ${i}: no valid filters`);
        continue;
      }

      valid.push({
        id: crypto.randomUUID(),
        name: (p.name as string).trim(),
        description:
          typeof p.description === 'string' ? p.description.trim() || undefined : undefined,
        filters: validatedFilters as SerializedFilter[],
        sortColumns: Array.isArray(p.sortColumns) ? p.sortColumns : undefined,
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      });
    }

    if (valid.length > 0) {
      this.presets.set([...this.presets.get(), ...valid]);
    }

    return { imported: valid.length, errors };
  }

  /**
   * Replace all presets (used for session restore).
   */
  loadPresets(presets: FilterPreset[]): void {
    this.presets.set(presets.map(p => ({ ...p })));
  }

  /**
   * Get all presets (convenience for non-reactive access).
   */
  getPresets(): FilterPreset[] {
    return this.presets.get();
  }
}
