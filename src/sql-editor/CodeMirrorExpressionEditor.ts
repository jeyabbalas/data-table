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

export class CodeMirrorExpressionEditor implements ExpressionEditor {
  readonly element: HTMLElement;
  private view: EditorView;
  private errorDiv: HTMLElement;
  private sqlCompartment: Compartment;
  private prefix: string;

  constructor(container: HTMLElement, context: CompletionContext, classPrefix = 'dt') {
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

        // Autocompletion UI
        autocompletion(),

        // Standard keybindings + undo history
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),

        // Theme
        dataTableTheme,
        dataTableHighlighting,

        // Placeholder
        placeholder('Enter SQL expression, e.g. price * quantity'),

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
    const columnNames = context.columns.map((c) => c.name);
    const funcList = context.functions ?? DUCKDB_FUNCTIONS;

    return [
      // SQL language with DuckDB dialect and column names as schema
      sql({
        dialect: PostgreSQL,
        schema: { '': columnNames },
        upperCaseKeywords: true,
      }),

      // Additional function completion source (additive, not override)
      EditorState.languageData.of(() => [
        {
          autocomplete: (cmCtx: CMCompletionContext): CompletionResult | null => {
            const word = cmCtx.matchBefore(/\w+/);
            if (!word && !cmCtx.explicit) return null;
            return {
              from: word?.from ?? cmCtx.pos,
              options: funcList.map((f) => ({
                label: f,
                type: 'function',
                boost: -1, // lower priority than column names
              })),
              validFor: /^\w*$/,
            };
          },
        },
      ]),
    ];
  }
}
