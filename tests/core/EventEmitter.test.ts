import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '@/core/EventEmitter';

// Define test event types
interface TestEvents {
  'data:loaded': { count: number };
  'filter:changed': { column: string; value: unknown };
  'error': Error;
}

describe('EventEmitter', () => {
  it('should call subscribers when event is emitted', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback = vi.fn();

    emitter.on('data:loaded', callback);
    emitter.emit('data:loaded', { count: 100 });

    expect(callback).toHaveBeenCalledWith({ count: 100 });
  });

  it('should return unsubscribe function from on()', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback = vi.fn();

    const unsubscribe = emitter.on('data:loaded', callback);
    unsubscribe();
    emitter.emit('data:loaded', { count: 100 });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should remove listener with off()', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback = vi.fn();

    emitter.on('data:loaded', callback);
    emitter.off('data:loaded', callback);
    emitter.emit('data:loaded', { count: 100 });

    expect(callback).not.toHaveBeenCalled();
  });

  it('should call once() listener only once', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback = vi.fn();

    emitter.once('data:loaded', callback);
    emitter.emit('data:loaded', { count: 1 });
    emitter.emit('data:loaded', { count: 2 });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ count: 1 });
  });

  it('should support multiple listeners for same event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.on('data:loaded', callback1);
    emitter.on('data:loaded', callback2);
    emitter.emit('data:loaded', { count: 100 });

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('should handle removeAllListeners for specific event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.on('data:loaded', callback1);
    emitter.on('filter:changed', callback2);
    emitter.removeAllListeners('data:loaded');

    emitter.emit('data:loaded', { count: 100 });
    emitter.emit('filter:changed', { column: 'age', value: 25 });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it('should handle removeAllListeners for all events', () => {
    const emitter = new EventEmitter<TestEvents>();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    emitter.on('data:loaded', callback1);
    emitter.on('filter:changed', callback2);
    emitter.removeAllListeners();

    emitter.emit('data:loaded', { count: 100 });
    emitter.emit('filter:changed', { column: 'age', value: 25 });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it('should return correct listenerCount', () => {
    const emitter = new EventEmitter<TestEvents>();

    expect(emitter.listenerCount('data:loaded')).toBe(0);

    const unsub1 = emitter.on('data:loaded', () => {});
    expect(emitter.listenerCount('data:loaded')).toBe(1);

    emitter.on('data:loaded', () => {});
    expect(emitter.listenerCount('data:loaded')).toBe(2);

    unsub1();
    expect(emitter.listenerCount('data:loaded')).toBe(1);
  });
});
