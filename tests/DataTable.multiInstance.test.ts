/**
 * @vitest-environment jsdom
 *
 * Multi-instance DOM ID isolation: when two tables coexist on the same page
 * using the default `classPrefix: 'dt'`, their modal title IDs must differ
 * and their `aria-labelledby` references must resolve inside the correct
 * modal.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { ExportDialog } from '@/export/ExportDialog';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { TableContainer } from '@/table/TableContainer';

vi.mock('@/export/CSVExport', () => ({
  exportFromState: vi.fn().mockResolvedValue(''),
}));
vi.mock('@/export/JSONExport', () => ({
  exportJSONFromState: vi.fn().mockResolvedValue(''),
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
  terminate: vi.fn(),
} as unknown as WorkerBridge;

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe('multi-instance ID isolation', () => {
  let state1: TableState;
  let state2: TableState;
  let actions1: StateActions;
  let actions2: StateActions;

  beforeEach(() => {
    state1 = createTableState();
    state2 = createTableState();
    actions1 = new StateActions(state1, mockBridge);
    actions2 = new StateActions(state2, mockBridge);
    state1.tableName.set('t1');
    state2.tableName.set('t2');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('two ExportDialogs with the same classPrefix and different instanceIds produce distinct title IDs', () => {
    const a = new ExportDialog(state1, mockBridge, { instanceId: 't1-aaaa' });
    const b = new ExportDialog(state2, mockBridge, { instanceId: 't2-bbbb' });
    document.body.appendChild(a.getElement());
    document.body.appendChild(b.getElement());

    const titles = document.querySelectorAll('[id$="-export-title"]');
    expect(titles.length).toBe(2);
    const ids = Array.from(titles).map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('dt-t1-aaaa-export-title');
    expect(ids).toContain('dt-t2-bbbb-export-title');

    // Each dialog's aria-labelledby resolves to its own title, not the other's.
    for (const dialog of [a, b]) {
      const dlgEl = dialog.getElement().querySelector('.dt-export-dialog')!;
      const labelledBy = dlgEl.getAttribute('aria-labelledby')!;
      expect(dialog.getElement().querySelector(`#${labelledBy}`)).not.toBeNull();
    }

    a.destroy();
    b.destroy();
  });

  it('two DerivedColumnModals with different instanceIds produce distinct title IDs', () => {
    const a = new DerivedColumnModal(state1, actions1, { instanceId: 't1-aaaa' });
    const b = new DerivedColumnModal(state2, actions2, { instanceId: 't2-bbbb' });
    document.body.appendChild(a.getElement());
    document.body.appendChild(b.getElement());

    const titles = document.querySelectorAll('[id$="-derived-modal-title"]');
    expect(titles.length).toBe(2);
    const ids = Array.from(titles).map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain('dt-t1-aaaa-derived-modal-title');
    expect(ids).toContain('dt-t2-bbbb-derived-modal-title');

    a.destroy();
    b.destroy();
  });

  it('two TableContainers with default options auto-generate distinct instance ids', () => {
    const host1 = document.createElement('div');
    const host2 = document.createElement('div');
    document.body.appendChild(host1);
    document.body.appendChild(host2);

    const tc1 = new TableContainer(host1, state1, actions1, mockBridge);
    const tc2 = new TableContainer(host2, state2, actions2, mockBridge);

    // The two containers must have distinct resolvedOptions.instanceId.
    // No public getter exists by design; instead, we verify the symptom:
    // lazy-create two derived modals with the instanceId each container
    // actually used, and confirm their DOM IDs differ.
    const m1 = new DerivedColumnModal(state1, actions1, {
      instanceId: (tc1 as unknown as { resolvedOptions: { instanceId: string } })
        .resolvedOptions.instanceId,
    });
    const m2 = new DerivedColumnModal(state2, actions2, {
      instanceId: (tc2 as unknown as { resolvedOptions: { instanceId: string } })
        .resolvedOptions.instanceId,
    });
    document.body.appendChild(m1.getElement());
    document.body.appendChild(m2.getElement());

    const ids = Array.from(
      document.querySelectorAll('[id$="-derived-modal-title"]')
    ).map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^dt-t\d+-[0-9a-f]{4}-derived-modal-title$/);
    }

    m1.destroy();
    m2.destroy();
    tc1.destroy();
    tc2.destroy();
  });
});
