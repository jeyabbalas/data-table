/**
 * @vitest-environment jsdom
 *
 * Phase 7 colorScheme contract:
 *   - `colorScheme: 'dark' | 'light'` sets `data-dt-color-scheme` on root.
 *   - `colorScheme: 'auto'` (and omitted) leaves no attribute.
 *   - `setColorScheme(...)` updates the attribute at runtime.
 *   - Invalid values throw ConfigurationError.
 *   - After destroy(), setColorScheme throws DestroyedError.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
} from 'vitest';
import { createDataTable, type DataTable } from '@/index';
import { ConfigurationError, DestroyedError } from '@/core/errors';
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
  colorScheme?: 'light' | 'dark' | 'auto',
): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    undoRedo: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
    ...(colorScheme ? { colorScheme } : {}),
  });
  return { table, container };
}

function getRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector('.dt-root') as HTMLElement | null;
  if (!root) throw new Error('Expected .dt-root to exist');
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('DataTable — colorScheme (Phase 7)', () => {
  describe('initial option', () => {
    it('omitted: no attribute written (defaults to auto)', async () => {
      const { container } = await createTable();
      expect(getRoot(container).hasAttribute('data-dt-color-scheme')).toBe(false);
    });

    it('"auto": no attribute written', async () => {
      const { container } = await createTable('auto');
      expect(getRoot(container).hasAttribute('data-dt-color-scheme')).toBe(false);
    });

    it('"dark": attribute set to "dark"', async () => {
      const { container } = await createTable('dark');
      expect(getRoot(container).getAttribute('data-dt-color-scheme')).toBe('dark');
    });

    it('"light": attribute set to "light"', async () => {
      const { container } = await createTable('light');
      expect(getRoot(container).getAttribute('data-dt-color-scheme')).toBe('light');
    });

    it('invalid value throws ConfigurationError with OPTIONS_INVALID', async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      await expect(
        createDataTable({
          container,
          bridge: makeBridge(),
          persistence: false,
          presets: false,
          undoRedo: false,
          expressionFilter: false,
          visualizations: false,
          exportDialog: false,
          colorScheme: 'midnight' as unknown as 'dark',
        }),
      ).rejects.toMatchObject({
        name: 'ConfigurationError',
        code: 'OPTIONS_INVALID',
      });
    });
  });

  describe('setColorScheme() runtime toggle', () => {
    it('light → dark → auto round trip updates the attribute', async () => {
      const { table, container } = await createTable('light');
      const root = getRoot(container);
      expect(root.getAttribute('data-dt-color-scheme')).toBe('light');

      table.setColorScheme('dark');
      expect(root.getAttribute('data-dt-color-scheme')).toBe('dark');
      expect(table.getColorScheme()).toBe('dark');

      table.setColorScheme('auto');
      expect(root.hasAttribute('data-dt-color-scheme')).toBe(false);
      expect(table.getColorScheme()).toBe('auto');
    });

    it('invalid runtime value throws ConfigurationError, leaves attribute unchanged', async () => {
      const { table, container } = await createTable('dark');
      const root = getRoot(container);
      expect(() =>
        table.setColorScheme('midnight' as unknown as 'dark'),
      ).toThrow(ConfigurationError);
      expect(root.getAttribute('data-dt-color-scheme')).toBe('dark');
    });

    it('throws DestroyedError after destroy()', async () => {
      const { table } = await createTable('auto');
      await table.destroy();
      expect(() => table.setColorScheme('dark')).toThrow(DestroyedError);
    });
  });

  describe('getColorScheme()', () => {
    it('reflects the initial option', async () => {
      const { table: a } = await createTable();
      expect(a.getColorScheme()).toBe('auto');
      const { table: b } = await createTable('dark');
      expect(b.getColorScheme()).toBe('dark');
    });
  });

  // The add-column button is a *sibling* of `.dt-root` inside the flex
  // wrapper (`.dt-table-wrapper`). The attribute must live on the wrapper
  // too so the sibling inherits the attribute-scoped CSS variables — otherwise
  // the `+` button stays light-themed under `setColorScheme('dark')`.
  describe('color-scheme attribute on the table wrapper', () => {
    it('wrapper carries the attribute set by the initial option', async () => {
      const { container } = await createTable('dark');
      const wrapper = container.querySelector(
        '.dt-table-wrapper',
      ) as HTMLElement | null;
      expect(wrapper).not.toBeNull();
      expect(wrapper!.getAttribute('data-dt-color-scheme')).toBe('dark');
    });

    it('setColorScheme updates both root and wrapper in lockstep', async () => {
      const { table, container } = await createTable('light');
      const root = getRoot(container);
      const wrapper = container.querySelector(
        '.dt-table-wrapper',
      ) as HTMLElement | null;
      expect(wrapper).not.toBeNull();

      table.setColorScheme('dark');
      expect(root.getAttribute('data-dt-color-scheme')).toBe('dark');
      expect(wrapper!.getAttribute('data-dt-color-scheme')).toBe('dark');

      table.setColorScheme('auto');
      expect(root.hasAttribute('data-dt-color-scheme')).toBe(false);
      expect(wrapper!.hasAttribute('data-dt-color-scheme')).toBe(false);
    });
  });
});
