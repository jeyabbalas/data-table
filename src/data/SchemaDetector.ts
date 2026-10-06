/**
 * Schema detection for DuckDB tables
 * Maps DuckDB column types to our simplified type system
 */

import { dataTypeOf, parseDuckDBType } from '../core/duckdbType';
import type { ColumnSchema, DataType } from '../core/types';
import { quoteIdentifier } from '../filters/FilterSQL';
import type { WorkerBridge } from './WorkerBridge';

/**
 * Result from DuckDB DESCRIBE query
 */
interface DescribeResult {
  column_name: string;
  column_type: string;
  null: string; // "YES" or "NO"
  key: string | null;
  default: string | null;
  extra: string | null;
}

/**
 * Map a DuckDB type string to our simplified DataType
 *
 * Reads the type through {@link parseDuckDBType}: a scalar maps by its name
 * (`DECIMAL(10,2)` is `'decimal'`, `TIMESTAMP WITH TIME ZONE` is
 * `'timestamp'`), `JSON` and any scalar it does not know (BLOB, ENUM, …) are
 * `'string'`, and lists, arrays, structs, maps, unions and VARIANT are
 * `'nested'`.
 *
 * DuckDB type reference: https://duckdb.org/docs/sql/data_types/overview
 */
export function mapDuckDBType(duckdbType: string): DataType {
  return dataTypeOf(parseDuckDBType(duckdbType));
}

/**
 * Detect the schema of a DuckDB table
 *
 * @param tableName - Name of the table to analyze
 * @param bridge - WorkerBridge instance for querying
 * @returns Array of ColumnSchema objects
 */
export async function detectSchema(
  tableName: string,
  bridge: WorkerBridge,
): Promise<ColumnSchema[]> {
  // Query column information using DESCRIBE
  const describeResults = await bridge.query<DescribeResult>(
    `DESCRIBE ${quoteIdentifier(tableName)}`,
  );

  return describeResults.map((row) => ({
    name: row.column_name,
    type: mapDuckDBType(row.column_type),
    nullable: row.null === 'YES',
    originalType: row.column_type,
  }));
}
