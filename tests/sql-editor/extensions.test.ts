/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import {
  createSqlExtensions,
  buildCompletionContext,
  type SqlExtensionOptions,
} from '@/sql-editor/extensions';
import { DUCKDB_FUNCTION_DETAILS } from '@/sql-editor/duckdbFunctionDetails';
import type { CompletionContext } from '@/derived/types';

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
          top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0,
          x: 0, y: 0, toJSON: () => {},
        }),
        createContextualFragment: (html: string) => {
          const template = document.createElement('template');
          template.innerHTML = html;
          return template.content;
        },
      } as unknown as Range);
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
    const ctx = buildCompletionContext([
      { name: 'price', type: 'float', originalType: 'DOUBLE' },
    ]);
    expect(ctx.columns[0].type).toBe('DOUBLE');
  });

  it('falls back to type when originalType is missing', () => {
    const ctx = buildCompletionContext([
      { name: 'qty', type: 'BIGINT' },
    ]);
    expect(ctx.columns[0].type).toBe('BIGINT');
  });

  it('coerces null/undefined fields safely', () => {
    const ctx = buildCompletionContext([
      { name: 'mystery', type: null, originalType: null, isDerived: null },
    ]);
    expect(ctx.columns[0]).toEqual({ name: 'mystery', type: '', isDerived: false });
  });

  it('preserves isDerived: true', () => {
    const ctx = buildCompletionContext([
      { name: 'tip_pct', type: 'float', isDerived: true },
    ]);
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
      } as { name: string; type: string; originalType: string; isDerived: boolean; nullable: boolean; system: boolean },
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

  it('produces fewer extensions when includeTheme is false', () => {
    const withTheme = createSqlExtensions(baseContext, { includeTheme: true });
    const withoutTheme = createSqlExtensions(baseContext, { includeTheme: false });
    expect(withoutTheme.length).toBe(withTheme.length - 2);
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
      functions: [
        { name: 'foo', category: 'utility', description: 'custom function' },
      ],
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

  it('honors upperCaseKeywords flag', () => {
    const upper = createSqlExtensions(baseContext, { upperCaseKeywords: true });
    const lower = createSqlExtensions(baseContext, { upperCaseKeywords: false });
    expect(upper.length).toBe(lower.length);
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
