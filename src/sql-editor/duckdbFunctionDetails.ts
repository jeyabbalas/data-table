/**
 * Curated DuckDB SQL function metadata for autocompletion + tooltips.
 *
 * Each entry pairs a function name with a category (used as the autocomplete
 * `detail` chip) and a one-line description (used as the autocomplete `info`
 * panel). Names are kept in lowercase, matching DuckDB's case-insensitive
 * resolution and the existing `DUCKDB_FUNCTIONS` list — `DUCKDB_FUNCTIONS`
 * is now derived from this array, so the two cannot drift.
 *
 * Descriptions are paraphrased from the DuckDB documentation; they are not
 * exhaustive signatures. Hosts that need precise signatures should consult
 * the DuckDB reference. The list is intentionally not exhaustive — it covers
 * the functions commonly typed in expression / filter editors.
 */

/** Category labels surfaced in the autocomplete `detail` slot. */
export type DuckDBFunctionCategory =
  | 'aggregate'
  | 'numeric'
  | 'string'
  | 'date/time'
  | 'casting'
  | 'conditional'
  | 'list'
  | 'struct'
  | 'window'
  | 'utility';

/** Single function entry: name, category, and one-line description. */
export interface DuckDBFunctionInfo {
  /** Function identifier (lowercase, matches DuckDB resolution). */
  name: string;
  /** Group used for the autocomplete `detail` chip. */
  category: DuckDBFunctionCategory;
  /** One-line description shown in the autocomplete `info` panel. */
  description: string;
}

