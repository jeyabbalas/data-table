/**
 * @vitest-environment jsdom
 *
 * UI feature flags (`expressionFilter`, `presets`, `derivedColumns`) — facade
 * coverage. Each flag must hide its UI affordance but leave the programmatic
 * API intact. The combined-off path is the headless-bundle configuration that
 * lets consumers skip the optional CodeMirror peer dependencies.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import type { WorkerBridge } from '@/data/WorkerBridge';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

async function mountTable(
  overrides: {
    expressionFilter?: boolean;
    presets?: boolean;
    derivedColumns?: boolean;
  } = {},
): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  container.style.height = '400px';
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: false,
    undoRedo: false,
    visualizations: false,
    exportDialog: false,
    ...overrides,
  });
  return { table, container };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('createDataTable — derivedColumns flag', () => {
  it('shows the "+" add-column button by default', async () => {
    const { table, container } = await mountTable();
    expect(container.querySelector('.dt-add-column-btn')).not.toBeNull();
    await table.destroy();
  });

  it('hides the "+" add-column button when derivedColumns: false', async () => {
    const { table, container } = await mountTable({ derivedColumns: false });
    expect(container.querySelector('.dt-add-column-btn')).toBeNull();
    await table.destroy();
  });

  it('still allows programmatic actions.addFilter / removeFilter when derivedColumns: false', async () => {
    const { table } = await mountTable({ derivedColumns: false });
    table.actions.addFilter({ type: 'point', column: 'x', value: 1 });
    expect(table.state.filters.get()).toHaveLength(1);
    table.actions.removeFilter('x');
    expect(table.state.filters.get()).toHaveLength(0);
    await table.destroy();
  });

  it('does not render a derived modal in the DOM when derivedColumns: false', async () => {
    const { table } = await mountTable({ derivedColumns: false });
    // The "+" button never mounts, so the dynamic-import for
    // DerivedColumnModal is unreachable. As a proxy: no backdrop exists.
    expect(document.querySelector('.dt-derived-modal-backdrop')).toBeNull();
    await table.destroy();
  });
});

describe('createDataTable — expressionFilter flag', () => {
  it('shows the "Expression" filter button by default', async () => {
    const { table, container } = await mountTable();
    const btn = container.querySelector('.dt-filter-expression-btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.style.display).not.toBe('none');
    await table.destroy();
  });

  it('hides the "Expression" filter button when expressionFilter: false', async () => {
    const { table, container } = await mountTable({ expressionFilter: false });
    const btn = container.querySelector('.dt-filter-expression-btn') as HTMLButtonElement | null;
    // FilterBar renders the button but applies display:none when the callback
    // is undefined. Either absent or hidden satisfies the contract.
    if (btn) {
      expect(btn.style.display).toBe('none');
    }
    await table.destroy();
  });

  it('renders a programmatically-added raw-SQL filter chip without --clickable label', async () => {
    const { table, container } = await mountTable({ expressionFilter: false });
    table.actions.addFilter({
      type: 'raw-sql',
      id: 'sql1',
      column: '__raw_sql_sql1__',
      sql: 'value > 0',
      label: 'value > 0',
    });

    // Filter bar update is synchronous (signal-driven), but DOM creation may
    // be deferred — flush microtasks to be safe.
    await Promise.resolve();

    const chip = container.querySelector('.dt-filter-chip');
    expect(chip).not.toBeNull();

    const label = chip!.querySelector('.dt-filter-chip-label') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.classList.contains('dt-filter-chip-label--clickable')).toBe(false);

    // Clicking the label must NOT mount the SQL filter modal.
    label.click();
    await Promise.resolve();
    expect(document.querySelector('.dt-sql-filter-modal-backdrop')).toBeNull();

    await table.destroy();
  });

  it('still allows the chip remove (×) button to clear a raw-SQL filter', async () => {
    const { table, container } = await mountTable({ expressionFilter: false });
    table.actions.addFilter({
      type: 'raw-sql',
      id: 'sql2',
      column: '__raw_sql_sql2__',
      sql: 'value > 10',
      label: 'value > 10',
    });
    await Promise.resolve();

    const removeBtn = container.querySelector(
      '.dt-filter-chip-remove',
    ) as HTMLButtonElement | null;
    expect(removeBtn).not.toBeNull();
    removeBtn!.click();
    expect(table.state.filters.get()).toHaveLength(0);

    await table.destroy();
  });
});

describe('createDataTable — presets flag', () => {
  it('shows the "Presets" button by default', async () => {
    const { table, container } = await mountTable();
    const btn = container.querySelector('.dt-filter-presets-btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.style.display).not.toBe('none');
    await table.destroy();
  });

  it('hides the "Presets" button when presets: false', async () => {
    const { table, container } = await mountTable({ presets: false });
    const btn = container.querySelector('.dt-filter-presets-btn') as HTMLButtonElement | null;
    if (btn) {
      expect(btn.style.display).toBe('none');
    }
    await table.destroy();
  });
});

describe('createDataTable — all three UI flags off (headless-bundle config)', () => {
  it('mounts without any of the three lazy-modal buttons', async () => {
    const { table, container } = await mountTable({
      expressionFilter: false,
      presets: false,
      derivedColumns: false,
    });

    expect(container.querySelector('.dt-add-column-btn')).toBeNull();

    const exprBtn = container.querySelector('.dt-filter-expression-btn') as HTMLElement | null;
    if (exprBtn) expect(exprBtn.style.display).toBe('none');

    const presetsBtn = container.querySelector('.dt-filter-presets-btn') as HTMLElement | null;
    if (presetsBtn) expect(presetsBtn.style.display).toBe('none');

    await table.destroy();
  });

  it('does not mount any of the lazy modals in document.body', async () => {
    const { table } = await mountTable({
      expressionFilter: false,
      presets: false,
      derivedColumns: false,
    });

    // Drive programmatic mutations that, in the full-UI build, would normally
    // be triggered by clicking the buttons. The lazy-import code path is
    // unreachable, so no modal backdrops should appear in the DOM.
    table.actions.addFilter({
      type: 'raw-sql',
      id: 'sql3',
      column: '__raw_sql_sql3__',
      sql: '1 = 1',
      label: '1 = 1',
    });
    await Promise.resolve();

    expect(document.querySelector('.dt-sql-filter-modal-backdrop')).toBeNull();
    expect(document.querySelector('.dt-derived-modal-backdrop')).toBeNull();
    expect(document.querySelector('.dt-filter-preset-panel')).toBeNull();

    await table.destroy();
  });
});
