/**
 * Data loaders for DuckDB
 */

export { loadCSV, dropTable } from './csv';
export { loadJSON } from './json';
export { loadParquet } from './parquet';
export type {
  LoadResult,
  CSVLoadOptions,
  JSONLoadOptions,
  ParquetLoadOptions,
} from './types';
