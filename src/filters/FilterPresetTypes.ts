/**
 * Filter Preset Types
 *
 * Type definitions for saving and restoring named sets of filters.
 * The JSON export format (FilterPresetCollection) serves as a handoff
 * format for downstream applications (e.g., DQ rules).
 */

import type { SortColumn } from '../core/types';
import type { SerializedFilter } from '../persistence/types';

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: SerializedFilter[];
  sortColumns?: SortColumn[];
  createdAt: number;
  updatedAt: number;
}

export interface FilterPresetCollection {
  version: number;
  presets: FilterPreset[];
}
