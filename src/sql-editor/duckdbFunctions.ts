/**
 * Curated list of DuckDB SQL functions for autocomplete.
 * Organized by category. Avoids requiring a live DuckDB connection.
 */
export const DUCKDB_FUNCTIONS: string[] = [
  // Aggregate (~35)
  'avg', 'count', 'count_star', 'first', 'last', 'max', 'min', 'sum',
  'string_agg', 'list_agg', 'group_concat', 'approx_count_distinct',
  'approx_quantile', 'median', 'mode', 'stddev', 'stddev_pop',
  'stddev_samp', 'variance', 'var_pop', 'var_samp',
  'corr', 'covar_pop', 'covar_samp', 'entropy', 'kurtosis',
  'skewness', 'bit_and', 'bit_or', 'bit_xor', 'bool_and', 'bool_or',
  'histogram', 'list', 'array_agg',

  // Numeric / Math (~30)
  'abs', 'acos', 'asin', 'atan', 'atan2', 'cbrt', 'ceil', 'ceiling',
  'cos', 'cot', 'degrees', 'exp', 'floor', 'greatest',
  'least', 'ln', 'log', 'log2', 'log10', 'pi', 'pow',
  'power', 'radians', 'random', 'round', 'sign', 'sin', 'sqrt',
  'tan', 'trunc', 'factorial', 'even', 'isnan', 'isinf', 'isfinite',

  // String (~40)
  'ascii', 'chr', 'concat', 'concat_ws', 'contains', 'format',
  'left', 'length', 'lower', 'lpad', 'ltrim', 'md5',
  'position', 'prefix', 'printf', 'regexp_extract',
  'regexp_full_match', 'regexp_matches', 'regexp_replace',
  'repeat', 'replace', 'reverse', 'right', 'rpad', 'rtrim',
  'split_part', 'starts_with', 'string_split',
  'strip_accents', 'strlen', 'substr', 'substring', 'suffix',
  'trim', 'unicode', 'upper',
  'levenshtein', 'jaccard', 'jaro_winkler_similarity',

  // Date/Time (~45)
  'age', 'current_date', 'current_time', 'current_timestamp',
  'date_diff', 'datediff', 'date_part', 'datepart', 'date_sub',
  'date_trunc', 'datetrunc', 'dayname', 'epoch', 'epoch_ms',
  'epoch_us', 'epoch_ns', 'extract', 'last_day',
  'make_date', 'make_time', 'make_timestamp',
  'monthname', 'now', 'strftime', 'strptime',
  'time_bucket', 'today',
  'year', 'month', 'day', 'hour', 'minute', 'second',
  'millennium', 'century', 'decade', 'quarter', 'dayofweek',
  'dayofyear', 'week', 'weekday', 'weekofyear', 'yearweek',

  // Casting / Type
  'cast', 'try_cast', 'typeof',

  // Conditional
  'coalesce', 'ifnull', 'nullif',

  // List / Array (~20)
  'list_value', 'list_aggregate', 'list_any_value', 'list_append',
  'list_concat', 'list_contains', 'list_distinct', 'list_filter',
  'list_position', 'list_reduce', 'list_reverse_sort',
  'list_slice', 'list_sort', 'list_transform', 'list_unique',
  'flatten', 'generate_series', 'range', 'unnest',
  'array_length', 'len',

  // Struct / Map
  'struct_pack', 'struct_extract', 'struct_insert',
  'map', 'map_from_entries', 'map_entries', 'map_extract',
  'map_keys', 'map_values', 'element_at', 'cardinality',

  // Window
  'row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist',
  'ntile', 'lag', 'lead', 'first_value', 'last_value', 'nth_value',

  // Utility
  'hash', 'sha256', 'uuid', 'gen_random_uuid', 'version',
];
