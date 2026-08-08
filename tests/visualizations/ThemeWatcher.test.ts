/**
 * @vitest-environment jsdom
 *
 * Phase 2 §4.6 — one `data-dt-color-scheme` MutationObserver per DataTable
 * instead of one per visualization (the WIDE baseline measured 1,001 live
 * observers with viz on versus 1 with it off).
 *
 * Mirrors `WindowListenerManager`'s contract: the real observer attaches with
 * the first listener and detaches with the last, so an idle table costs
 * nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeWatcher } from '@/visualizations/ThemeWatcher';

function makeRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'dt-root';
  document.body.appendChild(root);
  return root;
}

/** MutationObserver callbacks land in a microtask. */
function flushMutations(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

let watchers: ThemeWatcher[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  watchers = [];
});

afterEach(() => {
  for (const w of watchers) w.destroy();
  watchers = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function makeWatcher(root: HTMLElement): ThemeWatcher {
  const w = new ThemeWatcher(root);
  watchers.push(w);
  return w;
}

/**
 * Count `MutationObserver` constructions during `fn`. A `vi.spyOn` on the
 * global constructor does not survive `new`, so subclass and swap instead.
 */
function countMutationObservers(fn: () => void): number {
  const Original = globalThis.MutationObserver;
  let created = 0;
  class Counting extends Original {
    constructor(callback: MutationCallback) {
      super(callback);
      created++;
    }
  }
  globalThis.MutationObserver = Counting as unknown as typeof MutationObserver;
  try {
    fn();
    return created;
  } finally {
    globalThis.MutationObserver = Original;
  }
}

describe('ThemeWatcher — observer lifecycle', () => {
  it('attaches no observer until the first listener registers', () => {
    const watcher = makeWatcher(makeRoot());
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);

    watcher.register(() => {});
    expect(watcher.count).toBe(1);
    expect(watcher.isObserving).toBe(true);
  });

  it('keeps exactly one observer no matter how many listeners register', () => {
    const watcher = makeWatcher(makeRoot());

    const created = countMutationObservers(() => {
      for (let i = 0; i < 50; i++) watcher.register(() => {});
    });

    expect(watcher.count).toBe(50);
    expect(created).toBe(1);
  });

  it('detaches the observer only when the last listener unregisters', () => {
    const watcher = makeWatcher(makeRoot());
    const a = () => {};
    const b = () => {};
    watcher.register(a);
    watcher.register(b);

    watcher.unregister(a);
    expect(watcher.count).toBe(1);
    expect(watcher.isObserving).toBe(true);

    watcher.unregister(b);
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);
  });

  it('re-attaches after the set empties and refills', () => {
    const watcher = makeWatcher(makeRoot());
    const a = () => {};
    watcher.register(a);
    watcher.unregister(a);
    expect(watcher.isObserving).toBe(false);

    watcher.register(() => {});
    expect(watcher.isObserving).toBe(true);
  });

  it('deduplicates a listener registered twice', () => {
    const watcher = makeWatcher(makeRoot());
    const listener = () => {};
    watcher.register(listener);
    watcher.register(listener);
    expect(watcher.count).toBe(1);

    watcher.unregister(listener);
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);
  });

  it('ignores unregister of a listener that was never registered', () => {
    const watcher = makeWatcher(makeRoot());
    const registered = () => {};
    watcher.register(registered);

    watcher.unregister(() => {});
    expect(watcher.count).toBe(1);
    expect(watcher.isObserving).toBe(true);
  });
});

describe('ThemeWatcher — notification', () => {
  it('notifies every listener when `data-dt-color-scheme` flips', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const a = vi.fn();
    const b = vi.fn();
    watcher.register(a);
    watcher.register(b);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('notifies on light→dark, dark→light, and attribute removal', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const listener = vi.fn();
    watcher.register(listener);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    root.setAttribute('data-dt-color-scheme', 'light');
    await flushMutations();
    root.removeAttribute('data-dt-color-scheme');
    await flushMutations();

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('ignores unrelated attribute changes on the root', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const listener = vi.fn();
    watcher.register(listener);

    root.setAttribute('class', 'dt-root something-else');
    root.setAttribute('data-other', 'x');
    await flushMutations();

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify an unregistered listener', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const gone = vi.fn();
    const stays = vi.fn();
    watcher.register(gone);
    watcher.register(stays);
    watcher.unregister(gone);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(gone).not.toHaveBeenCalled();
    expect(stays).toHaveBeenCalledTimes(1);
  });

  it('tolerates a listener unregistering itself mid-notification', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const second = vi.fn();
    const first = vi.fn(() => {
      watcher.unregister(first);
    });
    watcher.register(first);
    watcher.register(second);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    // Both ran despite the set mutating during iteration…
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // …and the removal took effect for the next flip.
    root.setAttribute('data-dt-color-scheme', 'light');
    await flushMutations();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('watches only its own root when two tables share a page', async () => {
    const rootA = makeRoot();
    const rootB = makeRoot();
    const watcherA = makeWatcher(rootA);
    const watcherB = makeWatcher(rootB);
    const a = vi.fn();
    const b = vi.fn();
    watcherA.register(a);
    watcherB.register(b);

    rootA.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });
});

describe('ThemeWatcher — destroy', () => {
  it('drops every listener and detaches the observer', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    const listener = vi.fn();
    watcher.register(listener);

    watcher.destroy();
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(listener).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const watcher = makeWatcher(makeRoot());
    watcher.register(() => {});
    watcher.destroy();
    expect(() => watcher.destroy()).not.toThrow();
    expect(watcher.isObserving).toBe(false);
  });

  it('ignores a register() after destroy so it cannot be resurrected', async () => {
    const root = makeRoot();
    const watcher = makeWatcher(root);
    watcher.destroy();

    const listener = vi.fn();
    watcher.register(listener);
    expect(watcher.count).toBe(0);
    expect(watcher.isObserving).toBe(false);

    root.setAttribute('data-dt-color-scheme', 'dark');
    await flushMutations();
    expect(listener).not.toHaveBeenCalled();
  });
});