export const DUCKDB_FUNCTION_DETAILS: readonly DuckDBFunctionInfo[] = [
  // ---- Aggregate ----
  { name: 'avg', category: 'aggregate', description: 'Arithmetic mean of all non-null values.' },
  { name: 'count', category: 'aggregate', description: 'Number of non-null values; count(*) counts rows.' },
  { name: 'count_star', category: 'aggregate', description: 'Number of input rows, including those with NULLs.' },
  { name: 'first', category: 'aggregate', description: 'First non-null value encountered in the group.' },
  { name: 'last', category: 'aggregate', description: 'Last non-null value encountered in the group.' },
  { name: 'max', category: 'aggregate', description: 'Largest non-null value in the group.' },
  { name: 'min', category: 'aggregate', description: 'Smallest non-null value in the group.' },
  { name: 'sum', category: 'aggregate', description: 'Sum of all non-null numeric values.' },
  { name: 'string_agg', category: 'aggregate', description: 'Concatenate string values with an optional separator.' },
  { name: 'list_agg', category: 'aggregate', description: 'Aggregate values into a list (alias for list()).' },
  { name: 'group_concat', category: 'aggregate', description: 'Concatenate group values into a single string.' },
  { name: 'approx_count_distinct', category: 'aggregate', description: 'Approximate distinct count using HyperLogLog.' },
  { name: 'approx_quantile', category: 'aggregate', description: 'Approximate quantile via t-digest.' },
  { name: 'median', category: 'aggregate', description: 'Median (50th percentile) of the values.' },
  { name: 'mode', category: 'aggregate', description: 'Most frequent value in the group.' },
  { name: 'stddev', category: 'aggregate', description: 'Sample standard deviation (alias for stddev_samp).' },
  { name: 'stddev_pop', category: 'aggregate', description: 'Population standard deviation.' },
  { name: 'stddev_samp', category: 'aggregate', description: 'Sample standard deviation.' },
  { name: 'variance', category: 'aggregate', description: 'Sample variance (alias for var_samp).' },
  { name: 'var_pop', category: 'aggregate', description: 'Population variance.' },
  { name: 'var_samp', category: 'aggregate', description: 'Sample variance.' },
  { name: 'corr', category: 'aggregate', description: 'Pearson correlation coefficient between two columns.' },
  { name: 'covar_pop', category: 'aggregate', description: 'Population covariance between two columns.' },
  { name: 'covar_samp', category: 'aggregate', description: 'Sample covariance between two columns.' },
  { name: 'entropy', category: 'aggregate', description: 'Shannon entropy of the values.' },
  { name: 'kurtosis', category: 'aggregate', description: 'Excess kurtosis of the values.' },
  { name: 'skewness', category: 'aggregate', description: 'Skewness (third standardized moment).' },
  { name: 'bit_and', category: 'aggregate', description: 'Bitwise AND across all values.' },
  { name: 'bit_or', category: 'aggregate', description: 'Bitwise OR across all values.' },
  { name: 'bit_xor', category: 'aggregate', description: 'Bitwise XOR across all values.' },
  { name: 'bool_and', category: 'aggregate', description: 'TRUE if every value is TRUE; ignores NULLs.' },
  { name: 'bool_or', category: 'aggregate', description: 'TRUE if at least one value is TRUE.' },
  { name: 'histogram', category: 'aggregate', description: 'Frequency map of values to counts.' },
  { name: 'list', category: 'aggregate', description: 'Collect values into a list.' },
  { name: 'array_agg', category: 'aggregate', description: 'Collect values into an array (alias for list).' },

  // ---- Numeric / Math ----
  { name: 'abs', category: 'numeric', description: 'Absolute value.' },
  { name: 'acos', category: 'numeric', description: 'Inverse cosine, in radians.' },
  { name: 'asin', category: 'numeric', description: 'Inverse sine, in radians.' },
  { name: 'atan', category: 'numeric', description: 'Inverse tangent, in radians.' },
  { name: 'atan2', category: 'numeric', description: 'Inverse tangent of y/x with quadrant disambiguation.' },
  { name: 'cbrt', category: 'numeric', description: 'Cube root.' },
  { name: 'ceil', category: 'numeric', description: 'Smallest integer >= the value.' },
  { name: 'ceiling', category: 'numeric', description: 'Alias for ceil.' },
  { name: 'cos', category: 'numeric', description: 'Cosine; argument in radians.' },
  { name: 'cot', category: 'numeric', description: 'Cotangent; argument in radians.' },
  { name: 'degrees', category: 'numeric', description: 'Convert radians to degrees.' },
  { name: 'exp', category: 'numeric', description: 'Exponential e^x.' },
  { name: 'floor', category: 'numeric', description: 'Largest integer <= the value.' },
  { name: 'greatest', category: 'numeric', description: 'Largest of the supplied non-null arguments.' },
  { name: 'least', category: 'numeric', description: 'Smallest of the supplied non-null arguments.' },
  { name: 'ln', category: 'numeric', description: 'Natural logarithm (base e).' },
  { name: 'log', category: 'numeric', description: 'Base-10 logarithm (alias for log10).' },
  { name: 'log2', category: 'numeric', description: 'Base-2 logarithm.' },
  { name: 'log10', category: 'numeric', description: 'Base-10 logarithm.' },
  { name: 'pi', category: 'numeric', description: 'Mathematical constant π.' },
  { name: 'pow', category: 'numeric', description: 'x raised to the power y (alias for power).' },
  { name: 'power', category: 'numeric', description: 'x raised to the power y.' },
  { name: 'radians', category: 'numeric', description: 'Convert degrees to radians.' },
  { name: 'random', category: 'numeric', description: 'Pseudo-random DOUBLE in [0, 1).' },
  { name: 'round', category: 'numeric', description: 'Round to a given number of decimal places.' },
  { name: 'sign', category: 'numeric', description: '−1, 0, or 1 indicating the sign of the value.' },
  { name: 'sin', category: 'numeric', description: 'Sine; argument in radians.' },
  { name: 'sqrt', category: 'numeric', description: 'Square root.' },
  { name: 'tan', category: 'numeric', description: 'Tangent; argument in radians.' },
  { name: 'trunc', category: 'numeric', description: 'Truncate toward zero to a given decimal precision.' },
  { name: 'factorial', category: 'numeric', description: 'n! (factorial of a non-negative integer).' },
  { name: 'even', category: 'numeric', description: 'TRUE when the integer is even.' },
  { name: 'isnan', category: 'numeric', description: 'TRUE when the value is NaN.' },
  { name: 'isinf', category: 'numeric', description: 'TRUE when the value is infinite.' },
  { name: 'isfinite', category: 'numeric', description: 'TRUE when the value is finite (not NaN or ±∞).' },

  // ---- String ----
  { name: 'ascii', category: 'string', description: 'Unicode codepoint of the first character.' },
  { name: 'chr', category: 'string', description: 'Character corresponding to a Unicode codepoint.' },
  { name: 'concat', category: 'string', description: 'Concatenate strings; NULL arguments treated as empty.' },
  { name: 'concat_ws', category: 'string', description: 'Concatenate with a separator; NULLs are skipped.' },
  { name: 'contains', category: 'string', description: 'TRUE when the haystack contains the needle.' },
  { name: 'format', category: 'string', description: 'Python-style string formatting via {} placeholders.' },
  { name: 'left', category: 'string', description: 'Leftmost N characters of the string.' },
  { name: 'length', category: 'string', description: 'Number of characters in the string.' },
  { name: 'lower', category: 'string', description: 'Convert to lowercase.' },
  { name: 'lpad', category: 'string', description: 'Left-pad to a target length with a fill string.' },
  { name: 'ltrim', category: 'string', description: 'Trim characters from the left side.' },
  { name: 'md5', category: 'string', description: 'MD5 digest of the input as a hex string.' },
  { name: 'position', category: 'string', description: '1-based position of substring (0 if not found).' },
  { name: 'prefix', category: 'string', description: 'TRUE when the string starts with a prefix.' },
  { name: 'printf', category: 'string', description: 'C-style printf string formatting.' },
  { name: 'regexp_extract', category: 'string', description: 'Extract first regex match (or capture group).' },
  { name: 'regexp_full_match', category: 'string', description: 'TRUE when the entire string matches the regex.' },
  { name: 'regexp_matches', category: 'string', description: 'TRUE when the regex matches anywhere in the string.' },
  { name: 'regexp_replace', category: 'string', description: 'Replace regex matches with a replacement string.' },
  { name: 'repeat', category: 'string', description: 'Repeat the string N times.' },
  { name: 'replace', category: 'string', description: 'Replace all occurrences of a substring.' },
  { name: 'reverse', category: 'string', description: 'Reverse the characters of the string.' },
  { name: 'right', category: 'string', description: 'Rightmost N characters of the string.' },
  { name: 'rpad', category: 'string', description: 'Right-pad to a target length with a fill string.' },
  { name: 'rtrim', category: 'string', description: 'Trim characters from the right side.' },
  { name: 'split_part', category: 'string', description: 'Nth field after splitting on a delimiter.' },
  { name: 'starts_with', category: 'string', description: 'TRUE when the string starts with a prefix.' },
  { name: 'string_split', category: 'string', description: 'Split a string into a list on a delimiter.' },
  { name: 'strip_accents', category: 'string', description: 'Remove diacritical marks from the string.' },
  { name: 'strlen', category: 'string', description: 'Number of bytes in the string (alias).' },
  { name: 'substr', category: 'string', description: 'Substring starting at a 1-based position.' },
  { name: 'substring', category: 'string', description: 'Substring (alias for substr).' },
  { name: 'suffix', category: 'string', description: 'TRUE when the string ends with a suffix.' },
  { name: 'trim', category: 'string', description: 'Trim characters from both sides.' },
  { name: 'unicode', category: 'string', description: 'Unicode codepoint of the first character.' },
  { name: 'upper', category: 'string', description: 'Convert to uppercase.' },
  { name: 'levenshtein', category: 'string', description: 'Levenshtein edit distance between two strings.' },
  { name: 'jaccard', category: 'string', description: 'Jaccard similarity (set overlap) of two strings.' },
  { name: 'jaro_winkler_similarity', category: 'string', description: 'Jaro-Winkler similarity of two strings.' },

  // ---- Date / Time ----
  { name: 'age', category: 'date/time', description: 'Interval between two timestamps (or to today).' },
  { name: 'current_date', category: 'date/time', description: 'Current date in the session time zone.' },
  { name: 'current_time', category: 'date/time', description: 'Current time of day.' },
  { name: 'current_timestamp', category: 'date/time', description: 'Current timestamp at statement start.' },
  { name: 'date_diff', category: 'date/time', description: 'Number of part boundaries crossed between two dates.' },
  { name: 'datediff', category: 'date/time', description: 'Alias for date_diff.' },
  { name: 'date_part', category: 'date/time', description: 'Extract a part (year, month, …) as a number.' },
  { name: 'datepart', category: 'date/time', description: 'Alias for date_part.' },
  { name: 'date_sub', category: 'date/time', description: 'Subtract an interval from a date/timestamp.' },
  { name: 'date_trunc', category: 'date/time', description: 'Truncate a date/timestamp to a part.' },
  { name: 'datetrunc', category: 'date/time', description: 'Alias for date_trunc.' },
  { name: 'dayname', category: 'date/time', description: 'English day-of-week name (Monday, Tuesday, …).' },
  { name: 'epoch', category: 'date/time', description: 'Seconds since 1970-01-01 UTC.' },
  { name: 'epoch_ms', category: 'date/time', description: 'Milliseconds since 1970-01-01 UTC.' },
  { name: 'epoch_us', category: 'date/time', description: 'Microseconds since 1970-01-01 UTC.' },
  { name: 'epoch_ns', category: 'date/time', description: 'Nanoseconds since 1970-01-01 UTC.' },
  { name: 'extract', category: 'date/time', description: 'Extract a part (year, month, day, …) from a value.' },
  { name: 'last_day', category: 'date/time', description: 'Last day of the month containing the input date.' },
  { name: 'make_date', category: 'date/time', description: 'Build a DATE from year, month, day.' },
  { name: 'make_time', category: 'date/time', description: 'Build a TIME from hour, minute, second.' },
  { name: 'make_timestamp', category: 'date/time', description: 'Build a TIMESTAMP from components or microseconds.' },
  { name: 'monthname', category: 'date/time', description: 'English month name (January, February, …).' },
  { name: 'now', category: 'date/time', description: 'Current timestamp at statement start.' },
  { name: 'strftime', category: 'date/time', description: 'Format a date/timestamp using a strftime pattern.' },
  { name: 'strptime', category: 'date/time', description: 'Parse a string using a strftime pattern.' },
  { name: 'time_bucket', category: 'date/time', description: 'Bucket a timestamp into fixed-width windows.' },
  { name: 'today', category: 'date/time', description: 'Current date (alias for current_date).' },
  { name: 'year', category: 'date/time', description: 'Year component of a date/timestamp.' },
  { name: 'month', category: 'date/time', description: 'Month component (1-12) of a date/timestamp.' },
  { name: 'day', category: 'date/time', description: 'Day-of-month component of a date/timestamp.' },
  { name: 'hour', category: 'date/time', description: 'Hour component (0-23) of a time/timestamp.' },
  { name: 'minute', category: 'date/time', description: 'Minute component (0-59) of a time/timestamp.' },
  { name: 'second', category: 'date/time', description: 'Second component (0-59) of a time/timestamp.' },
  { name: 'millennium', category: 'date/time', description: 'Millennium component of a date/timestamp.' },
  { name: 'century', category: 'date/time', description: 'Century component of a date/timestamp.' },
  { name: 'decade', category: 'date/time', description: 'Decade component of a date/timestamp.' },
  { name: 'quarter', category: 'date/time', description: 'Quarter (1-4) of a date/timestamp.' },
  { name: 'dayofweek', category: 'date/time', description: 'Day of week (0=Sunday … 6=Saturday).' },
  { name: 'dayofyear', category: 'date/time', description: 'Day of year (1-366).' },
  { name: 'week', category: 'date/time', description: 'ISO week number (1-53).' },
  { name: 'weekday', category: 'date/time', description: 'ISO weekday (1=Monday … 7=Sunday).' },
  { name: 'weekofyear', category: 'date/time', description: 'ISO week of the year (1-53).' },
  { name: 'yearweek', category: 'date/time', description: 'Year and ISO week packed as YYYYWW.' },

  // ---- Casting / Type ----
  { name: 'cast', category: 'casting', description: 'Convert a value to a target type; errors on failure.' },
  { name: 'try_cast', category: 'casting', description: 'Like CAST but returns NULL on failure.' },
  { name: 'typeof', category: 'casting', description: 'Name of the value\'s logical type.' },

  // ---- Conditional ----
  { name: 'coalesce', category: 'conditional', description: 'First non-null argument.' },
  { name: 'ifnull', category: 'conditional', description: 'Replace NULL with a fallback value.' },
  { name: 'nullif', category: 'conditional', description: 'NULL when the two arguments are equal.' },

  // ---- List / Array ----
  { name: 'list_value', category: 'list', description: 'Construct a list from the given arguments.' },
  { name: 'list_aggregate', category: 'list', description: 'Apply an aggregate function to a list.' },
  { name: 'list_any_value', category: 'list', description: 'First non-null element of the list.' },
  { name: 'list_append', category: 'list', description: 'Return the list with an element appended.' },
  { name: 'list_concat', category: 'list', description: 'Concatenate two lists.' },
  { name: 'list_contains', category: 'list', description: 'TRUE when the list contains the value.' },
  { name: 'list_distinct', category: 'list', description: 'Remove duplicates from a list.' },
  { name: 'list_filter', category: 'list', description: 'Keep only list elements that match a predicate.' },
  { name: 'list_position', category: 'list', description: '1-based position of the value in the list (0 if absent).' },
  { name: 'list_reduce', category: 'list', description: 'Fold the list with a binary function.' },
  { name: 'list_reverse_sort', category: 'list', description: 'Sort the list in descending order.' },
  { name: 'list_slice', category: 'list', description: 'Sub-list between two 1-based positions.' },
  { name: 'list_sort', category: 'list', description: 'Sort the list in ascending order.' },
  { name: 'list_transform', category: 'list', description: 'Map a function over each list element.' },
  { name: 'list_unique', category: 'list', description: 'Number of distinct elements in the list.' },
  { name: 'flatten', category: 'list', description: 'Flatten a list of lists by one level.' },
  { name: 'generate_series', category: 'list', description: 'List of integers from start to end (inclusive).' },
  { name: 'range', category: 'list', description: 'List of integers from start (inclusive) to end (exclusive).' },
  { name: 'unnest', category: 'list', description: 'Expand a list into one row per element.' },
  { name: 'array_length', category: 'list', description: 'Length of the array/list.' },
  { name: 'len', category: 'list', description: 'Length of a list, string, or blob.' },

  // ---- Struct / Map ----
  { name: 'struct_pack', category: 'struct', description: 'Build a STRUCT from named fields.' },
  { name: 'struct_extract', category: 'struct', description: 'Extract a field from a STRUCT.' },
  { name: 'struct_insert', category: 'struct', description: 'Return a STRUCT with one or more fields added.' },
  { name: 'map', category: 'struct', description: 'Construct a MAP from key/value lists.' },
  { name: 'map_from_entries', category: 'struct', description: 'Build a MAP from a list of key/value pairs.' },
  { name: 'map_entries', category: 'struct', description: 'List of key/value pairs from a MAP.' },
  { name: 'map_extract', category: 'struct', description: 'Look up a value in a MAP by key.' },
  { name: 'map_keys', category: 'struct', description: 'List of keys in a MAP.' },
  { name: 'map_values', category: 'struct', description: 'List of values in a MAP.' },
  { name: 'element_at', category: 'struct', description: 'MAP/list lookup by key or index.' },
  { name: 'cardinality', category: 'struct', description: 'Number of entries in a list, MAP, or array.' },

  // ---- Window ----
  { name: 'row_number', category: 'window', description: 'Sequential row number within the window partition.' },
  { name: 'rank', category: 'window', description: 'Rank with gaps for ties.' },
  { name: 'dense_rank', category: 'window', description: 'Rank without gaps for ties.' },
  { name: 'percent_rank', category: 'window', description: 'Relative rank in [0, 1].' },
  { name: 'cume_dist', category: 'window', description: 'Cumulative distribution within the partition.' },
  { name: 'ntile', category: 'window', description: 'Bucket rows into N evenly-sized tiles.' },
  { name: 'lag', category: 'window', description: 'Value from a row offset earlier in the partition.' },
  { name: 'lead', category: 'window', description: 'Value from a row offset later in the partition.' },
  { name: 'first_value', category: 'window', description: 'First value in the window frame.' },
  { name: 'last_value', category: 'window', description: 'Last value in the window frame.' },
  { name: 'nth_value', category: 'window', description: 'Nth value in the window frame.' },

  // ---- Utility ----
  { name: 'hash', category: 'utility', description: '64-bit hash of the input value.' },
  { name: 'sha256', category: 'utility', description: 'SHA-256 digest of the input as a hex string.' },
  { name: 'uuid', category: 'utility', description: 'Random UUID v4.' },
  { name: 'gen_random_uuid', category: 'utility', description: 'Random UUID v4 (alias for uuid()).' },
  { name: 'version', category: 'utility', description: 'DuckDB version string.' },
];
