/**
 * Curated list of DuckDB SQL function names for autocomplete.
 *
 * Derived from `DUCKDB_FUNCTION_DETAILS` so the names stay in lockstep with
 * the richer metadata. Hosts that only need names keep using this export;
 * hosts that want category and description should consume
 * `DUCKDB_FUNCTION_DETAILS` instead.
 */

import { DUCKDB_FUNCTION_DETAILS } from './duckdbFunctionDetails';

export const DUCKDB_FUNCTIONS: readonly string[] = DUCKDB_FUNCTION_DETAILS.map((f) => f.name);
