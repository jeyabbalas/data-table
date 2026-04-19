/**
 * @vitest-environment jsdom
 *
 * Verifies ExportDialog's ModalHost wiring: ARIA, focus restore, Escape-close.
 * The full dialog behavior lives in ExportDialog.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportDialog } from '@/export/ExportDialog';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { __resetModalHostForTests } from '@/core/ModalHost';

vi.mock('@/export/CSVExport', () => ({
  exportFromState: vi.fn().mockResolvedValue('a,b\n'),
}));
vi.mock('@/export/JSONExport', () => ({
  exportJSONFromState: vi.fn().mockResolvedValue('[]'),
}));
vi.mock('@/export/ParquetExport', () => ({
  exportParquetFromState: vi.fn().mockResolvedValue(new Uint8Array()),
}));

const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
  destroy: vi.fn(),
  clearQueryCache: vi.fn(),
} as any;

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

describe('ExportDialog — focus + escape', () => {
  let state: TableState;
  let actions: StateActions;
  let dialog: ExportDialog;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    __resetModalHostForTests();
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, schema);
    state.tableName.set('t');

    opener = document.createElement('button');
    opener.textContent = 'open export';
    document.body.appendChild(opener);
    opener.focus();

    dialog = new ExportDialog(state, mockBridge, { instanceId: 'x' });
    document.body.appendChild(dialog.getElement());
  });

  afterEach(() => {
    dialog.destroy();
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  it('applies ARIA on open and strips aria-modal on close', () => {
    dialog.open();
    const inner = dialog.getElement().querySelector('.dt-export-dialog') as HTMLElement;
    expect(inner.getAttribute('role')).toBe('dialog');
    expect(inner.getAttribute('aria-modal')).toBe('true');
    expect(inner.getAttribute('aria-labelledby')).toBe('dt-x-export-title');
    dialog.close();
    expect(inner.getAttribute('aria-modal')).toBeNull();
  });

  it('closes on Escape and restores focus to the opener', () => {
    dialog.open();
    expect(dialog.getIsOpen()).toBe(true);
    const inner = dialog.getElement().querySelector('.dt-export-dialog') as HTMLElement;
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dialog.getIsOpen()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
