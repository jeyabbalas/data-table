/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultExpressionEditor } from '@/derived/DefaultExpressionEditor';
import type { CompletionContext } from '@/derived/types';

describe('DefaultExpressionEditor', () => {
  let container: HTMLElement;
  let context: CompletionContext;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    context = {
      columns: [
        { name: 'price', type: 'float', isDerived: false },
        { name: 'quantity', type: 'integer', isDerived: false },
        { name: 'total', type: 'float', isDerived: true },
      ],
    };
  });

  it('should create the expected DOM structure', () => {
    const editor = new DefaultExpressionEditor(container, context);

    expect(editor.element).toBeTruthy();
    expect(editor.element.parentElement).toBe(container);

    const textarea = editor.element.querySelector('.dt-expr-editor-input');
    expect(textarea).toBeTruthy();
    expect(textarea?.tagName).toBe('TEXTAREA');

    const errorDiv = editor.element.querySelector('.dt-expr-editor-error');
    expect(errorDiv).toBeTruthy();
    expect((errorDiv as HTMLElement).style.display).toBe('none');

    const contextDiv = editor.element.querySelector('.dt-expr-editor-context');
    expect(contextDiv).toBeTruthy();

    editor.destroy();
  });

  it('should show column hints from completion context', () => {
    const editor = new DefaultExpressionEditor(container, context);

    const contextDiv = editor.element.querySelector('.dt-expr-editor-context');
    expect(contextDiv?.textContent).toContain('price (float)');
    expect(contextDiv?.textContent).toContain('quantity (integer)');
    expect(contextDiv?.textContent).toContain('total (float)');

    editor.destroy();
  });

  it('should round-trip getValue/setValue correctly', () => {
    const editor = new DefaultExpressionEditor(container, context);

    editor.setValue('price * quantity');
    expect(editor.getValue()).toBe('price * quantity');

    editor.setValue('');
    expect(editor.getValue()).toBe('');

    editor.destroy();
  });

  it('should show error state when setError is called with a message', () => {
    const editor = new DefaultExpressionEditor(container, context);

    editor.setError('Invalid expression');

    const textarea = editor.element.querySelector('.dt-expr-editor-input');
    expect(textarea?.classList.contains('dt-expr-editor-input--error')).toBe(true);

    const errorDiv = editor.element.querySelector('.dt-expr-editor-error') as HTMLElement;
    expect(errorDiv.style.display).not.toBe('none');
    expect(errorDiv.textContent).toBe('Invalid expression');

    editor.destroy();
  });

  it('should clear error state when setError is called with null', () => {
    const editor = new DefaultExpressionEditor(container, context);

    // First set error
    editor.setError('Some error');
    // Then clear it
    editor.setError(null);

    const textarea = editor.element.querySelector('.dt-expr-editor-input');
    expect(textarea?.classList.contains('dt-expr-editor-input--error')).toBe(false);

    const errorDiv = editor.element.querySelector('.dt-expr-editor-error') as HTMLElement;
    expect(errorDiv.style.display).toBe('none');
    expect(errorDiv.textContent).toBe('');

    editor.destroy();
  });

  it('should update context text when updateCompletionContext is called', () => {
    const editor = new DefaultExpressionEditor(container, context);

    editor.updateCompletionContext({
      columns: [
        { name: 'a', type: 'string', isDerived: false },
        { name: 'b', type: 'integer', isDerived: false },
      ],
    });

    const contextDiv = editor.element.querySelector('.dt-expr-editor-context');
    expect(contextDiv?.textContent).toContain('a (string)');
    expect(contextDiv?.textContent).toContain('b (integer)');
    // Old columns should be gone
    expect(contextDiv?.textContent).not.toContain('price');

    editor.destroy();
  });

  it('should handle empty completion context', () => {
    const editor = new DefaultExpressionEditor(container, { columns: [] });

    const contextDiv = editor.element.querySelector('.dt-expr-editor-context');
    expect(contextDiv?.textContent).toBe('');

    editor.destroy();
  });

  it('should focus the textarea on focus()', () => {
    const editor = new DefaultExpressionEditor(container, context);

    editor.focus();

    const textarea = editor.element.querySelector('.dt-expr-editor-input');
    expect(document.activeElement).toBe(textarea);

    editor.destroy();
  });

  it('should remove element from parent on destroy()', () => {
    const editor = new DefaultExpressionEditor(container, context);
    expect(container.contains(editor.element)).toBe(true);

    editor.destroy();
    expect(container.contains(editor.element)).toBe(false);
  });

  it('should support custom class prefix', () => {
    const editor = new DefaultExpressionEditor(container, context, 'my');

    expect(editor.element.querySelector('.my-expr-editor-input')).toBeTruthy();
    expect(editor.element.querySelector('.my-expr-editor-error')).toBeTruthy();
    expect(editor.element.querySelector('.my-expr-editor-context')).toBeTruthy();

    editor.destroy();
  });
});
