/**
 * Schema detection for DuckDB tables
 * Maps DuckDB column types to our simplified type system
 */

import type { ColumnSchema, DataType } from '../core/types';
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
 * DuckDB type reference: https://duckdb.org/docs/sql/data_types/overview
 */
export function mapDuckDBType(duckdbType: string): DataType {
  // Normalize: uppercase
  const normalized = duckdbType.toUpperCase().trim();

  // Check for array types first - they should map to string
  if (normalized.endsWith('[]')) {
    return 'string';
  }

  // Check for complex container types (LIST, MAP, STRUCT with nested definitions)
  if (
    normalized.startsWith('LIST') ||
    normalized.startsWith('MAP') ||
    normalized.startsWith('STRUCT')
  ) {
    return 'string';
  }

  // Extract base type (handle VARCHAR(255), DECIMAL(10,2), etc.)
  const baseType = normalized.replace(/\(.*\)/, '').trim();

  // Integer types
  if (
    [
      'BIGINT',
      'INT8',
      'LONG',
      'INTEGER',
      'INT4',
      'INT',
      'SIGNED',
      'SMALLINT',
      'INT2',
      'SHORT',
      'TINYINT',
      'INT1',
      'UBIGINT',
      'UINTEGER',
      'USMALLINT',
      'UTINYINT',
      'HUGEINT',
      'UHUGEINT',
    ].includes(baseType)
  ) {
    return 'integer';
  }

  // Float types
  if (['FLOAT', 'FLOAT4', 'REAL', 'DOUBLE', 'FLOAT8'].includes(baseType)) {
    return 'float';
  }

  // Decimal types
  if (['DECIMAL', 'NUMERIC'].includes(baseType)) {
    return 'decimal';
  }

  // Boolean types
  if (['BOOLEAN', 'BOOL', 'LOGICAL'].includes(baseType)) {
    return 'boolean';
  }

  // Date type
  if (baseType === 'DATE') {
    return 'date';
  }

  // Timestamp types
  if (
    [
      'TIMESTAMP',
      'DATETIME',
      'TIMESTAMP WITH TIME ZONE',
      'TIMESTAMPTZ',
      'TIMESTAMP_S',
      'TIMESTAMP_MS',
      'TIMESTAMP_NS',
    ].includes(baseType)
  ) {
    return 'timestamp';
  }

  // Time types
  if (['TIME', 'TIME WITH TIME ZONE', 'TIMETZ'].includes(baseType)) {
    return 'time';
  }

  // Interval type
  if (baseType === 'INTERVAL') {
    return 'interval';
  }

  // String types (including fallback for complex types)
  // VARCHAR, CHAR, TEXT, STRING, UUID, BLOB, JSON, etc.
  return 'string';
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
  bridge: WorkerBridge
): Promise<ColumnSchema[]> {
  // Query column information using DESCRIBE
  const describeResults = await bridge.query<DescribeResult>(
    `DESCRIBE "${tableName}"`
  );

  return describeResults.map((row) => ({
    name: row.column_name,
    type: mapDuckDBType(row.column_type),
    nullable: row.null === 'YES',
    originalType: row.column_type,
  }));
}
