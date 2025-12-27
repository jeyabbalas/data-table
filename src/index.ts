/**
 * Interactive Data Table Library
 *
 * A client-side JavaScript library for interactive, explorable data tables
 * using DuckDB WASM for in-browser analytics.
 */

export const VERSION = '0.1.0';

// Core types
export * from './core/types';

// Core classes
export { EventEmitter } from './core/EventEmitter';

// Progress reporting
export type {
  ProgressInfo,
  ProgressCallback,
  ProgressStage,
} from './core/Progress';
export {
  estimateTimeRemaining,
  formatProgress,
  formatBytes,
  formatDuration,
} from './core/Progress';

// Data layer
export { WorkerBridge, getDefaultBridge } from './data/WorkerBridge';
export type { LoadOptions } from './data/WorkerBridge';

// Data loader
export { DataLoader } from './data/DataLoader';
export type { DataFormat, LoadResult, DataLoaderOptions } from './data/DataLoader';

// Worker types (for advanced usage)
export type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  WorkerResponseType,
} from './worker/types';
