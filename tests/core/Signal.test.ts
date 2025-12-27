import { describe, it, expect, vi } from 'vitest';
import { createSignal, computed, batch, type Signal, type Computed } from '@/core/Signal';

describe('Signal', () => {
  describe('createSignal', () => {
    it('should create a signal with initial value', () => {
      const signal = createSignal(42);
      expect(signal.get()).toBe(42);
    });

    it('should create a signal with different types', () => {
      const numSignal = createSignal(0);
      const strSignal = createSignal('hello');
      const objSignal = createSignal({ name: 'test' });
      const arrSignal = createSignal([1, 2, 3]);
      const nullSignal = createSignal<string | null>(null);

      expect(numSignal.get()).toBe(0);
      expect(strSignal.get()).toBe('hello');
      expect(objSignal.get()).toEqual({ name: 'test' });
      expect(arrSignal.get()).toEqual([1, 2, 3]);
      expect(nullSignal.get()).toBeNull();
    });
  });

  describe('get()', () => {
    it('should return the current value', () => {
      const signal = createSignal('initial');
      expect(signal.get()).toBe('initial');
    });

    it('should return updated value after set', () => {
      const signal = createSignal(10);
      signal.set(20);
      expect(signal.get()).toBe(20);
    });
  });

  describe('set()', () => {
    it('should update the value', () => {
      const signal = createSignal(0);
      signal.set(100);
      expect(signal.get()).toBe(100);
    });

    it('should allow setting to the same value (no-op)', () => {
      const signal = createSignal(5);
      signal.set(5);
      expect(signal.get()).toBe(5);
    });

    it('should handle null and undefined', () => {
      const signal = createSignal<string | null | undefined>('value');
      signal.set(null);
      expect(signal.get()).toBeNull();
      signal.set(undefined);
      expect(signal.get()).toBeUndefined();
    });
  });

  describe('subscribe()', () => {
    it('should notify subscribers when value changes', () => {
      const signal = createSignal(0);
      const callback = vi.fn();

      signal.subscribe(callback);
      signal.set(1);

      expect(callback).toHaveBeenCalledWith(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not notify if value unchanged (shallow equality)', () => {
      const signal = createSignal(5);
      const callback = vi.fn();

      signal.subscribe(callback);
      signal.set(5); // Same value

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return working unsubscribe function', () => {
      const signal = createSignal(0);
      const callback = vi.fn();

      const unsubscribe = signal.subscribe(callback);
      signal.set(1);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      signal.set(2);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should support multiple subscribers', () => {
      const signal = createSignal(0);
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      signal.subscribe(callback1);
      signal.subscribe(callback2);
      signal.subscribe(callback3);
      signal.set(10);

      expect(callback1).toHaveBeenCalledWith(10);
      expect(callback2).toHaveBeenCalledWith(10);
      expect(callback3).toHaveBeenCalledWith(10);
    });

    it('should allow unsubscribing individual subscribers', () => {
      const signal = createSignal(0);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsub1 = signal.subscribe(callback1);
      signal.subscribe(callback2);

      unsub1();
      signal.set(1);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith(1);
    });

    it('should handle rapid value changes', () => {
      const signal = createSignal(0);
      const values: number[] = [];

      signal.subscribe((v) => values.push(v));

      signal.set(1);
      signal.set(2);
      signal.set(3);

      expect(values).toEqual([1, 2, 3]);
    });
  });

  describe('subscriberCount()', () => {
    it('should return 0 when no subscribers', () => {
      const signal = createSignal(0);
      expect(signal.subscriberCount()).toBe(0);
    });

    it('should track subscriber count correctly', () => {
      const signal = createSignal(0);

      const unsub1 = signal.subscribe(() => {});
      expect(signal.subscriberCount()).toBe(1);

      const unsub2 = signal.subscribe(() => {});
      expect(signal.subscriberCount()).toBe(2);

      unsub1();
      expect(signal.subscriberCount()).toBe(1);

      unsub2();
      expect(signal.subscriberCount()).toBe(0);
    });
  });
});

describe('Computed', () => {
  describe('computed()', () => {
    it('should compute initial value correctly', () => {
      const count = createSignal(5);
      const doubled = computed(() => count.get() * 2, [count]);

      expect(doubled.get()).toBe(10);
    });

    it('should recompute when dependency changes', () => {
      const count = createSignal(5);
      const doubled = computed(() => count.get() * 2, [count]);

      expect(doubled.get()).toBe(10);
      count.set(10);
      expect(doubled.get()).toBe(20);
    });

    it('should handle multiple dependencies', () => {
      const a = createSignal(2);
      const b = createSignal(3);
      const sum = computed(() => a.get() + b.get(), [a, b]);

      expect(sum.get()).toBe(5);

      a.set(10);
      expect(sum.get()).toBe(13);

      b.set(7);
      expect(sum.get()).toBe(17);
    });

    it('should notify subscribers when computed value changes', () => {
      const count = createSignal(1);
      const doubled = computed(() => count.get() * 2, [count]);
      const callback = vi.fn();

      doubled.subscribe(callback);
      count.set(5);

      expect(callback).toHaveBeenCalledWith(10);
    });

    it('should not notify if computed value unchanged', () => {
      const a = createSignal(2);
      const b = createSignal(3);
      // floor division that might not change with small updates
      const result = computed(() => Math.floor(a.get() / b.get()), [a, b]);
      const callback = vi.fn();

      result.subscribe(callback);
      expect(result.get()).toBe(0); // 2/3 = 0

      a.set(2); // Same value, no recompute notification
      expect(callback).not.toHaveBeenCalled();

      a.set(3); // 3/3 = 1, value changed
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should track subscriber count correctly', () => {
      const signal = createSignal(0);
      const comp = computed(() => signal.get(), [signal]);

      expect(comp.subscriberCount()).toBe(0);

      const unsub = comp.subscribe(() => {});
      expect(comp.subscriberCount()).toBe(1);

      unsub();
      expect(comp.subscriberCount()).toBe(0);
    });
  });

  describe('dispose()', () => {
    it('should stop recomputing after dispose', () => {
      const count = createSignal(1);
      const doubled = computed(() => count.get() * 2, [count]);

      expect(doubled.get()).toBe(2);
      doubled.dispose();

      count.set(10);
      // After dispose, computed doesn't update
      expect(doubled.get()).toBe(2);
    });

    it('should throw when subscribing to disposed computed', () => {
      const signal = createSignal(0);
      const comp = computed(() => signal.get(), [signal]);

      comp.dispose();

      expect(() => comp.subscribe(() => {})).toThrow(
        'Cannot subscribe to a disposed computed'
      );
    });

    it('should clear subscribers on dispose', () => {
      const signal = createSignal(0);
      const comp = computed(() => signal.get(), [signal]);
      const callback = vi.fn();

      comp.subscribe(callback);
      expect(comp.subscriberCount()).toBe(1);

      comp.dispose();
      expect(comp.subscriberCount()).toBe(0);
    });

    it('should be safe to call dispose multiple times', () => {
      const signal = createSignal(0);
      const comp = computed(() => signal.get(), [signal]);

      expect(() => {
        comp.dispose();
        comp.dispose();
        comp.dispose();
      }).not.toThrow();
    });
  });

  describe('chained computed', () => {
    it('should support computed depending on computed', () => {
      const count = createSignal(5);
      const doubled = computed(() => count.get() * 2, [count]);
      const quadrupled = computed(() => doubled.get() * 2, [doubled as unknown as Signal<number>]);

      expect(count.get()).toBe(5);
      expect(doubled.get()).toBe(10);
      expect(quadrupled.get()).toBe(20);

      count.set(10);
      expect(doubled.get()).toBe(20);
      expect(quadrupled.get()).toBe(40);
    });

    it('should propagate updates through chain', () => {
      const base = createSignal(1);
      const level1 = computed(() => base.get() + 1, [base]);
      const level2 = computed(() => level1.get() + 1, [level1 as unknown as Signal<number>]);
      const level3 = computed(() => level2.get() + 1, [level2 as unknown as Signal<number>]);

      const callback = vi.fn();
      level3.subscribe(callback);

      base.set(10);

      expect(level1.get()).toBe(11);
      expect(level2.get()).toBe(12);
      expect(level3.get()).toBe(13);
      expect(callback).toHaveBeenCalledWith(13);
    });
  });
});

describe('batch()', () => {
  it('should execute the function', () => {
    const signal = createSignal(0);
    const callback = vi.fn();
    signal.subscribe(callback);

    batch(() => {
      signal.set(1);
      signal.set(2);
      signal.set(3);
    });

    // Currently batch runs synchronously, so all updates fire
    expect(callback).toHaveBeenCalledTimes(3);
    expect(signal.get()).toBe(3);
  });
});

describe('edge cases', () => {
  it('should handle objects with reference equality', () => {
    const obj = { count: 0 };
    const signal = createSignal(obj);
    const callback = vi.fn();

    signal.subscribe(callback);

    // Same reference - no notification
    signal.set(obj);
    expect(callback).not.toHaveBeenCalled();

    // New reference - notification
    signal.set({ count: 0 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should handle arrays with reference equality', () => {
    const arr = [1, 2, 3];
    const signal = createSignal(arr);
    const callback = vi.fn();

    signal.subscribe(callback);

    // Same reference - no notification
    signal.set(arr);
    expect(callback).not.toHaveBeenCalled();

    // New reference - notification
    signal.set([1, 2, 3]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should handle subscriber that throws', () => {
    const signal = createSignal(0);
    const badCallback = vi.fn(() => {
      throw new Error('Subscriber error');
    });
    const goodCallback = vi.fn();

    signal.subscribe(badCallback);
    signal.subscribe(goodCallback);

    // The error will propagate, but both callbacks are called
    expect(() => signal.set(1)).toThrow('Subscriber error');
    expect(badCallback).toHaveBeenCalled();
    // Note: Due to Set iteration, goodCallback might not be called after throw
  });

  it('should handle computed with no dependencies', () => {
    let counter = 0;
    const comp = computed(() => ++counter, []);

    expect(comp.get()).toBe(1);
    // With no dependencies, it never recomputes
    expect(comp.get()).toBe(1);
  });
});
