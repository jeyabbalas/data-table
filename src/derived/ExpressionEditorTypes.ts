/**
 * Expression Editor Extension Point
 *
 * Defines the interface that custom expression editors must implement.
 * The library's default is CodeMirrorExpressionEditor (CodeMirror 6 with
 * DuckDB SQL autocompletion); DefaultExpressionEditor is a plain-textarea
 * alternative. Downstream apps can also bring Monaco or similar.
 */

import type { CompletionContext } from './types';

/**
 * Interface that custom expression editors must implement.
 *
 * The editor's root element must dispatch DOM `input` events (or let them
 * bubble from child elements) so the hosting panel can detect content changes.
 */
export interface ExpressionEditor {
  /** The root DOM element to mount in the panel/modal */
  readonly element: HTMLElement;
  /** Get current editor content */
  getValue(): string;
  /** Set editor content (for editing existing columns) */
  setValue(value: string): void;
  /** Focus the editor */
  focus(): void;
  /** Display an error message inline (null clears the error) */
  setError(error: string | null): void;
  /** Update completion context when schema changes */
  updateCompletionContext(context: CompletionContext): void;
  /** Clean up resources */
  destroy(): void;
}

/**
 * The placeholder and accessible name a dialog gives its expression editor,
 * from the table's `messages`: `derived.expressionPlaceholder` and
 * `derived.expressionLabel` in the add-column dialog and the column edit
 * panel, `filters.sqlFilter.editorPlaceholder` and
 * `filters.sqlFilter.conditionLabel` in the expression filter.
 *
 * `CodeMirrorExpressionEditor` takes it as its 4th argument and
 * `DefaultExpressionEditor` as its 5th; an {@link ExpressionEditorFactory}
 * gets it as its 3rd.
 */
export interface ExpressionEditorConfig {
  /** Shown while the editor is empty. An empty string shows none. */
  placeholder?: string | undefined;
  /**
   * The editor's accessible name, the text of the label above it. The
   * bundled editors replace an empty one with their default, since an
   * editor without a name is an unnamed text box to a screen reader.
   */
  ariaLabel?: string | undefined;
}

/**
 * Factory function for creating expression editors.
 * Downstream apps provide this to use DefaultExpressionEditor, Monaco or
 * similar. If not provided, CodeMirrorExpressionEditor is used.
 *
 * `config` is the dialog's placeholder and accessible name, in the table's
 * language. Pass it on, as
 * `(c, ctx, config) => new DefaultExpressionEditor(c, ctx, 'dt', undefined, config)`
 * does. A factory written for two arguments still fits this type.
 */
export type ExpressionEditorFactory = (
  container: HTMLElement,
  context: CompletionContext,
  config: ExpressionEditorConfig,
) => ExpressionEditor;
