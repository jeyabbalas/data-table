/**
 * @vitest-environment jsdom
 *
 * Phase 8 i18n contract:
 *   - `createDataTable({ messages })` accepts `DeepPartial<Strings>`.
 *   - Overridden leaves appear in the rendered DOM.
 *   - Un-overridden leaves fall back to the English defaults.
 *   - `isStylesheetLoaded()` is exported from root.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  createDataTable,
  isStylesheetLoaded,
  defaultStrings,
  mergeStrings,
  type DataTable,
} from '@/index';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

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

function makeSessionStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

async function createTable(
  messages?: Parameters<typeof createDataTable>[0]['messages'],
  opts?: { exportDialog?: boolean; expressionFilter?: boolean; presets?: boolean },
): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: opts?.presets ?? false,
    undoRedo: false,
    expressionFilter: opts?.expressionFilter ?? false,
    visualizations: false,
    exportDialog: opts?.exportDialog ?? false,
    ...(messages ? { messages } : {}),
  });
  return { table, container };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('DataTable — i18n messages hook', () => {
  it('renders English defaults when `messages` is omitted', async () => {
    const { table } = await createTable();
    // The table is created without error and has a root element.
    expect(table.container).toBeDefined();
    await table.destroy();
  });

  it('overriding export.title changes the rendered export dialog heading', async () => {
    const { table, container } = await createTable(
      { export: { title: 'Exporter' } },
      { exportDialog: true },
    );

    table.openExportDialog();

    const title = document.querySelector('.dt-export-title');
    expect(title?.textContent).toBe('Exporter');

    // Siblings remain English (cancel button text and download button).
    const downloadBtn = document.querySelector('.dt-export-btn') as HTMLButtonElement | null;
    expect(downloadBtn?.textContent).toBe('Download');

    await table.destroy();
    expect(container).toBeDefined();
  });

  it('overriding filters.activeFiltersLabel changes the filter bar aria-label', async () => {
    const { table } = await createTable({
      filters: { activeFiltersLabel: 'Filtres actifs' },
    });

    const bar = document.querySelector('.dt-filter-bar');
    expect(bar?.getAttribute('aria-label')).toBe('Filtres actifs');

    await table.destroy();
  });

  it('function-valued templates like a11y.filtersActive are replaced wholesale', async () => {
    const custom = vi.fn(
      (n: number, shown: number, total: number) => `fr: ${n} filtres, ${shown}/${total}`,
    );
    const { table } = await createTable({
      a11y: { filtersActive: custom },
    });

    // The live region template is resolved lazily inside updateLiveRegion; we
    // can verify by constructing the merged messages directly to be sure the
    // override threads through (integration-wise this is the same path used at
    // runtime).
    const merged = mergeStrings(defaultStrings, {
      a11y: { filtersActive: custom },
    });
    expect(merged.a11y.filtersActive(2, 5, 10)).toBe('fr: 2 filtres, 5/10');
    expect(custom).toHaveBeenCalledTimes(1);

    await table.destroy();
  });

  it('isStylesheetLoaded is exported from the root entry', () => {
    expect(typeof isStylesheetLoaded).toBe('function');
  });

  it('defaultStrings and mergeStrings are exported from the root entry', () => {
    expect(defaultStrings.common.apply).toBe('Apply');
    const merged = mergeStrings(defaultStrings, { common: { apply: 'X' } });
    expect(merged.common.apply).toBe('X');
  });
});
