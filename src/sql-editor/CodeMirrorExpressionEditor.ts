import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext as CMCompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { CompletionContext } from '../derived/types';
import type { ExpressionEditor } from '../derived/ExpressionEditorTypes';
import { DUCKDB_FUNCTIONS } from './duckdbFunctions';
import { dataTableTheme, dataTableHighlighting } from './theme';

/**
 * Default `ExpressionEditor` implementation built on CodeMirror 6 with
 * DuckDB SQL grammar, schema-aware autocompletion, and light/dark theming.
 *
 * Consumers who want a different editor (e.g., Monaco, a bespoke DSL) can
 * implement the `ExpressionEditor` interface themselves and pass it via
 * `createDataTable({ editorFactory })`.
 *
 * @example
 * import { CodeMirrorExpressionEditor } from '@jeyabbalas/data-table/advanced';
 *
 * const editor = new CodeMirrorExpressionEditor(
 *   hostEl,
 *   { columns: [{ name: 'age', type: 'integer', isDerived: false }] },
 *   'dt',
 *   { placeholder: 'e.g. age * 2' }
 * );
 * // later:
 * const expr = editor.getValue();
 *
 * @see DUCKDB_FUNCTIONS — the built-in function list surfaced by autocomplete.
 */
export class CodeMirrorExpressionEditor implements ExpressionEditor {
  readonly element: HTMLElement;
  private view: EditorView;
  private errorDiv: HTMLElement;
  private sqlCompartment: Compartment;
  private prefix: string;

  constructor(container: HTMLElement, context: CompletionContext, classPrefix = 'dt', config?: { placeholder?: string }) {
    this.prefix = classPrefix;
    this.sqlCompartment = new Compartment();

    // Root wrapper
    this.element = document.createElement('div');
    this.element.className = `${this.prefix}-cm-expr-editor`;

    // Build CodeMirror state
    const state = EditorState.create({
      doc: '',
      extensions: [
        // SQL with DuckDB dialect + schema — wrapped in Compartment for dynamic updates
        this.sqlCompartment.of(this.buildCompletionExtensions(context)),

        // Autocompletion UI.
        // `tooltipClass` attaches a library-specific class to the tooltip
        // container (which CodeMirror mounts at document.body). That lets
        // our CSS scope `.cm-tooltip-autocomplete` rules to our instances
        // only, so they don't collide with any other CodeMirror editor in
        // the host page.
        autocompletion({
          tooltipClass: () => `${this.prefix}-cm-autocomplete`,
        }),

        // Standard keybindings + undo history
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),

        // Theme
        dataTableTheme,
        dataTableHighlighting,

        // Placeholder
        placeholder(config?.placeholder ?? 'Enter SQL expression, e.g. price * quantity'),

        // Compact sizing
        EditorView.theme({
          '&': { minHeight: '80px', maxHeight: '200px' },
        }),

        // Dispatch synthetic 'input' event on document changes
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.element.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }),

        // Accessibility
        EditorView.contentAttributes.of({ 'aria-label': 'SQL Expression' }),
      ],
    });

    this.view = new EditorView({ state, parent: this.element });

    // Error display (below editor, hidden by default)
    this.errorDiv = document.createElement('div');
    this.errorDiv.className = `${this.prefix}-expr-editor-error`;
    this.errorDiv.style.display = 'none';
    this.element.appendChild(this.errorDiv);

    container.appendChild(this.element);
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(value: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
    });
  }

  focus(): void {
    this.view.focus();
  }

  setError(error: string | null): void {
    if (error !== null) {
      this.element.classList.add(`${this.prefix}-cm-expr-editor--error`);
      this.errorDiv.textContent = error;
      this.errorDiv.style.display = '';
    } else {
      this.element.classList.remove(`${this.prefix}-cm-expr-editor--error`);
      this.errorDiv.textContent = '';
      this.errorDiv.style.display = 'none';
    }
  }

  updateCompletionContext(context: CompletionContext): void {
    this.view.dispatch({
      effects: this.sqlCompartment.reconfigure(this.buildCompletionExtensions(context)),
    });
  }

  destroy(): void {
    this.view.destroy();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  /**
   * Build the SQL language extension + function completion source.
   * Both are wrapped in the same Compartment so updateCompletionContext()
   * can swap them atomically.
   */
  private buildCompletionExtensions(context: CompletionContext) {
    const funcList = context.functions ?? DUCKDB_FUNCTIONS;

    // Column completions with type detail
    const columnOptions = context.columns.map((c) => ({
      label: c.name,
      type: 'variable' as const,
      detail: c.type,
      boost: 0,
    }));

    // Function completions (lower priority)
    const functionOptions = funcList.map((f) => ({
      label: f,
      type: 'function' as const,
      boost: -1,
    }));

    const allOptions = [...columnOptions, ...functionOptions];

    return [
      // SQL language for syntax highlighting + keyword completions
      sql({
        dialect: PostgreSQL,
        upperCaseKeywords: true,
      }),

      // Column + function completion source via language data facet
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
  }
}
