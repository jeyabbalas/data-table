/**
 * Data module exports
 */

export { WorkerBridge } from './WorkerBridge';
export type {
  LoadOptions,
  ProgressInfo,
  ProgressCallback,
  WorkerBridgeOptions,
} from './WorkerBridge';

export { DataLoader } from './DataLoader';
export type { DataFormat, LoadResult, DataLoaderOptions } from './DataLoader';

export { QueryCache, attachCacheInvalidation } from './QueryCache';
export type { QueryCacheOptions } from './QueryCache';

export { detectSchema, mapDuckDBType } from './SchemaDetector';

export { inferStringColumnType, inferAllStringColumnTypes } from './TypeInference';
export type { TypeInferenceResult, TypeInferenceOptions } from './TypeInference';

export { detectPattern, detectColumnPattern, detectAllColumnPatterns } from './PatternDetector';
export type {
  DetectedPattern,
  PatternDetectionResult,
  PatternDetectionOptions,
} from './PatternDetector';
