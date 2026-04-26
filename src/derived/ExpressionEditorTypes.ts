/**
 * Expression Editor Extension Point
 *
 * Defines the interface that custom expression editors must implement.
 * The library provides a default textarea editor (DefaultExpressionEditor).
 * Downstream apps can replace it with CodeMirror, Monaco, or similar.
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
 * Downstream apps provide this to use CodeMirror or similar.
 * If not provided, DefaultExpressionEditor is used.
 */
export type ExpressionEditorFactory = (
  container: HTMLElement,
  context: CompletionContext,
) => ExpressionEditor;
