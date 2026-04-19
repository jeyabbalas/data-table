import { describe, it, expect } from 'vitest';
import * as rootModule from '../src/index';
import * as advancedModule from '../src/advanced';

/**
 * Explicit guard covering Phase 4 reclassifications. The snapshot test in
 * `api-surface.snapshot.test.ts` catches all drift; this file documents the
 * specific symbols that must NOT leak at the root (Tier-2 moved to
 * `/advanced`; Tier-3 removed from the public surface entirely).
 */

const MUST_NOT_LEAK_AT_ROOT = [
  // Tier-3 — reactive primitives
  'createSignal',
  'computed',
  'batch',

  // Tier-3 — performance monitor
  'PerfMonitor',

  // Tier-3 — data-layer helpers
  'QueryCache',
  'DataLoader',
  'detectSchema',
  'mapDuckDBType',
  'inferStringColumnType',
  'inferAllStringColumnTypes',
  'detectPattern',
  'detectColumnPattern',
  'detectAllColumnPatterns',

  // Tier-3 — filter/SQL internals
  // (quoteIdentifier and formatSQLValue are intentionally Tier-1 — the
  // downstream DQ app needs them. filterToSQL / filtersToWhereClause are
  // internal Filter-object → WHERE-clause converters.)
  'filterToSQL',
  'filtersToWhereClause',
  'splitCrossfilterFilters',

  // Tier-3 — persistence / snapshot serializers
  'snapshotFromState',
  'restoreStateFromSnapshot',
  'serializeStateSnapshot',
  'deserializeStateSnapshot',
  'isDateWrapper',
  'serializeValue',
  'deserializeValue',

  // Tier-3 — progress / formatting utilities
  'estimateTimeRemaining',
  'formatProgress',
  'formatBytes',
  'formatDuration',
  'formatFilter',
  'formatDisplayValue',

  // Tier-2 — now on /advanced
  'EventEmitter',
  'StateActions',
  'createTableState',
  'resetTableState',
  'initializeColumnsFromSchema',
  'UndoManager',
  'captureSnapshot',
  'applySnapshot',
  'derivedColumnsEqual',
  'VisualizationFactory',
  'isNumericType',
  'isDateType',
  'isTimeType',
  'isCategoricalType',
  'needsVisualization',
  'TableContainer',
  'ColumnHeader',
  'TableBody',
  'VirtualScroller',
  'CellRenderer',
  'ColumnReorder',
  'HiddenColumnsGutter',
  'FilterChip',
  'FilterBar',
  'FilterPanel',
  'FilterPanelField',
  'SQLFilterModal',
  'FilterPresetPanel',
  'DerivedColumnEditPanel',
  'DerivedColumnModal',
  'AddColumnButton',
  'DefaultExpressionEditor',
  'DerivedColumnManager',
  'CodeMirrorExpressionEditor',
  'DUCKDB_FUNCTIONS',
  'ExportDialog',
  'exportToCSV',
  'exportFromState',
  'exportToJSON',
  'exportJSONFromState',
  'exportToParquet',
  'exportParquetFromState',
  'copyToClipboard',
  'copyRowsToClipboard',
  'AutoSave',
  'SNAPSHOT_VERSION',
  'isPooledVectorRef',
  'statsKindForDataType',
  'formatStatValue',
  'formatCount',
  'formatDefaultStats',
  'fetchIntervalStats',
  'BaseVisualization',
  'Histogram',
  'DateHistogram',
  'TimeHistogram',
  'IntervalHistogram',
  'ValueCounts',
  'CrossfilterCoordinator',
  'InteractionManager',
];

const MUST_EXIST_AT_ROOT = [
  // Facade
  'VERSION',
  'createDataTable',

  // Error classes
  'DataTableError',
  'WorkerInitError',
  'WorkerTerminatedError',
  'QueryError',
  'LoadError',
  'SQLValidationError',
  'DerivedColumnError',
  'PersistenceError',
  'ExportError',
  'ConfigurationError',
  'DestroyedError',

  // SQL-authoring helpers (Tier-1 — elevated for downstream DQ app)
  'quoteIdentifier',
  'formatSQLValue',

  // Filter presets
  'FilterPresetManager',

  // Data layer
  'WorkerBridge',

  // Persistence
  'SessionStore',
  'serializeFilter',
  'deserializeFilter',

  // Visualization registry
  'VisualizationRegistry',
  'defaultVisualizationRegistry',
];

const MUST_EXIST_AT_ADVANCED = [
  'EventEmitter',
  'StateActions',
  'createTableState',
  'UndoManager',
  'TableContainer',
  'ColumnHeader',
  'TableBody',
  'VirtualScroller',
  'FilterBar',
  'FilterPanel',
  'SQLFilterModal',
  'DerivedColumnManager',
  'CodeMirrorExpressionEditor',
  'DUCKDB_FUNCTIONS',
  'ExportDialog',
  'exportToCSV',
  'exportToJSON',
  'exportToParquet',
  'copyToClipboard',
  'AutoSave',
  'BaseVisualization',
  'Histogram',
  'ValueCounts',
  'CrossfilterCoordinator',
  'VisualizationFactory',
  'isNumericType',
  'isDateType',
  'isTimeType',
  'isCategoricalType',
];

describe('Root entry does not leak Tier-2 or Tier-3 symbols', () => {
  for (const name of MUST_NOT_LEAK_AT_ROOT) {
    it(`root does not export "${name}"`, () => {
      expect(rootModule).not.toHaveProperty(name);
    });
  }
});

describe('Root entry exposes the Tier-1 public surface', () => {
  for (const name of MUST_EXIST_AT_ROOT) {
    it(`root exports "${name}"`, () => {
      expect(rootModule).toHaveProperty(name);
    });
  }
});

describe('/advanced subpath exposes the Tier-2 surface', () => {
  for (const name of MUST_EXIST_AT_ADVANCED) {
    it(`/advanced exports "${name}"`, () => {
      expect(advancedModule).toHaveProperty(name);
    });
  }
});
