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
 * Check if a value looks like a US date (MM/DD/YYYY)
 * Returns true only if it could be a valid US date (month 1-12, day 1-31)
 */
function isUSDate(value: string): boolean {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validate ranges
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1000 || year > 9999) return false;

  // Additional validation for days in month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return false;

  return true;
}

/**
 * Check if a value looks like an EU date (DD/MM/YYYY)
 * Returns true only if it could be a valid EU date (day 1-31, month 1-12)
 */
function isEUDate(value: string): boolean {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validate ranges
  if (day < 1 || day > 31) return false;
  if (month < 1 || month > 12) return false;
  if (year < 1000 || year > 9999) return false;

  // Additional validation for days in month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return false;

  return true;
}

/**
 * Check if a date string is ambiguous (could be US or EU format)
 * This happens when both the first and second number could be month OR day (1-12)
 */
function isAmbiguousSlashDate(value: string): boolean {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const first = parseInt(match[1], 10);
  const second = parseInt(match[2], 10);

  // If both numbers are <= 12, it's ambiguous
  return first >= 1 && first <= 12 && second >= 1 && second <= 12;
}

/**
 * Check if a value looks like a TIME (HH:MM:SS with optional fractional seconds)
 * Matches formats: "12:30:45", "12:30:45.123", "12:30:45.123456"
 */
function isTime(value: string): boolean {
  const trimmed = value.trim();
  // Match HH:MM:SS or HH:MM:SS.ffffff (1-6 fractional digits)
  const match = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/);
  if (!match) return false;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  // Validate ranges
  return hours >= 0 && hours <= 23 &&
         minutes >= 0 && minutes <= 59 &&
         seconds >= 0 && seconds <= 59;
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
  let usDateMatches = 0;
  let euDateMatches = 0;
  let ambiguousSlashDateCount = 0;
  let timeMatches = 0;
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
    if (isUSDate(value)) {
      usDateMatches++;
      if (isAmbiguousSlashDate(value)) {
        ambiguousSlashDateCount++;
      }
    }
    if (isEUDate(value)) {
      euDateMatches++;
    }
    if (isTime(value)) {
      timeMatches++;
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
  const confidenceThreshold = 0.95;

  // Return the best match (most specific first)
  // Timestamps are more specific than dates
  if (timestampMatches === total) {
    return { type: 'timestamp', pattern: 'ISO 8601 timestamp', matched: timestampMatches };
  }

  if (dateMatches === total) {
    return { type: 'date', pattern: 'ISO 8601 date', matched: dateMatches };
  }

  // Check for US date format (only if unambiguous)
  // If all values match US date AND none are ambiguous, it's likely US format
  if (usDateMatches === total && ambiguousSlashDateCount === 0) {
    return { type: 'date', pattern: 'US date (MM/DD/YYYY)', matched: usDateMatches };
  }

  // Check for EU date format (only if unambiguous)
  // EU dates where day > 12 are unambiguous (e.g., 30/12/2025)
  if (euDateMatches === total && usDateMatches < total) {
    // Some values can only be EU format (day > 12)
    return { type: 'date', pattern: 'EU date (DD/MM/YYYY)', matched: euDateMatches };
  }

  // Check for TIME format (HH:MM:SS with optional microseconds)
  if (timeMatches === total) {
    return { type: 'time', pattern: 'TIME (HH:MM:SS)', matched: timeMatches };
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
  if (timestampMatches / total >= confidenceThreshold) {
    return { type: 'timestamp', pattern: 'ISO 8601 timestamp', matched: timestampMatches };
  }

  if (dateMatches / total >= confidenceThreshold) {
    return { type: 'date', pattern: 'ISO 8601 date', matched: dateMatches };
  }

  // US date with high confidence (only if unambiguous)
  if (usDateMatches / total >= confidenceThreshold && ambiguousSlashDateCount === 0) {
    return { type: 'date', pattern: 'US date (MM/DD/YYYY)', matched: usDateMatches };
  }

  // EU date with high confidence (only if distinguishable from US)
  if (euDateMatches / total >= confidenceThreshold && usDateMatches / total < confidenceThreshold) {
    return { type: 'date', pattern: 'EU date (DD/MM/YYYY)', matched: euDateMatches };
  }

  // TIME with high confidence
  if (timeMatches / total >= confidenceThreshold) {
    return { type: 'time', pattern: 'TIME (HH:MM:SS)', matched: timeMatches };
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

  // Default to string (includes ambiguous slash date formats)
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
