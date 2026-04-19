import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from '@/core/EventEmitter';

interface TestEvents {
  a: { v: number };
  b: { w: string };
}

describe('EventEmitter — listener error handling (Phase 2)', () => {
  let consoleErr: ReturnType<typeof vi.spyOn>;
  // Capture microtask re-throws so they don't leak as unhandled exceptions
  // and fail unrelated tests. Each test asserts on `captured` as needed.
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

  it('continues invoking subsequent listeners when one throws', async () => {
    const emitter = new EventEmitter<TestEvents>();
    const first = vi.fn(() => {
      throw new Error('boom');
    });
    const second = vi.fn();
    emitter.on('a', first);
    emitter.on('a', second);

    emitter.emit('a', { v: 1 });

    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ v: 1 });
    await flushMicrotasks();
  });

  it('routes listener errors to onListenerError with (err, event)', async () => {
    const handler = vi.fn();
    const emitter = new EventEmitter<TestEvents>(handler);
    const err = new Error('boom');
    emitter.on('a', () => {
      throw err;
    });

    emitter.emit('a', { v: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(err, 'a');
    // No microtask re-throw when onListenerError is supplied.
    await flushMicrotasks();
    expect(captured).toEqual([]);
  });

  it('without onListenerError: console.error is called AND error re-thrown in microtask', async () => {
    const emitter = new EventEmitter<TestEvents>();
    const err = new Error('boom');
    emitter.on('a', () => {
      throw err;
    });

    emitter.emit('a', { v: 1 });

    await flushMicrotasks();

    expect(consoleErr).toHaveBeenCalled();
    expect(captured).toContain(err);
  });

  it('does not recurse when onListenerError itself throws', async () => {
    const metaErr = new Error('meta');
    const handler = vi.fn(() => {
      throw metaErr;
    });
    const emitter = new EventEmitter<TestEvents>(handler);
    emitter.on('a', () => {
      throw new Error('boom');
    });

    // Should not throw synchronously.
    emitter.emit('a', { v: 1 });

    await flushMicrotasks();

    // onListenerError was called exactly once (no recursion).
    expect(handler).toHaveBeenCalledTimes(1);
    // Its own error was routed to a microtask throw.
    expect(captured).toContain(metaErr);
  });

  it('tolerates listener set mutation during emit (off inside handler)', () => {
    const emitter = new EventEmitter<TestEvents>();
    const second = vi.fn();
    const first = vi.fn(() => {
      emitter.off('a', second);
    });
    emitter.on('a', first);
    emitter.on('a', second);

    // Iterating the snapshot means `second` still runs for this emit.
    emitter.emit('a', { v: 1 });

    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();

    emitter.emit('a', { v: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
