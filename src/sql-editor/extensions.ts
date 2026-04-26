/**
 * Public CodeMirror extension factories for embedding SQL editors in host
 * apps that live *outside* the data table (e.g., a custom filter-preset
 * composer or a derived-column expression builder mounted elsewhere).
 *
 * `createSqlExtensions(context, options?)` returns a ready-to-use
 * CodeMirror `Extension[]` carrying the PostgreSQL grammar, schema- and
 * DuckDB-aware autocomplete, and (optionally) the library's theme. Drop it
 * into any `EditorState.create({ extensions })` alongside whatever other
 * extensions the host wants (custom keymaps, gutters, sizing).
 *
 * `buildCompletionContext(columns, options?)` is a tiny shape-normalizer
 * that turns any column-like array (a `ColumnSchema[]` from the library, an
 * ad-hoc `[{name, type}, …]`, etc.) into a `CompletionContext` accepted by
 * `createSqlExtensions` and by `CodeMirrorExpressionEditor`.
 *
 * @example
 * import { EditorState } from '@codemirror/state';
 * import { EditorView } from '@codemirror/view';
 * import {
 *   createSqlExtensions,
 *   buildCompletionContext,
 * } from '@jeyabbalas/data-table/advanced';
 *
 * const ctx = buildCompletionContext([
 *   { name: 'price', type: 'DOUBLE' },
 *   { name: 'qty', type: 'BIGINT' },
 * ]);
 * const view = new EditorView({
 *   state: EditorState.create({ extensions: createSqlExtensions(ctx) }),
 *   parent: document.querySelector('#editor')!,
 * });
 */

import { sql, PostgreSQL } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';
import type {
  CompletionContext as CMCompletionContext,
  CompletionResult,
  Completion,
} from '@codemirror/autocomplete';
import type { CompletionContext } from '../derived/types';
import { DUCKDB_FUNCTION_DETAILS, type DuckDBFunctionInfo } from './duckdbFunctionDetails';
import { dataTableTheme, dataTableHighlighting } from './theme';

/** Options accepted by `createSqlExtensions`. */
export interface SqlExtensionOptions {
  /**
   * Include `dataTableTheme` and `dataTableHighlighting` in the returned
   * extension array. Defaults to `true`. Set to `false` if the host already
   * applies its own theme or wants to add the theme separately (e.g.,
   * outside a `Compartment` so it survives reconfiguration).
   */
  includeTheme?: boolean;
  /**
   * Override the function list surfaced via autocomplete. Three behaviors:
   *
   * - **`undefined` (default)** — fall back to `context.functions`, then to the
   *   built-in `DUCKDB_FUNCTION_DETAILS`.
   * - **`[]` (empty array)** — disable function autocomplete entirely; only
   *   column completions are surfaced. Note: this does NOT fall through, since
   *   `??` only treats `null`/`undefined` as missing.
   * - **non-empty array** — replace the function list. A `DuckDBFunctionInfo[]`
   *   populates `detail` (category chip) and `info` (description tooltip) on
   *   each completion option; a `string[]` populates `label` only.
   */
  functions?: readonly DuckDBFunctionInfo[] | readonly string[];
  /**
   * Format SQL keyword completions as uppercase. Defaults to `true`,
   * matching DuckDB's preferred style and the bundled
   * `CodeMirrorExpressionEditor`.
   */
  upperCaseKeywords?: boolean;
}

/**
 * Build a `CompletionContext` from any column-like array.
 *
 * Accepts inputs as terse as `[{name: 'foo'}]` or as full as
 * `ColumnSchema[]`. When both `originalType` and `type` are present
 * `originalType` wins (matches the data-table's internal behavior). Unknown
 * types fall back to an empty string. `isDerived` defaults to `false`.
 *
 * **System columns:** if you obtain columns from
 * `actions.getCompletionContext()`, the synthetic `__rowid__` is already
 * filtered. If you pull columns from `actions.tableSchema` (or some other
 * raw source), filter rows where `name === '__rowid__'` before passing
 * them in — otherwise the synthetic id will appear in the autocomplete
 * dropdown.
 *
 * @param columns - Source columns. Extra fields are ignored.
 * @param options - Optional `functions` array forwarded to `CompletionContext.functions`.
 * @returns A `CompletionContext` ready to pass to `createSqlExtensions` or
 *          `CodeMirrorExpressionEditor`.
 */
