/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  autocompletion,
  CompletionContext as CMCompletionContext,
  type Completion,
} from '@codemirror/autocomplete';
import {
  createSqlExtensions,
  buildCompletionContext,
  type SqlExtensionOptions,
} from '@/sql-editor/extensions';
import { DUCKDB_FUNCTION_DETAILS } from '@/sql-editor/duckdbFunctionDetails';
import { dataTableTheme, dataTableHighlighting } from '@/sql-editor/theme';
import type { CompletionContext } from '@/derived/types';

/** A `CompletionResult`-shaped subset that the library's source emits. */
type AcResult = {
  options: readonly Completion[];
  from: number;
  validFor?: RegExp;
} | null;

/**
 * Resolve and invoke the autocomplete source registered by
 * `createSqlExtensions`. The PostgreSQL language may have its own keyword
 * source registered too; we identify the library's source by its distinctive
 * `validFor: /^\w*$/`. For tests where our source returns `null`
 * (no-word + non-explicit), the helper returns `null` overall.
 */
function runOurAutocomplete(
  extensions: Extension[],
  doc: string,
  pos: number,
  explicit = false,
): AcResult {
  const state = EditorState.create({
    doc,
    extensions: [...extensions, autocompletion()],
  });
  const sources = state.languageDataAt<(c: CMCompletionContext) => unknown>('autocomplete', pos);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    const cmCtx = new CMCompletionContext(state, pos, explicit);
    const result = source(cmCtx) as AcResult;
    if (result && result.validFor && result.validFor.toString() === '/^\\w*$/') {
      return result;
    }
  }
  return null;
}

