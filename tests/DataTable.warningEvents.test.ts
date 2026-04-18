import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '@/core/EventEmitter';
import type { TableEvents } from '@/core/TableEvents';

// End-to-end warning emission (STYLESHEET_MISSING / PERSISTENCE_UNAVAILABLE)
// is verified manually at the demo app. This file pins down:
//
//   1. The event map types correctly so subscribers can narrow on `code`.
//   2. `details` is optional and nullable-friendly.
//   3. `listenerCount('warning')` reflects the current subscriber state —
//      the stylesheet-missing check uses this to decide whether to print
//      the legacy `console.warn` safety net.

describe('warning event — map typing + runtime semantics', () => {
  it('emits with details when provided', () => {
    const emitter = new EventEmitter<TableEvents>();
    const spy = vi.fn();
    emitter.on('warning', spy);
    emitter.emit('warning', {
      code: 'PERSISTENCE_UNAVAILABLE',
      message: 'IndexedDB unavailable',
      details: { reason: 'blocked by user setting' },
    });
    expect(spy).toHaveBeenCalledWith({
      code: 'PERSISTENCE_UNAVAILABLE',
      message: 'IndexedDB unavailable',
      details: { reason: 'blocked by user setting' },
    });
  });

  it('emits without details', () => {
    const emitter = new EventEmitter<TableEvents>();
    const spy = vi.fn();
    emitter.on('warning', spy);
    emitter.emit('warning', {
      code: 'STYLESHEET_MISSING',
      message: 'no stylesheet',
    });
    expect(spy).toHaveBeenCalledWith({
      code: 'STYLESHEET_MISSING',
      message: 'no stylesheet',
    });
  });

  it('listenerCount reflects adds and removes — drives the stylesheet safety-net fallback', () => {
    const emitter = new EventEmitter<TableEvents>();
    expect(emitter.listenerCount('warning')).toBe(0);

    const unsub = emitter.on('warning', () => {});
    expect(emitter.listenerCount('warning')).toBe(1);

    unsub();
    expect(emitter.listenerCount('warning')).toBe(0);
  });
});
