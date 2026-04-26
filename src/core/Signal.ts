/**
 * Signal/Observable System
 *
 * A reactive state management system with signals (mutable reactive values)
 * and computed values (derived reactive values that auto-update).
 */

import { ConfigurationError } from './errors';

/**
 * Reactive value primitive — emit changes to subscribers when `set` is
 * called with a new value. Intentionally not exported from the public API
 * surface (`@jeyabbalas/data-table` / `@jeyabbalas/data-table/advanced`),
 * but referenced structurally by `TableState`, `FilterPresetManager`, and
 * `UndoManager` so consumers can read fields like `state.totalRows.get()`
 * or subscribe via `state.filters.subscribe(...)`.
 */
export interface Signal<T> {
  /** Get the current value */
  get(): T;
  /** Set a new value (notifies subscribers if changed) */
  set(value: T): void;
  /** Subscribe to value changes, returns unsubscribe function */
  subscribe(callback: (value: T) => void): () => void;
  /** Get the current subscriber count */
  subscriberCount(): number;
}

/**
 * Read-only derived reactive value — recomputes when any of its declared
 * dependencies change. Same not-publicly-exported semantics as {@link Signal};
 * referenced structurally from `TableState.filtersByColumn`.
 */
export interface Computed<T> {
  /** Get the current computed value */
  get(): T;
  /** Subscribe to value changes, returns unsubscribe function */
  subscribe(callback: (value: T) => void): () => void;
  /** Get the current subscriber count */
  subscriberCount(): number;
  /** Cleanup subscriptions to dependencies */
  dispose(): void;
}

// ── Batching infrastructure ─────────────────────────────────────────

let batchDepth = 0;
const pendingSignals = new Set<SignalImpl<unknown>>();

/**
 * Internal Signal implementation
 */
class SignalImpl<T> implements Signal<T> {
  private value: T;
  private subscribers = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(newValue: T): void {
    // Only notify if value changed (shallow comparison)
    if (this.value !== newValue) {
      this.value = newValue;
      if (batchDepth > 0) {
        // Defer notification — value is updated immediately so get() returns
        // the new value, but subscribers are notified after the batch ends.
        pendingSignals.add(this as unknown as SignalImpl<unknown>);
      } else {
        this.notify();
      }
    }
  }

  subscribe(callback: (value: T) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  /** Notify subscribers of the current value. Also used by batch flush. */
  notify(): void {
    for (const callback of this.subscribers) {
      callback(this.value);
    }
  }
}

/**
 * Internal Computed implementation
 */
class ComputedImpl<T> implements Computed<T> {
  private value: T;
  private subscribers = new Set<(value: T) => void>();
  private unsubscribes: (() => void)[] = [];
  private disposed = false;

  constructor(
    private fn: () => T,
    deps: Signal<unknown>[],
  ) {
    // Initial computation
    this.value = fn();

    // Subscribe to all dependencies
    for (const dep of deps) {
      const unsub = dep.subscribe(() => this.recompute());
      this.unsubscribes.push(unsub);
    }
  }

  get(): T {
    return this.value;
  }

  subscribe(callback: (value: T) => void): () => void {
    if (this.disposed) {
      throw new ConfigurationError('Cannot subscribe to a disposed computed', {
        code: 'INVARIANT',
      });
    }
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Unsubscribe from all dependencies
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    this.subscribers.clear();
  }

  private recompute(): void {
    if (this.disposed) return;

    const newValue = this.fn();
    if (this.value !== newValue) {
      this.value = newValue;
      this.notify();
    }
  }

  private notify(): void {
    for (const callback of this.subscribers) {
      callback(this.value);
    }
  }
}

/**
 * Create a new reactive signal with an initial value
 *
 * @param initial - The initial value for the signal
 * @returns A Signal instance
 *
 * @example
 * ```typescript
 * const count = createSignal(0);
 * count.subscribe(value => console.log('Count:', value));
 * count.set(1); // logs: Count: 1
 * console.log(count.get()); // 1
 * ```
 */
export function createSignal<T>(initial: T): Signal<T> {
  return new SignalImpl(initial);
}

/**
 * Create a computed value that automatically updates when dependencies change
 *
 * @param fn - Function that computes the derived value
 * @param deps - Array of signals that this computed depends on
 * @returns A Computed instance
 *
 * @example
 * ```typescript
 * const count = createSignal(5);
 * const doubled = computed(() => count.get() * 2, [count]);
 * console.log(doubled.get()); // 10
 * count.set(10);
 * console.log(doubled.get()); // 20
 * ```
 */
export function computed<T>(fn: () => T, deps: Signal<unknown>[]): Computed<T> {
  return new ComputedImpl(fn, deps);
}

/**
 * Batch multiple signal updates to avoid redundant computations
 * Note: Currently runs synchronously. Future optimization could defer notifications.
 *
 * @param fn - Function containing multiple signal updates
 *
 * @example
 * ```typescript
 * batch(() => {
 *   signal1.set(1);
 *   signal2.set(2);
 *   signal3.set(3);
 * });
 * ```
 */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && pendingSignals.size > 0) {
      // Flush: notify each signal once with its final value.
      // Copy and clear first — notifications may trigger further sets.
      const signals = [...pendingSignals];
      pendingSignals.clear();
      for (const signal of signals) {
        signal.notify();
      }
    }
  }
}