export function buildCompletionContext(
  columns: ReadonlyArray<{
    name: string;
    type?: string | null;
    originalType?: string | null;
    isDerived?: boolean | null;
  }>,
  options: { functions?: readonly string[] } = {},
): CompletionContext {
  const result: CompletionContext = {
    columns: columns.map((c) => ({
      name: c.name,
      type: c.originalType ?? c.type ?? '',
      isDerived: c.isDerived === true,
    })),
  };
  if (options.functions !== undefined) {
    result.functions = [...options.functions];
  }
  return result;
}

/**
 * Build the CodeMirror extensions that make any editor SQL-, schema-, and
 * DuckDB-aware. The returned array can be combined with any other
 * extensions the host wants (e.g., `keymap.of(...)`, `placeholder(...)`,
 * `EditorView.theme(...)`).
 *
 * Wrapping the result in a `Compartment` lets the host reconfigure
 * completions on schema change — see `CodeMirrorExpressionEditor` for the
 * canonical pattern.
 *
 * @param context - Columns and (optionally) a function name list.
 * @param options - Theming, keyword case, and function-source overrides.
 * @returns Plain CodeMirror `Extension` array suitable for
 *          `EditorState.create({ extensions })` or `Compartment.of(...)`.
 */
export function createSqlExtensions(
  context: CompletionContext,
  options: SqlExtensionOptions = {},
): Extension[] {
  const includeTheme = options.includeTheme !== false;
  const upperCaseKeywords = options.upperCaseKeywords !== false;

  // Precedence: options.functions ▶ context.functions ▶ built-in details.
  const funcList: readonly DuckDBFunctionInfo[] | readonly string[] =
    options.functions ?? context.functions ?? DUCKDB_FUNCTION_DETAILS;

  const columnOptions: Completion[] = context.columns.map((c) => ({
    label: c.name,
    type: 'variable',
    detail: c.type,
    boost: 0,
  }));

  const functionOptions = functionsToCompletions(funcList);
  const allOptions: Completion[] = [...columnOptions, ...functionOptions];

  const extensions: Extension[] = [
    sql({ dialect: PostgreSQL, upperCaseKeywords }),
    // Attach our autocomplete source via the dialect's language-data facet.
    // Hosts that also wire up `autocompletion()` (the UI) will see the
    // dropdown work; without that UI extension the source is harmless.
    PostgreSQL.language.data.of({
      autocomplete: (cmCtx: CMCompletionContext): CompletionResult | null => {
        const word = cmCtx.matchBefore(/\w+/);
        if (!word && !cmCtx.explicit) return null;
        return {
          from: word?.from ?? cmCtx.pos,
          options: allOptions,
          validFor: /^\w*$/,
        };
      },
    }),
  ];

  if (includeTheme) {
    extensions.push(dataTableTheme, dataTableHighlighting);
  }

  return extensions;
}

function functionsToCompletions(
  list: readonly DuckDBFunctionInfo[] | readonly string[],
): Completion[] {
  if (list.length === 0) return [];
  // Detect shape from the first element. Mixed arrays are not supported —
  // callers either pass strings or rich objects, not both.
  if (typeof list[0] === 'string') {
    return (list as readonly string[]).map((name) => ({
      label: name,
      type: 'function',
      boost: -1,
    }));
  }
  return (list as readonly DuckDBFunctionInfo[]).map((f) => ({
    label: f.name,
    type: 'function',
    detail: f.category,
    info: f.description,
    boost: -1,
  }));
}
