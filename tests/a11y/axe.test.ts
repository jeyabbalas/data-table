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
 * active, modals open, popovers shown, dark mode, RTL, multi-table, and a
 * horizontally windowed body.
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

import { headerFor } from '../helpers/headerDom';
import { rowsFor } from '../helpers/rowFetchBridge';
import { spacerWidths } from '../helpers/tableBodyDom';
import { wideHarnessSchema } from '../helpers/tableBodyHarness';

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

// ------------------------------------------------------------------
// A body that is actually painted, over a windowed column axis.
//
// Every `buildTable` scenario scans a headers-only shell: `mockBridge.query`
// resolves nothing and jsdom reports a 0x0 scroll container, so the
// VirtualScroller's range is empty and not one body row exists. That left the
// whole of `TableBody`'s row DOM invisible to axe — including the two
// constructs column windowing introduced, which have no counterpart anywhere
// else in the widget: `role="presentation"` spacer children of a `role="row"`,
// and body cells whose `aria-colindex` is absolute over `columnOrder` and
// therefore both gapped and not starting at 1.
// ------------------------------------------------------------------

/** 60 columns of the default 150 px — the tier `ColumnWindow` is cut for. */
const WIDE_COLUMN_COUNT = 60;
const WIDE_VIEWPORT_WIDTH = 600;
/** 320 px at the default 32 px rows = 10 visible rows, plus the buffer. */
const WIDE_VIEWPORT_HEIGHT = 320;

const wideSchema: ColumnSchema[] = wideHarnessSchema(WIDE_COLUMN_COUNT);
const wideColumns = wideSchema.map((column) => column.name);

