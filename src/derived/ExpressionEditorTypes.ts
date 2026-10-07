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
 * Factory function for creating expression editors.
 * Downstream apps provide this to use DefaultExpressionEditor, Monaco or
 * similar. If not provided, CodeMirrorExpressionEditor is used.
 *
 * The factory gets no `messages`: an editor it builds takes its placeholder
 * and accessible name from the factory, not from the table's strings.
 */
export type ExpressionEditorFactory = (
  container: HTMLElement,
  context: CompletionContext,
) => ExpressionEditor;
