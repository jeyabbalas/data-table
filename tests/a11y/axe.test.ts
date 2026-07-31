/**
 * @vitest-environment jsdom
 *
 * Automated a11y scan of the rendered grid + adjacent surfaces via axe-core.
 * Scoped to the relevant element (not the wider jsdom body) and with
 * color-contrast disabled — jsdom does not implement the layout / color
 * calculations axe needs for contrast checks. Contrast is guarded instead by
 * `tests/styles/contrast.test.ts`, which computes ratios from the token
 * definitions, plus a real-browser axe run (see docs/guides/accessibility.md).
 *
 * Every rule other than color-contrast runs on every scenario, including
 * `aria-required-children`. It used to be disabled for grid scans because the
 * table root carried `role="table"` while also owning the toolbar filter bar
 * and the status live region. The grid is now its own `.dt-grid` element that
 * owns nothing but rowgroups, so the rule applies cleanly — and disabling it
 * is exactly what let the original violation sit unnoticed.
 *
 * Each scenario covers a different UI state — empty, filters applied, sort
 * active, modals open, popovers shown, dark mode, RTL, multi-table.
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
import { HEADER_ROW_INDEX } from '@/table/KeyboardNavigator';
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

async function scan(target: HTMLElement): Promise<void> {
  const rules: Record<string, { enabled: boolean }> = {
    'color-contrast': { enabled: false },
  };

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

  it('reports zero blocking violations before any data is loaded', async () => {
    // The empty shell is not a grid — it renders a "Load data" placeholder
    // and owns no rows, so it must not claim role="grid".
    const state = createTableState();
    const actions = new StateActions(state, mockBridge);
    const tc = new TableContainer(container, state, actions, mockBridge);
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations on a rendered grid (light mode)', async () => {
    const { tc } = buildTable(container);
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations with the cursor on the header row', async () => {
    const { actions, tc } = buildTable(container);
    // aria-activedescendant is only valid if the IDREF resolves — this is the
    // scan that would catch a cursor pointing at a destroyed element.
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'name' });
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
  // Modals
  // ------------------------------------------------------------------

  it('reports zero blocking violations with the export dialog open', async () => {
    const { state } = buildTable(container);
    const dialog = new ExportDialog(state, mockBridge, { messages: defaultStrings });
    document.body.appendChild(dialog.getElement());
    dialog.open();
    await scan(dialog.getElement());
    dialog.close();
    dialog.destroy();
  });

  it('reports zero blocking violations with the SQL filter modal open', async () => {
    const { state, actions } = buildTable(container);
    const modal = new SQLFilterModal(state, actions);
    document.body.appendChild(modal.getElement());
    modal.open();
    await scan(modal.getElement());
    modal.destroy();
  });

  it('reports zero blocking violations with the derived-column modal open', async () => {
    const { state, actions } = buildTable(container);
    const modal = new DerivedColumnModal(state, actions);
    document.body.appendChild(modal.getElement());
    modal.open();
    await scan(modal.getElement());
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
    // Scope to the popover element.
    const popoverEl = document.getElementById(popover.getId());
    expect(popoverEl).toBeTruthy();
    await scan(popoverEl as HTMLElement);
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
    await scan(popoverEl as HTMLElement);
    popover.destroy();
  });
});
