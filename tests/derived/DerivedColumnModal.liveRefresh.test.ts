/**
 * @vitest-environment jsdom
 *
 * Phase 8 — A3 contract (DerivedColumnModal): same live-autocomplete
 * refresh as SQLFilterModal — see tests/filters/SQLFilterModal.liveRefresh.test.ts
 * for the discussion. The two modals share the wireLiveCompletionContext helper.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { createTableState } from '@/core/State';
import type { TableState } from '@/core/State';
import type { StateActions } from '@/core/Actions';
import type { ExpressionEditor } from '@/derived/ExpressionEditorTypes';
import type { CompletionContext } from '@/derived/types';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

interface MockEditor extends ExpressionEditor {
  readonly updateCalls: CompletionContext[];
}

function makeMockEditor(container: HTMLElement, initial: CompletionContext): MockEditor {
  const el = document.createElement('div');
  el.className = 'mock-editor';
  container.appendChild(el);
  const updateCalls: CompletionContext[] = [];
  let value = '';
  return {
    element: el,
    getValue: () => value,
    setValue: (v) => {
      value = v;
    },
    focus: () => {},
    setError: () => {},
    updateCompletionContext: (ctx) => {
      updateCalls.push(ctx);
    },
    destroy: () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    get updateCalls() {
      return updateCalls;
    },
  };
}

function createMockActions(state: TableState): StateActions {
  return {
    validateExpression: vi.fn().mockResolvedValue({ valid: true, type: 'DOUBLE' }),
    addDerivedColumn: vi
      .fn()
      .mockResolvedValue({ success: true, column: { name: 'd', type: 'float' } }),
    getCompletionContext: vi.fn(() => ({
      columns: state.schema.get().map((c) => ({
        name: c.name,
        type: c.originalType ?? c.type,
        isDerived: c.isDerived ?? false,
      })),
      functions: [],
    })),
  } as unknown as StateActions;
}

describe('DerivedColumnModal — A3 (Phase 8) live autocomplete refresh', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: DerivedColumnModal;
  let editorRef: MockEditor | null;

  beforeEach(() => {
    state = createTableState();
    state.schema.set([{ name: 'a', type: 'integer', originalType: 'INTEGER' }]);
    state.totalRows.set(1);
    state.tableName.set('t');
    actions = createMockActions(state);
    editorRef = null;
    modal = new DerivedColumnModal(state, actions, {
      editorFactory: (container, ctx) => {
        editorRef = makeMockEditor(container, ctx);
        return editorRef;
      },
    });
    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
    document.body.innerHTML = '';
  });

  it('refreshes autocomplete on derived-column add while open', async () => {
    modal.open();
    expect(editorRef).not.toBeNull();
    const editor = editorRef!;
    const before = editor.updateCalls.length;

    state.derivedColumns.set([{ kind: 'expression', name: 'a_doubled', expression: 'a * 2' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBeGreaterThan(before);
  });

  it('debounces multiple synchronous mutations', async () => {
    modal.open();
    const editor = editorRef!;
    const before = editor.updateCalls.length;

    state.schema.set([{ name: 'p', type: 'float', originalType: 'DOUBLE' }]);
    state.schema.set([{ name: 'q', type: 'float', originalType: 'DOUBLE' }]);
    state.derivedColumns.set([{ kind: 'expression', name: 'd', expression: '1' }]);

    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length - before).toBe(1);
  });

  it('does not dispatch updates after close', async () => {
    modal.open();
    const editor = editorRef!;
    modal.close();
    const calls = editor.updateCalls.length;

    state.schema.set([{ name: 'late', type: 'integer', originalType: 'INTEGER' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBe(calls);
  });
});
