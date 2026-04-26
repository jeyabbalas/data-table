/**
 * Filter Preset Types
 *
 * Type definitions for saving and restoring named sets of filters.
 * The JSON export format (FilterPresetCollection) serves as a handoff
 * format for downstream applications (e.g., DQ rules).
 */

import type { SortColumn } from '../core/types';
import type { SerializedFilter } from '../persistence/types';

/**
 * One named filter preset — a saved snapshot of `state.filters` plus optional
 * `state.sortColumns`. Stored by {@link FilterPresetManager}; round-trips
 * through `exportToJSON` / `importFromJSON` for handoff to downstream apps
 * (data-quality rule editors, dashboards).
 */
export interface FilterPreset {
  id: string;
  name: string;
  description?: string | undefined;
  filters: SerializedFilter[];
  sortColumns?: SortColumn[] | undefined;
  createdAt: number;
  updatedAt: number;
}

/**
 * JSON file shape emitted by {@link FilterPresetManager.exportToJSON} and
 * accepted by {@link FilterPresetManager.importFromJSON}. The `version`
 * field gates back-compat parsing.
 */
export interface FilterPresetCollection {
  version: number;
  presets: FilterPreset[];
}
