/**
 * Data module exports
 */

export { WorkerBridge, getDefaultBridge } from './WorkerBridge';
export type { LoadOptions, ProgressInfo, ProgressCallback } from './WorkerBridge';

export { DataLoader } from './DataLoader';
export type { DataFormat, LoadResult, DataLoaderOptions } from './DataLoader';

export { detectSchema, mapDuckDBType } from './SchemaDetector';

export { inferStringColumnType, inferAllStringColumnTypes } from './TypeInference';
export type { TypeInferenceResult, TypeInferenceOptions } from './TypeInference';

export { detectPattern, detectColumnPattern, detectAllColumnPatterns } from './PatternDetector';
export type { DetectedPattern, PatternDetectionResult, PatternDetectionOptions } from './PatternDetector';
