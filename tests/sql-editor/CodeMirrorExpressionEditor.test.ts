/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { CodeMirrorExpressionEditor } from '@/sql-editor/CodeMirrorExpressionEditor';
import type { CompletionContext } from '@/derived/types';

// CodeMirror requires DOM APIs that jsdom may not fully support
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

describe('CodeMirrorExpressionEditor', () => {
  let container: HTMLElement;
  let context: CompletionContext;
  let editor: CodeMirrorExpressionEditor;

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

  afterEach(() => {
    if (editor) {
      editor.destroy();
    }
    container.remove();
  });

  it('should create the expected DOM structure', () => {
    editor = new CodeMirrorExpressionEditor(container, context);

    expect(editor.element).toBeTruthy();
    expect(editor.element.classList.contains('dt-cm-expr-editor')).toBe(true);
    expect(editor.element.parentElement).toBe(container);

    // Should contain a CodeMirror editor
    const cmEditor = editor.element.querySelector('.cm-editor');
    expect(cmEditor).toBeTruthy();

    // Should contain a hidden error div
    const errorDiv = editor.element.querySelector('.dt-expr-editor-error');
    expect(errorDiv).toBeTruthy();
    expect((errorDiv as HTMLElement).style.display).toBe('none');
  });

  it('should round-trip getValue / setValue', () => {
    editor = new CodeMirrorExpressionEditor(container, context);

    expect(editor.getValue()).toBe('');

    editor.setValue('price * quantity');
    expect(editor.getValue()).toBe('price * quantity');

    editor.setValue('UPPER(name)');
    expect(editor.getValue()).toBe('UPPER(name)');
  });

  it('should show and clear errors via setError', () => {
    editor = new CodeMirrorExpressionEditor(container, context);

    editor.setError('Invalid expression');
    expect(editor.element.classList.contains('dt-cm-expr-editor--error')).toBe(true);
    const errorDiv = editor.element.querySelector('.dt-expr-editor-error') as HTMLElement;
    expect(errorDiv.textContent).toBe('Invalid expression');
    expect(errorDiv.style.display).toBe('');

    editor.setError(null);
    expect(editor.element.classList.contains('dt-cm-expr-editor--error')).toBe(false);
    expect(errorDiv.textContent).toBe('');
    expect(errorDiv.style.display).toBe('none');
  });

  it('should not throw on updateCompletionContext', () => {
    editor = new CodeMirrorExpressionEditor(container, context);

    expect(() => {
      editor.updateCompletionContext({
        columns: [
          { name: 'a', type: 'integer', isDerived: false },
          { name: 'b', type: 'string', isDerived: false },
        ],
      });
    }).not.toThrow();
  });

  it('should remove element from parent on destroy', () => {
    editor = new CodeMirrorExpressionEditor(container, context);
    expect(container.contains(editor.element)).toBe(true);

    editor.destroy();
    expect(container.contains(editor.element)).toBe(false);
  });

  it('should dispatch input event on setValue', () => {
    editor = new CodeMirrorExpressionEditor(container, context);

    let inputFired = false;
    editor.element.addEventListener('input', () => {
      inputFired = true;
    });

    editor.setValue('test');
    expect(inputFired).toBe(true);
  });

  it('should not throw on focus', () => {
    editor = new CodeMirrorExpressionEditor(container, context);
    expect(() => editor.focus()).not.toThrow();
  });

  it('should support custom class prefix', () => {
    editor = new CodeMirrorExpressionEditor(container, context, 'my');

    expect(editor.element.classList.contains('my-cm-expr-editor')).toBe(true);

    editor.setError('error');
    expect(editor.element.classList.contains('my-cm-expr-editor--error')).toBe(true);

    const errorDiv = editor.element.querySelector('.my-expr-editor-error');
    expect(errorDiv).toBeTruthy();
  });
});
