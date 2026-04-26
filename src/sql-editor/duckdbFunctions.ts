/**
 * Curated list of DuckDB SQL function names for autocomplete.
 *
 * Derived from `DUCKDB_FUNCTION_DETAILS` so the names stay in lockstep with
 * the richer metadata. Hosts that only need names keep using this export;
 * hosts that want category and description should consume
 * `DUCKDB_FUNCTION_DETAILS` instead.
 */

import { DUCKDB_FUNCTION_DETAILS } from './duckdbFunctionDetails';

/**
 * Names-only view of the curated DuckDB function list. Derived at module
 * load from {@link DUCKDB_FUNCTION_DETAILS} so the two cannot drift. Pass
 * to {@link createSqlExtensions} via `options.functions` when only the
 * autocomplete name list is needed (no category chip / description panel).
 */
export const DUCKDB_FUNCTIONS: readonly string[] = DUCKDB_FUNCTION_DETAILS.map((f) => f.name);
