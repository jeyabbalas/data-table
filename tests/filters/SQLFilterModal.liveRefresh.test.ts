/**
 * @vitest-environment jsdom
 *
 * Phase 8 — A3 contract: SQLFilterModal subscribes the open editor to
 * state.schema and state.derivedColumns so autocomplete refreshes when
 * the schema changes mid-edit. Microtask debounce so a bulk reconcile
 * collapses to one editor dispatch. Teardown in close() AND destroy().
 *
 * Pre-Phase-8 the modal called actions.getCompletionContext() once at
 * ensureEditor and never refreshed; opening / closing was the only way
 * to pick up newly-added derived columns.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { SQLFilterModal } from '@/filters/SQLFilterModal';
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
    validateSQLFilter: vi.fn().mockResolvedValue({ valid: true, matchCount: 0 }),
    addRawSQLFilter: vi.fn().mockReturnValue('id'),
    updateRawSQLFilter: vi.fn(),
    removeRawSQLFilter: vi.fn(),
    // Derive context from the live signals so the test sees fresh values.
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

describe('SQLFilterModal — A3 (Phase 8) live autocomplete refresh', () => {
  let state: TableState;
  let actions: StateActions;
  let modal: SQLFilterModal;
  let editorRef: MockEditor | null;

  beforeEach(() => {
    state = createTableState();
    state.schema.set([{ name: 'age', type: 'integer', originalType: 'INTEGER' }]);
    actions = createMockActions(state);
    editorRef = null;
    modal = new SQLFilterModal(state, actions, {
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
    const initialCallCount = editor.updateCalls.length;

    state.derivedColumns.set([{ kind: 'expression', name: 'age_doubled', expression: 'age * 2' }]);
    // Drain the microtask debounce.
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBeGreaterThan(initialCallCount);
  });

  it('refreshes autocomplete on schema change while open', async () => {
    modal.open();
    const editor = editorRef!;
    const initialCallCount = editor.updateCalls.length;

    state.schema.set([
      { name: 'age', type: 'integer', originalType: 'INTEGER' },
      { name: 'price', type: 'float', originalType: 'DOUBLE' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBeGreaterThan(initialCallCount);
    const last = editor.updateCalls[editor.updateCalls.length - 1]!;
    expect(last.columns.map((c) => c.name)).toContain('price');
  });

  it('debounces multiple synchronous mutations to one editor dispatch', async () => {
    modal.open();
    const editor = editorRef!;
    const before = editor.updateCalls.length;

    // Three rapid signal sets in the same synchronous tick — should
    // collapse to one queueMicrotask dispatch.
    state.schema.set([{ name: 'a', type: 'integer', originalType: 'INTEGER' }]);
    state.schema.set([{ name: 'b', type: 'integer', originalType: 'INTEGER' }]);
    state.derivedColumns.set([{ kind: 'expression', name: 'd1', expression: '1' }]);

    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length - before).toBe(1);
  });

  it('does not dispatch updates after the modal is closed', async () => {
    modal.open();
    const editor = editorRef!;
    modal.close();
    const calls = editor.updateCalls.length;

    state.schema.set([{ name: 'late', type: 'integer', originalType: 'INTEGER' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBe(calls);
  });

  it('destroying the modal after close is idempotent (no double-unsub)', async () => {
    modal.open();
    modal.close();
    // Re-destroy explicitly (also called in afterEach — confirm idempotent).
    modal.destroy();
    modal.destroy();

    state.schema.set([{ name: 'late', type: 'integer', originalType: 'INTEGER' }]);
    await Promise.resolve();
    // Reaching here without throwing covers the idempotent contract.
    expect(true).toBe(true);
  });

  it('reopening the modal after close re-subscribes the new editor', async () => {
    modal.open();
    modal.close();
    editorRef = null;

    modal.open();
    expect(editorRef).not.toBeNull();
    const editor = editorRef!;
    const before = editor.updateCalls.length;

    state.schema.set([{ name: 'second_open', type: 'integer', originalType: 'INTEGER' }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(editor.updateCalls.length).toBeGreaterThan(before);
  });
});
