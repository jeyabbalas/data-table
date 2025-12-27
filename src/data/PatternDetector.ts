/**
 * Pattern detection for string columns
 *
 * Detects common patterns like emails, URLs, phone numbers, UUIDs, and IP addresses.
 */

import type { WorkerBridge } from './WorkerBridge';

/**
 * Detected pattern types
 */
export type DetectedPattern =
  | 'email'
  | 'url'
  | 'phone'
  | 'uuid'
  | 'ip'
  | 'identifier'
  | null;

/**
 * Result of pattern detection
 */
export interface PatternDetectionResult {
  /** The detected pattern type, or null if no pattern detected */
  pattern: DetectedPattern;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Number of non-null samples tested */
  samplesTested: number;
  /** Number of samples that matched the pattern */
  samplesMatched: number;
}

/**
 * Options for pattern detection
 */
export interface PatternDetectionOptions {
  /** Maximum number of rows to sample (default: 1000) */
  sampleSize?: number;
  /** Minimum confidence threshold to report a pattern (default: 0.90) */
  minConfidence?: number;
}

// Pattern definitions with regex
const PATTERNS: Array<{ name: DetectedPattern; regex: RegExp; priority: number }> = [
  // UUID - most specific, check first
  {
    name: 'uuid',
    regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    priority: 1,
  },
  // Email
  {
    name: 'email',
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    priority: 2,
  },
  // URL (http/https)
  {
    name: 'url',
    regex: /^https?:\/\/[^\s]+$/,
    priority: 3,
  },
  // IPv4 address
  {
    name: 'ip',
    regex: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    priority: 4,
  },
  // Phone number (international formats)
  {
    name: 'phone',
    regex: /^[+]?[(]?[0-9]{1,3}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
    priority: 5,
  },
  // Identifier (SKU-12345, ID_789, ABC1234)
  {
    name: 'identifier',
    regex: /^[A-Z]{2,5}[-_]?[0-9]{3,}$/i,
    priority: 6,
  },
];

/**
 * Test a single value against a pattern
 */
function matchesPattern(value: string, regex: RegExp): boolean {
  return regex.test(value.trim());
}

/**
 * Detect pattern in an array of string values
 *
 * @param values - Array of string values to analyze
 * @returns PatternDetectionResult with the best matching pattern
 */
export function detectPattern(values: string[]): PatternDetectionResult {
  if (values.length === 0) {
    return {
      pattern: null,
      confidence: 0,
      samplesTested: 0,
      samplesMatched: 0,
    };
  }

  // Count matches for each pattern
  const matchCounts = new Map<DetectedPattern, number>();
  for (const { name } of PATTERNS) {
    matchCounts.set(name, 0);
  }

  // Test each value against all patterns
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    for (const { name, regex } of PATTERNS) {
      if (matchesPattern(trimmed, regex)) {
        matchCounts.set(name, (matchCounts.get(name) || 0) + 1);
      }
    }
  }

  // Find pattern with highest match count
  let bestPattern: DetectedPattern = null;
  let bestCount = 0;
  let bestPriority = Infinity;

  for (const { name, priority } of PATTERNS) {
    const count = matchCounts.get(name) || 0;
    // Only consider patterns with at least one match
    // Use count first, then priority as tiebreaker
    if (count > 0 && (count > bestCount || (count === bestCount && priority < bestPriority))) {
      bestPattern = name;
      bestCount = count;
      bestPriority = priority;
    }
  }

  const confidence = values.length > 0 ? bestCount / values.length : 0;

  return {
    pattern: bestPattern,
    confidence,
    samplesTested: values.length,
    samplesMatched: bestCount,
  };
}

/**
 * Detect pattern in a database column by sampling values
 *
 * @param tableName - Name of the table
 * @param columnName - Name of the column to analyze
 * @param bridge - WorkerBridge instance for querying
 * @param options - Detection options
 * @returns PatternDetectionResult
 */
export async function detectColumnPattern(
  tableName: string,
  columnName: string,
  bridge: WorkerBridge,
  options: PatternDetectionOptions = {}
): Promise<PatternDetectionResult> {
  const { sampleSize = 1000, minConfidence = 0.90 } = options;

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
    return {
      pattern: null,
      confidence: 0,
      samplesTested: 0,
      samplesMatched: 0,
    };
  }

  const result = detectPattern(values);

  // Only return pattern if confidence meets threshold
  if (result.pattern !== null && result.confidence < minConfidence) {
    return {
      pattern: null,
      confidence: result.confidence,
      samplesTested: result.samplesTested,
      samplesMatched: result.samplesMatched,
    };
  }

  return result;
}

/**
 * Detect patterns for all string columns in a table
 *
 * @param tableName - Name of the table to analyze
 * @param bridge - WorkerBridge instance for querying
 * @param options - Detection options
 * @returns Map of column name to pattern detection result
 */
export async function detectAllColumnPatterns(
  tableName: string,
  bridge: WorkerBridge,
  options: PatternDetectionOptions = {}
): Promise<Map<string, PatternDetectionResult>> {
  // Get schema to find string columns
  const schemaQuery = `DESCRIBE "${tableName}"`;
  const schema = await bridge.query<{
    column_name: string;
    column_type: string;
  }>(schemaQuery);

  const results = new Map<string, PatternDetectionResult>();

  // Only analyze VARCHAR/STRING columns
  const stringColumns = schema.filter((col) => {
    const type = col.column_type.toUpperCase();
    return type.startsWith('VARCHAR') || type === 'STRING' || type === 'TEXT';
  });

  for (const col of stringColumns) {
    const result = await detectColumnPattern(
      tableName,
      col.column_name,
      bridge,
      options
    );
    results.set(col.column_name, result);
  }

  return results;
}
