/**
 * Smart type detection for string columns
 *
 * Analyzes string columns to detect if they contain data that could be
 * parsed as other types (timestamps, numbers, booleans).
 */

import type { DataType } from '../core/types';
import type { WorkerBridge } from './WorkerBridge';

/**
 * Result of type inference on a string column
 */
export interface TypeInferenceResult {
  /** The suggested data type based on content analysis */
  suggestedType: DataType;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Description of the detected pattern (e.g., "ISO 8601", "integer") */
  pattern?: string;
  /** Number of non-null samples tested */
  samplesTested: number;
  /** Number of samples that matched the suggested type */
  samplesMatched: number;
}

/**
 * Options for type inference
 */
export interface TypeInferenceOptions {
  /** Maximum number of rows to sample (default: 1000) */
  sampleSize?: number;
  /** Minimum confidence threshold to suggest a type (default: 0.95) */
  minConfidence?: number;
}

// Boolean true values (case-insensitive)
const BOOLEAN_TRUE_VALUES = new Set([
  'true',
  't',
  'yes',
  'y',
  '1',
  'on',
]);

// Boolean false values (case-insensitive)
const BOOLEAN_FALSE_VALUES = new Set([
  'false',
  'f',
  'no',
  'n',
  '0',
  'off',
]);

/**
 * Check if a value looks like a boolean
 */
function isBoolean(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return BOOLEAN_TRUE_VALUES.has(lower) || BOOLEAN_FALSE_VALUES.has(lower);
}

/**
 * Check if a value looks like an integer
 */
function isInteger(value: string): boolean {
  const trimmed = value.trim();
  // Match optional sign followed by digits
  return /^[+-]?\d+$/.test(trimmed);
}

/**
 * Check if a value looks like a float/decimal
 */
function isFloat(value: string): boolean {
  const trimmed = value.trim();
  // Match numbers with decimal point or scientific notation
  return /^[+-]?(\d+\.?\d*|\d*\.?\d+)([eE][+-]?\d+)?$/.test(trimmed) && trimmed.includes('.');
}

/**
 * Check if a value looks like an ISO date (YYYY-MM-DD)
 */
function isISODate(value: string): boolean {
  const trimmed = value.trim();
  // ISO date: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  // Validate it's a real date
  const date = new Date(trimmed);
  return !isNaN(date.getTime());
}

/**
 * Check if a value looks like an ISO timestamp
 */
function isISOTimestamp(value: string): boolean {
  const trimmed = value.trim();
  // ISO timestamp patterns:
  // YYYY-MM-DDTHH:MM:SS
  // YYYY-MM-DDTHH:MM:SS.sss
  // YYYY-MM-DDTHH:MM:SSZ
  // YYYY-MM-DD HH:MM:SS
  const isoPattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
  if (!isoPattern.test(trimmed)) {
    return false;
  }
  // Validate it's a real timestamp
  const date = new Date(trimmed.replace(' ', 'T'));
  return !isNaN(date.getTime());
}

/**
 * Test values against each type and return the best match
 */
