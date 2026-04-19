/**
 * @vitest-environment jsdom
 *
 * Phase 9: strictBrowserCheck opts createDataTable into a fail-fast probe
 * of the browser APIs the library actually requires. When off (default),
 * the probe is not called.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
} from 'vitest';
import { createDataTable } from '@/index';
import { WorkerInitError } from '@/core/errors';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';

// jsdom does not expose Worker or indexedDB as globals. Install minimal stubs
// so `checkBrowserSupport()` sees a supported environment on the happy path.
// Individual tests that want to simulate a missing API delete its global just
// around the assertion.
beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.Worker === 'undefined') {
    g.Worker = class {
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    } as unknown;
  }
  if (typeof g.indexedDB === 'undefined') {
    g.indexedDB = {} as unknown;
  }
  if (typeof g.structuredClone === 'undefined') {
    g.structuredClone = ((v: unknown) => v) as unknown;
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

function mountContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('createDataTable — strictBrowserCheck (Phase 9)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('strictBrowserCheck: true resolves when every required API is present', async () => {
    const container = mountContainer();
    const table = await createDataTable({
      container,
      bridge: makeBridge(),
      strictBrowserCheck: true,
      persistence: { sessionStore: makeSessionStore() },
      presets: false,
      undoRedo: false,
      expressionFilter: false,
      visualizations: false,
      exportDialog: false,
    });
    expect(table).toBeDefined();
    expect(table.isDestroyed()).toBe(false);
    await table.destroy();
  });

  it('strictBrowserCheck: true rejects with WorkerInitError when ResizeObserver is missing', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originalRO = g.ResizeObserver;
    delete g.ResizeObserver;

    const container = mountContainer();
    const bridge = makeBridge();
    let caught: unknown;
    try {
      await createDataTable({
        container,
        bridge,
        strictBrowserCheck: true,
      });
    } catch (err) {
      caught = err;
    } finally {
      g.ResizeObserver = originalRO;
    }

    expect(caught).toBeInstanceOf(WorkerInitError);
    const typed = caught as WorkerInitError;
    expect(typed.code).toBe('WORKER_UNSUPPORTED');
    expect((typed.details as { missing: string[] }).missing).toContain(
      'ResizeObserver',
    );
    // Fail-fast: the bridge must not have been initialized.
    expect(bridge.initialize).not.toHaveBeenCalled();
  });

  it('strictBrowserCheck omitted: createDataTable does not throw from the probe when an API is missing', async () => {
    // With strictBrowserCheck off, missing APIs must not cause the probe
    // throw — a real failure would surface later via the bridge / DOM.
    const g = globalThis as unknown as Record<string, unknown>;
    const originalRO = g.ResizeObserver;
    delete g.ResizeObserver;

    const container = mountContainer();
    const bridge = makeBridge();

    let caught: unknown;
    let table: Awaited<ReturnType<typeof createDataTable>> | undefined;
    try {
      table = await createDataTable({
        container,
        bridge,
        persistence: { sessionStore: makeSessionStore() },
        presets: false,
        undoRedo: false,
        expressionFilter: false,
        visualizations: false,
        exportDialog: false,
      });
    } catch (err) {
      caught = err;
    } finally {
      g.ResizeObserver = originalRO;
    }

    // If anything threw, it was NOT our WORKER_UNSUPPORTED probe.
    if (caught) {
      expect(caught).not.toBeInstanceOf(WorkerInitError);
    } else {
      expect(table).toBeDefined();
      await table!.destroy();
    }
  });
});