const wideBridge = {
  initialize: vi.fn(),
  // Synthesizes exactly the window the SELECT asked for, whichever SQL shape
  // TableBody emitted — anything shorter trips the rowid fast path's density
  // valve and the body falls back to placeholders, which carry no spacers.
  query: vi.fn(async (sql: string) => rowsFor(sql, wideColumns)),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

/**
 * A mounted `TableContainer` over {@link WIDE_COLUMN_COUNT} columns with rows
 * painted and the column window cut to {@link WIDE_VIEWPORT_WIDTH}.
 *
 * Both stubs are load-bearing and neither is sufficient alone: a zero
 * `clientHeight` leaves the row range empty, and a zero `clientWidth` collapses
 * the column window onto its ten-column floor at offset 0 with no left spacer
 * to ever grow. The second `render()` is what rebuilds the body against the
 * stubbed box — the constructor already built one against jsdom's zeros, and
 * `TableBody` reads the viewport at construction time.
 */
async function buildWideTable(host: HTMLElement): Promise<TableContainer> {
  const state = createTableState();
  state.schema.set(wideSchema);
  initializeColumnsFromSchema(state, wideSchema);
  state.totalRows.set(200);
  state.tableName.set('wide_table');
  const actions = new StateActions(state, wideBridge);
  const tc = new TableContainer(host, state, actions, wideBridge);

  const scroll = tc.getElement().querySelector<HTMLElement>('.dt-body-scroll');
  expect(scroll).not.toBeNull();
  Object.defineProperty(scroll, 'clientHeight', {
    value: WIDE_VIEWPORT_HEIGHT,
    configurable: true,
  });
  Object.defineProperty(scroll, 'clientWidth', { value: WIDE_VIEWPORT_WIDTH, configurable: true });

  // Both axes are told to re-measure, because the box could only be stubbed
  // after construction — `.dt-body-scroll` does not exist before it, and both
  // `TableBody` and the column window read the viewport when they are built.
  //
  // This used to be a second `tc.render()`, which worked only because a render
  // destroyed and rebuilt the whole `TableBody`. It no longer does: a render
  // that changes no schema reconciles instead, and the body it would have
  // thrown away is the one holding the row cache and the scroll offset.
  tc.getTableBody()!.getVirtualScroller().refresh();
  tc.refreshColumnWindow();
  await tc.whenBodyReady();
  return tc;
}

/**
 * The first painted data row, refusing to hand one back unless it is genuinely
 * windowed.
 *
 * A scan of a body that quietly rendered all 60 columns — a stub that did not
 * take, a window that fell back to the whole axis, a placeholder pass — passes
 * axe while proving nothing, and would do so silently forever. This is what
 * makes that impossible.
 */
function windowedRow(tc: TableContainer): HTMLElement {
  const row = tc
    .getElement()
    .querySelector<HTMLElement>('.dt-row[data-row-index]:not([data-placeholder])');
  expect(row).not.toBeNull();
  expect(row!.querySelector('[data-col-spacer="left"]')).not.toBeNull();
  expect(row!.querySelector('[data-col-spacer="right"]')).not.toBeNull();

  const rendered = row!.querySelectorAll('.dt-cell').length;
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(WIDE_COLUMN_COUNT);
  return row!;
}

/** The `aria-colindex` of a row's first rendered cell, as a number. */
function firstColIndex(row: HTMLElement): number {
  const cell = row.querySelector<HTMLElement>('.dt-cell');
  expect(cell).not.toBeNull();
  return Number(cell!.getAttribute('aria-colindex'));
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

  it('reports zero blocking violations in column layout mode (light mode)', async () => {
    const { state, actions, tc } = buildTable(container);
    // Shift+F2 opens the resize / reorder gesture without moving any DOM
    // focus: it toggles a class on the header and writes to a live region.
    // So aria-activedescendant still has to resolve while the mode is open,
    // and the affordance must not have promoted the resize separator into a
    // widget that then owes ARIA its value attributes.
    const column = state.visibleColumns.get()[0]!;
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column });
    tc.getElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', shiftKey: true, bubbles: true }),
    );
    // Named, not "some header somewhere": the scan below is only meaningful if
    // the mode opened on the header the cursor is actually on.
    expect(headerFor(tc.getElement(), column)!.classList.contains('dt-col-header--layout')).toBe(
      true,
    );
    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations in column layout mode (dark mode)', async () => {
    const { state, actions, tc } = buildTable(container);
    tc.getElement().setAttribute('data-dt-color-scheme', 'dark');
    const column = state.visibleColumns.get()[0]!;
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column });
    tc.getElement().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', shiftKey: true, bubbles: true }),
    );
    expect(headerFor(tc.getElement(), column)!.classList.contains('dt-col-header--layout')).toBe(
      true,
    );
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

  it('reports zero blocking violations on a windowed body at scroll offset 0', async () => {
    // The first scenario in this file with any body row in it at all: 15 rows
    // of 14 cells each, against an `aria-colcount` of 60. At rest the window
    // starts at column 0, so the left spacer is empty and the first
    // `aria-colindex` is 1 — what is new here is the right spacer, a
    // `role="presentation"` element sitting as a direct child of a
    // `role="row"` inside a `role="rowgroup"`, and the truncated colindex run
    // that stops long before `aria-colcount`.
    const tc = await buildWideTable(container);
    const row = windowedRow(tc);
    expect(firstColIndex(row)).toBe(1);
    expect(spacerWidths(row).right).toBeGreaterThan(0);

    await scan(tc.getElement());
    tc.destroy();
  });

  it('reports zero blocking violations on a windowed body scrolled off column 0', async () => {
    // The state the pattern is actually novel in: both spacers non-empty and
    // every rendered cell carrying an `aria-colindex` well above 1, so the row
    // neither starts at the first column nor ends at the last. At this offset
    // the window is `[10, 34)` — 24 cells reporting colindex 11…34, between a
    // 1,500 px and a 3,900 px spacer. ARIA prescribes exactly this for a
    // partially rendered row, and it is the one arrangement an
    // `aria-required-children` / colindex check could plausibly object to.
    const tc = await buildWideTable(container);
    const scroll = tc.getElement().querySelector<HTMLElement>('.dt-body-scroll');
    scroll!.scrollLeft = 3000;
    // Synchronous: jsdom dispatches no `scroll` for a programmatic write, and
    // this is what the body's own rAF-throttled listener amounts to anyway.
    tc.getTableBody()?.refreshColumnWindow();

    const row = windowedRow(tc);
    expect(firstColIndex(row)).toBeGreaterThan(1);
    const spacers = spacerWidths(row);
    expect(spacers.left).toBeGreaterThan(0);
    expect(spacers.right).toBeGreaterThan(0);

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
