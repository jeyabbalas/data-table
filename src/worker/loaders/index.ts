/**
 * Data loaders for DuckDB
 */

export { loadCSV, dropTable } from './csv';
export { loadJSON } from './json';
export type { LoadResult, CSVLoadOptions, JSONLoadOptions } from './types';
