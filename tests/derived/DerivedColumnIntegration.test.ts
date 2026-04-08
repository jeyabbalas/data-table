/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer } from '@/table/TableContainer';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Verify all derived column exports from the library index
import {
  DerivedColumnManager,
  DefaultExpressionEditor,
  DerivedColumnEditPanel,
  DerivedColumnModal,
  AddColumnButton,
} from '@/index';
import type {
  DerivedColumnKind,
  VectorDataType,
  ExpressionColumnDef,
  VectorColumnDef,
  DerivedColumnDef,
  DerivedColumnInfo,
  CompletionContext,
  ExpressionEditor,
  ExpressionEditorFactory,
  DerivedColumnEditPanelOptions,
  DerivedColumnModalOptions,
  AddColumnButtonOptions,
} from '@/index';

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observedElements: Set<Element> = new Set();
  static instances: MockResizeObserver[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observedElements.add(element);
  }

  unobserve(element: Element): void {
    this.observedElements.delete(element);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  static clearInstances(): void {
    MockResizeObserver.instances = [];
  }
}

const testSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'value', type: 'float', nullable: true, originalType: 'DOUBLE' },
];

beforeEach(() => {
  MockResizeObserver.clearInstances();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.clearInstances();
});

describe('Derived Column Library Exports', () => {
  it('exports all derived column classes', () => {
    expect(DerivedColumnManager).toBeDefined();
    expect(DefaultExpressionEditor).toBeDefined();
    expect(DerivedColumnEditPanel).toBeDefined();
    expect(DerivedColumnModal).toBeDefined();
    expect(AddColumnButton).toBeDefined();
  });

  it('exports DerivedColumnManager as a class with expected methods', () => {
    expect(typeof DerivedColumnManager).toBe('function');
    expect(DerivedColumnManager.prototype.addColumn).toBeDefined();
    expect(DerivedColumnManager.prototype.removeColumn).toBeDefined();
    expect(DerivedColumnManager.prototype.updateColumn).toBeDefined();
    expect(DerivedColumnManager.prototype.validateExpression).toBeDefined();
    expect(DerivedColumnManager.prototype.getEffectiveTableName).toBeDefined();
    expect(DerivedColumnManager.prototype.destroy).toBeDefined();
  });

  it('exports DefaultExpressionEditor as a class with ExpressionEditor interface', () => {
    expect(typeof DefaultExpressionEditor).toBe('function');
    expect(DefaultExpressionEditor.prototype.getValue).toBeDefined();
    expect(DefaultExpressionEditor.prototype.setValue).toBeDefined();
    expect(DefaultExpressionEditor.prototype.focus).toBeDefined();
    expect(DefaultExpressionEditor.prototype.setError).toBeDefined();
    expect(DefaultExpressionEditor.prototype.destroy).toBeDefined();
  });

  it('exports AddColumnButton as a class', () => {
    expect(typeof AddColumnButton).toBe('function');
    expect(AddColumnButton.prototype.getElement).toBeDefined();
    expect(AddColumnButton.prototype.destroy).toBeDefined();
  });
});

describe('TableContainer showAddColumnButton option', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state = createTableState();
  });

  afterEach(() => {
    container.remove();
  });

  it('shows add column button by default when actions are provided', () => {
    const mockActions = {} as any;
    const tc = new TableContainer(container, state, mockActions, undefined);
    const btn = container.querySelector('.dt-add-column-btn');
    expect(btn).not.toBeNull();
    tc.destroy();
  });

  it('hides add column button when showAddColumnButton is false', () => {
    const mockActions = {} as any;
    const tc = new TableContainer(container, state, mockActions, undefined, {
      showAddColumnButton: false,
    });
    const btn = container.querySelector('.dt-add-column-btn');
    expect(btn).toBeNull();
    tc.destroy();
  });

  it('does not show add column button when no actions provided', () => {
    const tc = new TableContainer(container, state);
    const btn = container.querySelector('.dt-add-column-btn');
    expect(btn).toBeNull();
    tc.destroy();
  });
});

describe('TableContainer editorFactory option', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state = createTableState();
  });

  afterEach(() => {
    container.remove();
  });

  it('accepts editorFactory option without errors', () => {
    const mockFactory: ExpressionEditorFactory = vi.fn();
    const mockActions = {} as any;
    expect(() => {
      const tc = new TableContainer(container, state, mockActions, undefined, {
        editorFactory: mockFactory,
      });
      tc.destroy();
    }).not.toThrow();
  });
});

describe('TableContainer modal close on schema change', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state = createTableState();
    // Initialize with test schema
    state.tableName.set('test_table');
    state.schema.set(testSchema);
    initializeColumnsFromSchema(state, testSchema);
  });

  afterEach(() => {
    // Clean up any modals appended to document.body
    document.querySelectorAll('.dt-derived-modal-backdrop').forEach((el) => el.remove());
    container.remove();
  });

  it('closes derived modal when schema changes (simulating data reload)', () => {
    const mockActions = {
      addDerivedColumn: vi.fn().mockResolvedValue({ success: true }),
      validateExpression: vi.fn().mockResolvedValue({ valid: true, type: 'float', originalType: 'DOUBLE' }),
      getCompletionContext: vi.fn().mockReturnValue({ columns: [] }),
    } as any;

    const tc = new TableContainer(container, state, mockActions, undefined);

    // Trigger the add column button click to create and open the modal
    const addBtn = container.querySelector('.dt-add-column-btn') as HTMLButtonElement;
    expect(addBtn).not.toBeNull();
    addBtn.click();

    // Modal should be open (appended to document.body)
    const backdrop = document.querySelector('.dt-derived-modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop!.classList.contains('dt-derived-modal-backdrop--open')).toBe(true);

    // Simulate schema change (data reload)
    state.schema.set([
      { name: 'col_a', type: 'string', nullable: false, originalType: 'VARCHAR' },
    ]);

    // Modal should be closed
    expect(backdrop!.classList.contains('dt-derived-modal-backdrop--open')).toBe(false);

    tc.destroy();
  });
});