// CodeMirror requires DOM APIs that jsdom may not fully support.
beforeAll(() => {
  if (!document.createRange) {
    document.createRange = () =>
      ({
        setStart: () => {},
        setEnd: () => {},
        commonAncestorContainer: document.body,
        getClientRects: () => [],
        getBoundingClientRect: () => ({
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        }),
        createContextualFragment: (html: string) => {
          const template = document.createElement('template');
          template.innerHTML = html;
          return template.content;
        },
      }) as unknown as Range;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe('buildCompletionContext', () => {
  it('handles a minimal { name } shape and defaults missing fields', () => {
    const ctx = buildCompletionContext([{ name: 'foo' }, { name: 'bar' }]);
    expect(ctx.columns).toEqual([
      { name: 'foo', type: '', isDerived: false },
      { name: 'bar', type: '', isDerived: false },
    ]);
    expect(ctx.functions).toBeUndefined();
  });

  it('uses originalType when both type and originalType are present', () => {
    const ctx = buildCompletionContext([{ name: 'price', type: 'float', originalType: 'DOUBLE' }]);
    expect(ctx.columns[0].type).toBe('DOUBLE');
  });

  it('falls back to type when originalType is missing', () => {
    const ctx = buildCompletionContext([{ name: 'qty', type: 'BIGINT' }]);
    expect(ctx.columns[0].type).toBe('BIGINT');
  });

  it('coerces null/undefined fields safely', () => {
    const ctx = buildCompletionContext([
      { name: 'mystery', type: null, originalType: null, isDerived: null },
    ]);
    expect(ctx.columns[0]).toEqual({ name: 'mystery', type: '', isDerived: false });
  });

  it('preserves isDerived: true', () => {
    const ctx = buildCompletionContext([{ name: 'tip_pct', type: 'float', isDerived: true }]);
    expect(ctx.columns[0].isDerived).toBe(true);
  });

  it('forwards options.functions into the result', () => {
    const ctx = buildCompletionContext([{ name: 'a' }], {
      functions: ['avg', 'count'],
    });
    expect(ctx.functions).toEqual(['avg', 'count']);
  });

  it('omits functions when options.functions is undefined', () => {
    const ctx = buildCompletionContext([{ name: 'a' }]);
    expect(ctx.functions).toBeUndefined();
  });

  it('handles an empty columns array', () => {
    const ctx = buildCompletionContext([]);
    expect(ctx.columns).toEqual([]);
  });

  it('accepts ColumnSchema-like input with extra fields', () => {
    // Simulates ColumnSchema (has additional fields like nullable, system, etc.)
    const ctx = buildCompletionContext([
      {
        name: 'order_total_usd',
        type: 'float',
        originalType: 'DOUBLE',
        isDerived: false,
        // extra fields ignored:
        nullable: true,
        system: false,
      } as {
        name: string;
        type: string;
        originalType: string;
        isDerived: boolean;
        nullable: boolean;
        system: boolean;
      },
    ]);
    expect(ctx.columns[0]).toEqual({
      name: 'order_total_usd',
      type: 'DOUBLE',
      isDerived: false,
    });
  });
});

describe('createSqlExtensions', () => {
  const baseContext: CompletionContext = {
    columns: [
      { name: 'price', type: 'DOUBLE', isDerived: false },
      { name: 'qty', type: 'BIGINT', isDerived: false },
    ],
  };

  it('returns a non-empty Extension array by default', () => {
    const ext = createSqlExtensions(baseContext);
    expect(Array.isArray(ext)).toBe(true);
    expect(ext.length).toBeGreaterThan(0);
  });

  it('includes the library theme by default and omits it when includeTheme is false', () => {
    const withTheme = createSqlExtensions(baseContext, { includeTheme: true });
    const withoutTheme = createSqlExtensions(baseContext, { includeTheme: false });
    const defaulted = createSqlExtensions(baseContext);

    // Identity check (catches refactors that swap the theme reference).
    expect(withTheme).toContain(dataTableTheme);
    expect(withTheme).toContain(dataTableHighlighting);
    expect(defaulted).toContain(dataTableTheme);
    expect(defaulted).toContain(dataTableHighlighting);

    expect(withoutTheme).not.toContain(dataTableTheme);
    expect(withoutTheme).not.toContain(dataTableHighlighting);
  });

  it('mounts in a real EditorState without throwing', () => {
    const state = EditorState.create({
      doc: 'SELECT * FROM t',
      extensions: [...createSqlExtensions(baseContext), autocompletion()],
    });
    expect(state.doc.toString()).toBe('SELECT * FROM t');
  });

  it('mounts in an EditorView without throwing', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      const view = new EditorView({
        state: EditorState.create({
          doc: '',
          extensions: [...createSqlExtensions(baseContext), autocompletion()],
        }),
        parent: container,
      });
      expect(container.querySelector('.cm-editor')).toBeTruthy();
      view.destroy();
    } finally {
      container.remove();
    }
  });

  it('accepts a string[] override for functions', () => {
    const ext = createSqlExtensions(baseContext, { functions: ['avg', 'sum'] });
    expect(ext.length).toBeGreaterThan(0);
    // Smoke: still mounts cleanly.
    EditorState.create({ extensions: ext });
  });

  it('accepts a DuckDBFunctionInfo[] override for functions', () => {
    const ext = createSqlExtensions(baseContext, {
      functions: [{ name: 'foo', category: 'utility', description: 'custom function' }],
    });
    expect(ext.length).toBeGreaterThan(0);
    EditorState.create({ extensions: ext });
  });

  it('accepts an empty functions array (no function autocomplete)', () => {
    const ext = createSqlExtensions(baseContext, { functions: [] });
    EditorState.create({ extensions: ext });
  });

  it('falls back to context.functions when options.functions is omitted', () => {
    const ctxWithFns: CompletionContext = {
      columns: baseContext.columns,
      functions: ['avg', 'count'],
    };
    const ext = createSqlExtensions(ctxWithFns);
    EditorState.create({ extensions: ext });
  });

  it('lets options.functions override context.functions', () => {
    const ctxWithFns: CompletionContext = {
      columns: baseContext.columns,
      functions: ['avg'],
    };
    const ext = createSqlExtensions(ctxWithFns, { functions: ['count'] });
    EditorState.create({ extensions: ext });
  });

  it('accepts both upperCaseKeywords settings without crashing', () => {
    // The flag is plumbed through to `sql({ upperCaseKeywords })`; the actual
    // case of suggested SQL keywords is owned by `@codemirror/lang-sql` and is
    // covered by its own test suite. We verify only that both values mount
    // cleanly here.
    const upper = createSqlExtensions(baseContext, { upperCaseKeywords: true });
    const lower = createSqlExtensions(baseContext, { upperCaseKeywords: false });
    EditorState.create({ extensions: upper });
    EditorState.create({ extensions: lower });
  });

  it('handles an empty columns array', () => {
    const ext = createSqlExtensions({ columns: [] });
    expect(ext.length).toBeGreaterThan(0);
    EditorState.create({ extensions: ext });
  });

  it('uses DUCKDB_FUNCTION_DETAILS by default', () => {
    // Sanity: the default list resolves and is non-empty; the extension array
    // builds successfully for it.
    expect(DUCKDB_FUNCTION_DETAILS.length).toBeGreaterThan(0);
    const ext = createSqlExtensions({ columns: [] });
    EditorState.create({ extensions: ext });
  });
});

describe('SqlExtensionOptions type smoke', () => {
  it('compiles with each documented option key', () => {
    const opts: SqlExtensionOptions = {
      includeTheme: false,
      upperCaseKeywords: false,
      functions: ['avg'],
    };
    expect(opts).toBeDefined();
  });
});

describe('createSqlExtensions autocomplete behavior', () => {
  // These tests resolve and call the autocomplete source the library
  // registers via `PostgreSQL.language.data.of(...)`. They guard the contract
  // that mounting alone cannot — option ordering, boost values,
  // detail/info population, validFor regex, and explicit-vs-no-word handling.

  const baseContext: CompletionContext = {
    columns: [
      { name: 'price', type: 'DOUBLE', isDerived: false },
      { name: 'qty', type: 'BIGINT', isDerived: false },
    ],
  };

  it('returns columns + default DuckDB functions when nothing is overridden', () => {
    const ext = createSqlExtensions(baseContext);
    // Position after one alphanumeric char so matchBefore(/\w+/) is satisfied.
    const result = runOurAutocomplete(ext, 'p', 1);
    expect(result).not.toBeNull();
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('price');
    expect(labels).toContain('qty');
    expect(labels).toContain('avg');
    expect(labels).toContain('count');
  });

  it('ranks columns above functions via boost', () => {
    const ext = createSqlExtensions(baseContext);
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();

    const columnOpts = result!.options.filter((o) => o.type === 'variable');
    const functionOpts = result!.options.filter((o) => o.type === 'function');

    expect(columnOpts.length).toBeGreaterThan(0);
    expect(functionOpts.length).toBeGreaterThan(0);

    // boost contract: 0 for columns, -1 for functions (so columns rank higher).
    for (const c of columnOpts) expect(c.boost).toBe(0);
    for (const f of functionOpts) expect(f.boost).toBe(-1);

    // Columns appear before functions in the emitted order.
    const lastColumnIdx = result!.options.findLastIndex((o) => o.type === 'variable');
    const firstFunctionIdx = result!.options.findIndex((o) => o.type === 'function');
    expect(lastColumnIdx).toBeLessThan(firstFunctionIdx);
  });

  it('disables function autocomplete when options.functions is []', () => {
    const ext = createSqlExtensions(baseContext, { functions: [] });
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();
    const functionOpts = result!.options.filter((o) => o.type === 'function');
    expect(functionOpts).toHaveLength(0);

    const columnLabels = result!.options.map((o) => o.label);
    expect(columnLabels).toContain('price');
    expect(columnLabels).toContain('qty');
  });

  it('falls back to context.functions when options.functions is omitted', () => {
    const ctx: CompletionContext = {
      columns: baseContext.columns,
      functions: ['only_in_context'],
    };
    const ext = createSqlExtensions(ctx);
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();
    const functionLabels = result!.options.filter((o) => o.type === 'function').map((o) => o.label);
    expect(functionLabels).toEqual(['only_in_context']);
  });

  it('lets options.functions override context.functions', () => {
    const ctx: CompletionContext = {
      columns: baseContext.columns,
      functions: ['from_context'],
    };
    const ext = createSqlExtensions(ctx, { functions: ['from_options'] });
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();
    const functionLabels = result!.options.filter((o) => o.type === 'function').map((o) => o.label);
    expect(functionLabels).toEqual(['from_options']);
  });

  it('populates detail and info for DuckDBFunctionInfo[] entries', () => {
    const ext = createSqlExtensions(baseContext, {
      functions: [{ name: 'demo_fn', category: 'utility', description: 'demo description' }],
    });
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();
    const opt = result!.options.find((o) => o.label === 'demo_fn');
    expect(opt).toBeDefined();
    expect(opt!.type).toBe('function');
    expect(opt!.detail).toBe('utility');
    expect(opt!.info).toBe('demo description');
    expect(opt!.boost).toBe(-1);
  });

  it('populates only label for string[] function entries', () => {
    const ext = createSqlExtensions(baseContext, { functions: ['just_a_name'] });
    const result = runOurAutocomplete(ext, 'a', 1);
    expect(result).not.toBeNull();
    const opt = result!.options.find((o) => o.label === 'just_a_name');
    expect(opt).toBeDefined();
    expect(opt!.type).toBe('function');
    expect(opt!.boost).toBe(-1);
    expect(opt!.detail).toBeUndefined();
    expect(opt!.info).toBeUndefined();
  });

  it('sets validFor to /^\\w*$/ on the result', () => {
    const ext = createSqlExtensions(baseContext);
    const result = runOurAutocomplete(ext, 'p', 1);
    expect(result).not.toBeNull();
    expect(result!.validFor).toBeInstanceOf(RegExp);
    expect(result!.validFor!.toString()).toBe('/^\\w*$/');
  });

  it('sets `from` to the start of the matched word', () => {
    const ext = createSqlExtensions(baseContext);
    // doc='abc', pos=3 → matchBefore(/\w+/) returns {from: 0, to: 3}
    const result = runOurAutocomplete(ext, 'abc', 3);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(0);
  });

  it('returns null when there is no word and the request is not explicit', () => {
    const ext = createSqlExtensions(baseContext);
    const result = runOurAutocomplete(ext, '', 0, /* explicit */ false);
    // Our source returns null in this case; runOurAutocomplete's source-finder
    // looks for our distinctive validFor and finds nothing → returns null.
    expect(result).toBeNull();
  });

  it('returns options when there is no word but the request IS explicit', () => {
    const ext = createSqlExtensions(baseContext);
    const result = runOurAutocomplete(ext, '', 0, /* explicit */ true);
    expect(result).not.toBeNull();
    expect(result!.from).toBe(0);
    const labels = result!.options.map((o) => o.label);
    expect(labels).toContain('price');
    expect(labels).toContain('qty');
  });

  it('exposes columns with type set to the column type and type=variable', () => {
    const ext = createSqlExtensions(baseContext);
    const result = runOurAutocomplete(ext, 'p', 1);
    expect(result).not.toBeNull();
    const priceOpt = result!.options.find((o) => o.label === 'price');
    expect(priceOpt).toBeDefined();
    expect(priceOpt!.type).toBe('variable');
    expect(priceOpt!.detail).toBe('DOUBLE');
    expect(priceOpt!.boost).toBe(0);
  });
});