function analyzeValues(values: string[]): {
  type: DataType;
  pattern: string;
  matched: number;
} {
  if (values.length === 0) {
    return { type: 'string', pattern: 'empty', matched: 0 };
  }

  // Count matches for each type
  let timestampMatches = 0;
  let dateMatches = 0;
  let booleanMatches = 0;
  let integerMatches = 0;
  let floatMatches = 0;

  for (const value of values) {
    if (isISOTimestamp(value)) {
      timestampMatches++;
    }
    if (isISODate(value)) {
      dateMatches++;
    }
    if (isBoolean(value)) {
      booleanMatches++;
    }
    if (isInteger(value)) {
      integerMatches++;
    }
    if (isFloat(value)) {
      floatMatches++;
    }
  }

  const total = values.length;

  // Return the best match (most specific first)
  // Timestamps are more specific than dates
  if (timestampMatches === total) {
    return { type: 'timestamp', pattern: 'ISO 8601 timestamp', matched: timestampMatches };
  }

  if (dateMatches === total) {
    return { type: 'date', pattern: 'ISO 8601 date', matched: dateMatches };
  }

  if (booleanMatches === total) {
    return { type: 'boolean', pattern: 'boolean', matched: booleanMatches };
  }

  if (integerMatches === total) {
    return { type: 'integer', pattern: 'integer', matched: integerMatches };
  }

  if (floatMatches === total) {
    return { type: 'float', pattern: 'decimal number', matched: floatMatches };
  }

  // Check for partial matches with high confidence
  const confidenceThreshold = 0.95;

  if (timestampMatches / total >= confidenceThreshold) {
    return { type: 'timestamp', pattern: 'ISO 8601 timestamp', matched: timestampMatches };
  }

  if (dateMatches / total >= confidenceThreshold) {
    return { type: 'date', pattern: 'ISO 8601 date', matched: dateMatches };
  }

  if (booleanMatches / total >= confidenceThreshold) {
    return { type: 'boolean', pattern: 'boolean', matched: booleanMatches };
  }

  if (integerMatches / total >= confidenceThreshold) {
    return { type: 'integer', pattern: 'integer', matched: integerMatches };
  }

  if (floatMatches / total >= confidenceThreshold) {
    return { type: 'float', pattern: 'decimal number', matched: floatMatches };
  }

  // Default to string
  return { type: 'string', pattern: 'mixed/text', matched: total };
}

/**
 * Infer the actual data type of a string column by sampling its values
 *
 * @param tableName - Name of the table to analyze
 * @param columnName - Name of the column to analyze
 * @param bridge - WorkerBridge instance for querying
 * @param options - Inference options
 * @returns TypeInferenceResult with suggested type and confidence
 */
export async function inferStringColumnType(
  tableName: string,
  columnName: string,
  bridge: WorkerBridge,
  options: TypeInferenceOptions = {}
): Promise<TypeInferenceResult> {
  const { sampleSize = 1000, minConfidence = 0.95 } = options;

  // Sample distinct non-null values from the column
  const sampleQuery = `
    SELECT DISTINCT "${columnName}" as value
    FROM "${tableName}"
    WHERE "${columnName}" IS NOT NULL
    LIMIT ${sampleSize}
  `;

  const samples = await bridge.query<{ value: string }>(sampleQuery);
  const values = samples.map((row) => String(row.value));

  if (values.length === 0) {
    // All values are NULL
    return {
      suggestedType: 'string',
      confidence: 0,
      pattern: 'all null',
      samplesTested: 0,
      samplesMatched: 0,
    };
  }

  const analysis = analyzeValues(values);
  const confidence = values.length > 0 ? analysis.matched / values.length : 0;

  // Only suggest a non-string type if confidence meets threshold
  if (analysis.type !== 'string' && confidence < minConfidence) {
    return {
      suggestedType: 'string',
      confidence: 1 - confidence, // Confidence in keeping as string
      pattern: 'mixed/text',
      samplesTested: values.length,
      samplesMatched: values.length - analysis.matched,
    };
  }

  return {
    suggestedType: analysis.type,
    confidence,
    pattern: analysis.pattern,
    samplesTested: values.length,
    samplesMatched: analysis.matched,
  };
}

/**
 * Infer types for all string columns in a table
 *
 * @param tableName - Name of the table to analyze
 * @param bridge - WorkerBridge instance for querying
 * @param options - Inference options
 * @returns Map of column name to inference result (only for string columns)
 */
export async function inferAllStringColumnTypes(
  tableName: string,
  bridge: WorkerBridge,
  options: TypeInferenceOptions = {}
): Promise<Map<string, TypeInferenceResult>> {
  // Get schema to find string columns
  const schemaQuery = `DESCRIBE "${tableName}"`;
  const schema = await bridge.query<{
    column_name: string;
    column_type: string;
  }>(schemaQuery);

  const results = new Map<string, TypeInferenceResult>();

  // Only analyze VARCHAR/STRING columns
  const stringColumns = schema.filter((col) => {
    const type = col.column_type.toUpperCase();
    return type.startsWith('VARCHAR') || type === 'STRING' || type === 'TEXT';
  });

  for (const col of stringColumns) {
    const result = await inferStringColumnType(
      tableName,
      col.column_name,
      bridge,
      options
    );
    results.set(col.column_name, result);
  }

  return results;
}
