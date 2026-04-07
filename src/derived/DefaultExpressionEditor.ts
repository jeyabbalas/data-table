/**
 * DefaultExpressionEditor — built-in textarea implementation of ExpressionEditor.
 *
 * Provides a monospace textarea with error display and column hints.
 * Used when no custom ExpressionEditorFactory is provided.
 */

import type { CompletionContext } from './types';
import type { ExpressionEditor } from './ExpressionEditorTypes';

export class DefaultExpressionEditor implements ExpressionEditor {
  readonly element: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private errorDiv: HTMLElement;
  private contextDiv: HTMLElement;
  private prefix: string;

  constructor(
    container: HTMLElement,
    context: CompletionContext,
    classPrefix = 'dt'
  ) {
    this.prefix = classPrefix;

    // Root container
    this.element = document.createElement('div');

    // Monospace textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = `${this.prefix}-expr-editor-input`;
    this.textarea.rows = 4;
    this.textarea.placeholder = 'Enter SQL expression, e.g. price * quantity';
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = 'off';
    this.element.appendChild(this.textarea);

    // Error display (hidden by default)
    this.errorDiv = document.createElement('div');
    this.errorDiv.className = `${this.prefix}-expr-editor-error`;
    this.errorDiv.style.display = 'none';
    this.element.appendChild(this.errorDiv);

    // Column hints
    this.contextDiv = document.createElement('div');
    this.contextDiv.className = `${this.prefix}-expr-editor-context`;
    this.buildContextText(context);
    this.element.appendChild(this.contextDiv);

    // Mount into container
    container.appendChild(this.element);
  }

  getValue(): string {
    return this.textarea.value;
  }

  setValue(value: string): void {
    this.textarea.value = value;
  }

  focus(): void {
    this.textarea.focus();
  }

  setError(error: string | null): void {
    if (error !== null) {
      this.textarea.classList.add(`${this.prefix}-expr-editor-input--error`);
      this.errorDiv.textContent = error;
      this.errorDiv.style.display = '';
    } else {
      this.textarea.classList.remove(`${this.prefix}-expr-editor-input--error`);
      this.errorDiv.textContent = '';
      this.errorDiv.style.display = 'none';
    }
  }

  updateCompletionContext(context: CompletionContext): void {
    this.buildContextText(context);
  }

  destroy(): void {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  private buildContextText(context: CompletionContext): void {
    if (context.columns.length === 0) {
      this.contextDiv.textContent = '';
      return;
    }
    const cols = context.columns
      .map((c) => `${c.name} (${c.type})`)
      .join(', ');
    this.contextDiv.textContent = `Available columns: ${cols}`;
  }
}
