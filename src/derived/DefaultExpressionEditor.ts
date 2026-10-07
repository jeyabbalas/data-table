/**
 * DefaultExpressionEditor — built-in textarea implementation of ExpressionEditor.
 *
 * Provides a monospace textarea with error display and column hints. An
 * alternative to the default CodeMirrorExpressionEditor, for an
 * ExpressionEditorFactory.
 */

import { defaultStrings, type Strings } from '../core/Strings';
import type { ExpressionEditor, ExpressionEditorConfig } from './ExpressionEditorTypes';
import type { CompletionContext } from './types';

/**
 * Plain-textarea implementation of {@link ExpressionEditor}: a monospace
 * textarea, an error slot, and a column-hint slot, without SQL-aware
 * autocompletion. The built-in dialogs use `CodeMirrorExpressionEditor`;
 * pass `editorFactory: (c, ctx, config) => new DefaultExpressionEditor(c,
 * ctx, 'dt', undefined, config)` to `createDataTable()` to use this one
 * instead.
 *
 * The optional 4th `messages` constructor argument lets custom factories
 * forward the table's i18n bundle so the placeholder text and the
 * "Available columns:" label localize alongside the rest of the UI.
 * When omitted (the bare-bones `new DefaultExpressionEditor(c, ctx)`
 * call), English defaults apply.
 *
 * The optional 5th, the `config` a factory gets, sets the placeholder and
 * the textarea's accessible name (`aria-label`) for the dialog it opens in;
 * one left out, or an empty name, comes from `messages`
 * (`derived.expressionPlaceholder`, `derived.expressionLabel`).
 */
export class DefaultExpressionEditor implements ExpressionEditor {
  readonly element: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private errorDiv: HTMLElement;
  private contextDiv: HTMLElement;
  private prefix: string;
  private messages: Strings;

  constructor(
    container: HTMLElement,
    context: CompletionContext,
    classPrefix = 'dt',
    messages: Strings = defaultStrings,
    config?: ExpressionEditorConfig,
  ) {
    this.prefix = classPrefix;
    this.messages = messages;

    // Root container
    this.element = document.createElement('div');

    // Monospace textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = `${this.prefix}-expr-editor-input`;
    this.textarea.rows = 4;
    this.textarea.placeholder = config?.placeholder ?? messages.derived.expressionPlaceholder;
    // `||`: an empty label leaves the textarea unnamed; an empty placeholder is fine.
    this.textarea.setAttribute(
      'aria-label',
      config?.ariaLabel ||
        messages.derived.expressionLabel ||
        defaultStrings.derived.expressionLabel,
    );
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
    const cols = context.columns.map((c) => `${c.name} (${c.type})`).join(', ');
    this.contextDiv.textContent = `${this.messages.derived.availableColumnsLabel} ${cols}`;
  }
}
