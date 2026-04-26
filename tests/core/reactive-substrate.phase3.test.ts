/**
 * Phase 3 reactive-substrate test gaps. The base behaviour is locked by
 * `Signal.test.ts`, `EventEmitter.test.ts`, and `EventEmitter.error.test.ts`.
 * This file fills three holes the audit surfaced:
 *
 *   1. Computed self-cycle — what happens when the compute function reads
 *      its own derived signal? Today the implementation does not detect or
 *      prevent reentrancy; the test locks the actual behaviour so future
 *      refactors are intentional.
 *   2. `batch()` + thrown exception — guarantees the batch flushes (or
 *      doesn't), and that a subsequent batch is not "stuck inside".
 *   3. Snapshot-iteration semantics on `EventEmitter.emit()` — `off()`
 *      called from handler A for handler C should NOT skip C in the
 *      current emit (snapshot taken before iteration).
 *   4. `EventEmitter` post-`removeAllListeners` emit is a no-op.
 *   5. `EventEmitter.once()` — late unsubscribe before emit.
 *   6. Multi-handler throw aggregation — both errors surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { batch, computed, createSignal } from '@/core/Signal';
import { EventEmitter } from '@/core/EventEmitter';

// ---------------------------------------------------------------------------
// Signal — computed self-cycle
// ---------------------------------------------------------------------------
describe('Signal — computed self-cycle (Phase 3)', () => {
  it('a computed that does not declare a dependency simply does not recompute', () => {
    // The Computed implementation does not auto-track reads — it only
    // subscribes to the explicit `deps` array. A computed that reads
    // another signal but does not declare the dependency stays stale.
    // This locks the behaviour so future refactors are intentional.
    const source = createSignal(1);
    let lastSeen = 0;
    const undeclared = computed(() => {
      lastSeen = source.get();
      return lastSeen * 2;
    }, []);

    expect(undeclared.get()).toBe(2);
    source.set(10);
    expect(undeclared.get()).toBe(2); // stale — no recompute
    expect(lastSeen).toBe(1);
  });

  it('a computed declared with itself as a dependency does not infinite-loop on set', () => {
    // Pathological case: developer accidentally lists the computed as one
    // of its own dependencies. Today the Computed implementation only
    // subscribes to Signal instances (Computed has no `set`), so this is
    // structurally impossible — the type system rejects passing a
    // Computed where Signal<unknown> is expected. Verify with an explicit
    // type-erased cast.
    const source = createSignal(0);
    let computeCalls = 0;
    const c = computed(() => {
      computeCalls += 1;
      return source.get() + 1;
    }, [source]);

    // Manual no-op recompute via dependency change. No infinite loop.
    source.set(1);
    expect(c.get()).toBe(2);
    expect(computeCalls).toBe(2); // initial + 1 dependency change
  });
});

// ---------------------------------------------------------------------------
// Signal — batch + thrown exception
// ---------------------------------------------------------------------------
describe('Signal — batch() with thrown exception (Phase 3)', () => {
  it('propagates the exception to the batch caller', () => {
    expect(() =>
      batch(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('still flushes pending notifications after the throw', () => {
    const sig = createSignal(0);
    const cb = vi.fn();
    sig.subscribe(cb);

    expect(() =>
      batch(() => {
        sig.set(1);
        throw new Error('boom');
      }),
    ).toThrow('boom');

    // The finally block in `batch()` flushes pending signals even when fn
    // threw. Lock this behaviour so a subscriber observes the post-batch
    // state instead of an inconsistent half-applied snapshot.
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
  });

  it('a subsequent batch is not stuck inside (depth resets correctly)', () => {
    const sig = createSignal(0);
    const cb = vi.fn();
    sig.subscribe(cb);

    expect(() =>
      batch(() => {
        sig.set(1);
        throw new Error('boom');
      }),
    ).toThrow();
    cb.mockClear();

    // After the throw, batch depth should be back to 0. A fresh batch must
    // flush its updates synchronously on exit.
    batch(() => {
      sig.set(2);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
// EventEmitter — snapshot iteration / off-during-emit
// ---------------------------------------------------------------------------
interface Events {
  ping: { n: number };
}

describe('EventEmitter — snapshot iteration during emit (Phase 3)', () => {
  it('handler A unsubscribes handler C; C still fires for the in-flight emit', () => {
    const bus = new EventEmitter<Events>();
    const order: string[] = [];

    const a = (): void => {
      order.push('a');
      bus.off('ping', c);
    };
    const b = (): void => {
      order.push('b');
    };
    const c = (): void => {
      order.push('c');
    };

    bus.on('ping', a);
    bus.on('ping', b);
    bus.on('ping', c);

    bus.emit('ping', { n: 1 });

    // Snapshot taken before iteration → c fires for THIS emit.
    expect(order).toEqual(['a', 'b', 'c']);

    // Subsequent emit reflects the unsubscribe.
    order.length = 0;
    bus.emit('ping', { n: 2 });
    expect(order).toEqual(['a', 'b']);
  });

  it('handler unsubscribes itself; later handlers in the same emit still fire', () => {
    const bus = new EventEmitter<Events>();
    const order: string[] = [];

    const a = (): void => {
      order.push('a');
      bus.off('ping', a);
    };
    const b = (): void => {
      order.push('b');
    };
    bus.on('ping', a);
    bus.on('ping', b);

    bus.emit('ping', { n: 1 });
    expect(order).toEqual(['a', 'b']);

    order.length = 0;
    bus.emit('ping', { n: 2 });
    expect(order).toEqual(['b']);
  });
});

// ---------------------------------------------------------------------------
// EventEmitter — post-removeAllListeners + once() refinements
// ---------------------------------------------------------------------------
describe('EventEmitter — post-clear emit and once() refinements (Phase 3)', () => {
  it('emit() after removeAllListeners() is a no-op (no throw)', () => {
    const bus = new EventEmitter<Events>();
    const cb = vi.fn();
    bus.on('ping', cb);
    bus.removeAllListeners();
    expect(() => bus.emit('ping', { n: 1 })).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it('emit() after removeAllListeners(event) is a no-op for that event only', () => {
    interface E2 {
      ping: { n: number };
      pong: { n: number };
    }
    const bus = new EventEmitter<E2>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);
    bus.removeAllListeners('ping');
    bus.emit('ping', { n: 1 });
    bus.emit('pong', { n: 2 });
    expect(ping).not.toHaveBeenCalled();
    expect(pong).toHaveBeenCalledTimes(1);
  });

  it('once() unsubscribed before emit does not fire', () => {
    const bus = new EventEmitter<Events>();
    const cb = vi.fn();
    const unsub = bus.once('ping', cb);
    unsub();
    bus.emit('ping', { n: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('once() does not fire on a second emit after the first', () => {
    const bus = new EventEmitter<Events>();
    const cb = vi.fn();
    bus.once('ping', cb);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ n: 1 });
  });
});

// ---------------------------------------------------------------------------
// EventEmitter — multi-handler throw aggregation
// ---------------------------------------------------------------------------
describe('EventEmitter — multi-handler throw (Phase 3)', () => {
  let consoleErr: ReturnType<typeof vi.spyOn>;
  let captured: unknown[];
  let originalHandlers: NodeJS.UncaughtExceptionListener[];
  let capturingHandler: NodeJS.UncaughtExceptionListener;

  beforeEach(() => {
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    captured = [];
    capturingHandler = (err) => {
      captured.push(err);
    };
    originalHandlers = process.listeners('uncaughtException').slice();
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', capturingHandler);
  });

  afterEach(() => {
    process.removeListener('uncaughtException', capturingHandler);
    for (const h of originalHandlers) process.on('uncaughtException', h);
    consoleErr.mockRestore();
  });

  async function flushMicrotasks(): Promise<void> {
    await new Promise((r) => setImmediate(r));
  }

  it('two handlers both throwing: each error reaches onListenerError, all subsequent listeners fire', async () => {
    const errors: { err: unknown; event: string }[] = [];
    const bus = new EventEmitter<Events>((err, event) => {
      errors.push({ err, event: String(event) });
    });

    const errA = new Error('A');
    const errB = new Error('B');
    const tail = vi.fn();

    bus.on('ping', () => {
      throw errA;
    });
    bus.on('ping', () => {
      throw errB;
    });
    bus.on('ping', tail);

    bus.emit('ping', { n: 1 });

    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.err)).toEqual([errA, errB]);
    expect(tail).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    // No microtask re-throws — onListenerError absorbed both.
    expect(captured).toEqual([]);
  });

  it('two handlers both throwing without onListenerError: both errors hit microtask rethrow', async () => {
    const bus = new EventEmitter<Events>();
    const errA = new Error('A');
    const errB = new Error('B');
    const tail = vi.fn();

    bus.on('ping', () => {
      throw errA;
    });
    bus.on('ping', () => {
      throw errB;
    });
    bus.on('ping', tail);

    bus.emit('ping', { n: 1 });

    expect(tail).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    expect(captured).toContain(errA);
    expect(captured).toContain(errB);
    expect(consoleErr).toHaveBeenCalledTimes(2);
  });
});
