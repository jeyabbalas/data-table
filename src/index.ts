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

// Worker types (for advanced usage)
export type {
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  WorkerResponseType,
} from './worker/types';
