/**
 * @vitest-environment jsdom
 *
 * Automated a11y scan of the rendered grid + adjacent surfaces via axe-core.
 * Scoped to the relevant element (not the wider jsdom body) and with
 * color-contrast disabled — jsdom does not implement the layout / color
 * calculations axe needs for contrast checks, so contrast is verified
 * manually via Lighthouse instead (see docs/guides/accessibility.md).
 *
 * Phase 8 expansion: each scenario covers a different UI state — filters
 * applied, sort active, modals open, popovers shown, dark mode, RTL,
 * multi-table. Modal scenarios re-enable `aria-required-children` since
 * dialogs DO need their required descendants and the rule applies cleanly
 * outside the grid root's toolbar-sibling pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { TableContainer } from '@/table/TableContainer';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import { SQLFilterModal } from '@/filters/SQLFilterModal';
import { DerivedColumnModal } from '@/derived/DerivedColumnModal';
import { ExportDialog } from '@/export/ExportDialog';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { ColumnHeaderTooltipPopover } from '@/table/ColumnHeaderTooltipPopover';
import { defaultStrings } from '@/core/Strings';
import type { ColumnSchema, Filter, SortColumn } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'text', nullable: true, originalType: 'VARCHAR' },
  { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

interface ScanOptions {
  /** Re-enable `aria-required-children` (modals don't need it disabled). */
  strictRequiredChildren?: boolean;
}

async function scan(target: HTMLElement, opts: ScanOptions = {}): Promise<void> {
  const rules: Record<string, { enabled: boolean }> = {
    'color-contrast': { enabled: false },
  };
  if (!opts.strictRequiredChildren) {
    // Default: relax for the table-root toolbar-sibling pattern. Modal
    // scans set strictRequiredChildren=true so the rule runs there.
    rules['aria-required-children'] = { enabled: false };
  }

  const results = await axe.run(target, { rules, resultTypes: ['violations'] });

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  if (blocking.length > 0) {
    const detail = blocking
      .map(
        (v) =>
          `${v.id} (${v.impact}): ${v.description}\n` +
          v.nodes
            .map((n) => `  target=${n.target.join(',')}\n  failureSummary=${n.failureSummary}`)
            .join('\n'),
      )
      .join('\n');
    throw new Error(`axe reported ${blocking.length} blocking violation(s):\n${detail}`);
  }
  expect(blocking).toEqual([]);
}

function buildTable(host: HTMLElement): {
  state: ReturnType<typeof createTableState>;
  actions: StateActions;
  tc: TableContainer;
} {
  const state = createTableState();
  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.totalRows.set(25);
  state.tableName.set('test_table');
  const actions = new StateActions(state, mockBridge);
  const tc = new TableContainer(host, state, actions, mockBridge);
  return { state, actions, tc };
}

describe('a11y: axe-core grid scan', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('reports zero blocking violations on a rendered grid (light mode)', async () => {
    const { tc } = buildTable(container);
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations on a rendered grid (dark mode)', async () => {
    const { tc } = buildTable(container);
    tc.getElement().setAttribute('data-dt-color-scheme', 'dark');
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations with active filters', async () => {
    const { state, tc } = buildTable(container);
    const filters: Filter[] = [
      { type: 'point', column: 'id', value: 1 },
      { type: 'range', column: 'score', min: 0, max: 100, maxInclusive: true },
    ];
    state.filters.set(filters);
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations with sort active', async () => {
    const { state, tc } = buildTable(container);
    const sortColumns: SortColumn[] = [
      { column: 'score', direction: 'desc' },
      { column: 'name', direction: 'asc' },
    ];
    state.sortColumns.set(sortColumns);
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations with two tables on the page', async () => {
    const { tc: tc1 } = buildTable(container);
    const second = document.createElement('div');
    document.body.appendChild(second);
    const { tc: tc2 } = buildTable(second);
    // Scan the document body so axe sees both grid roots.
    await scan(document.body);
    tc1.destroy();
    tc2.destroy();
  });

  it('reports zero blocking violations on the rendered grid with dir="rtl"', async () => {
    const { tc } = buildTable(container);
    tc.getElement().setAttribute('dir', 'rtl');
    await scan(tc.getElement());
    tc.destroy();
  });

  // ------------------------------------------------------------------
  // Modals — `aria-required-children` is re-enabled for these scans.
  // ------------------------------------------------------------------

  it('reports zero blocking violations with the export dialog open', async () => {
    const { state } = buildTable(container);
    const dialog = new ExportDialog(state, mockBridge, { messages: defaultStrings });
    document.body.appendChild(dialog.getElement());
    dialog.open();
    await scan(dialog.getElement(), { strictRequiredChildren: true });
    dialog.close();
    dialog.destroy();
  });

  it('reports zero blocking violations with the SQL filter modal open', async () => {
    const { state, actions } = buildTable(container);
    const modal = new SQLFilterModal(state, actions);
    document.body.appendChild(modal.getElement());
    modal.open();
    await scan(modal.getElement(), { strictRequiredChildren: true });
    modal.destroy();
  });

  it('reports zero blocking violations with the derived-column modal open', async () => {
    const { state, actions } = buildTable(container);
    const modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    modal.open();
    await scan(modal.getElement(), { strictRequiredChildren: true });
    modal.destroy();
  });

  // ------------------------------------------------------------------
  // Popovers (tooltip-role; no focus trap by design).
  // ------------------------------------------------------------------

  it('reports zero blocking violations with an annotation popover shown', async () => {
    const anchor = document.createElement('div');
    anchor.tabIndex = 0;
    document.body.appendChild(anchor);
    const popover = new AnnotationPopover();
    popover.show(anchor, [
      {
        id: '01abcdefghijklmnopqrstuvwx',
        scope: 'row' as const,
        rowId: 0,
        severity: 'error',
        message: 'value 200 exceeds maximum 150',
      },
    ]);
    // Scope to the popover element — the table-root toolbar-sibling
    // pattern (intentionally relaxed elsewhere) lives outside the popover.
    const popoverEl = document.getElementById(popover.getId());
    expect(popoverEl).toBeTruthy();
    await scan(popoverEl as HTMLElement, { strictRequiredChildren: true });
    popover.destroy();
  });

  it('reports zero blocking violations with a column-header tooltip shown', async () => {
    const anchor = document.createElement('div');
    anchor.tabIndex = 0;
    document.body.appendChild(anchor);
    const popover = new ColumnHeaderTooltipPopover();
    popover.show(anchor, {
      title: 'Score',
      description: 'Final score',
      items: [{ label: 'Units', value: 'pts' }],
    });
    const popoverEl = popover.getElement();
    expect(popoverEl).toBeTruthy();
    await scan(popoverEl as HTMLElement, { strictRequiredChildren: true });
    popover.destroy();
  });
});
