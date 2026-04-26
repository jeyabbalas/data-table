/**
 * Type-safe event emitter for reactive event handling.
 *
 * Used internally by `createDataTable()` to expose `table.on()` / `table.off()`.
 * Can be reused standalone when composing custom UIs on top of `/advanced`.
 *
 * @example
 * import { EventEmitter } from '@jeyabbalas/data-table/advanced';
 *
 * type MyEvents = { click: { x: number; y: number }; close: void };
 * const bus = new EventEmitter<MyEvents>();
 *
 * const unsub = bus.on('click', ({ x, y }) => console.log(x, y));
 * bus.emit('click', { x: 10, y: 20 });
 * unsub(); // or bus.off('click', handler)
 */

type EventCallback<T> = (data: T) => void;

export type ListenerErrorHandler<Events extends Record<string, unknown>> = (
  error: unknown,
  event: keyof Events,
) => void;

export class EventEmitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<EventCallback<unknown>>>();
  private onListenerError?: ListenerErrorHandler<Events>;

  constructor(onListenerError?: ListenerErrorHandler<Events>) {
    this.onListenerError = onListenerError;
  }

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback as EventCallback<unknown>);
    }
  }

  /**
   * Emit an event with data. Each listener is invoked inside a try/catch so
   * a throwing listener cannot break subsequent listeners. Errors are routed
   * to `onListenerError` if supplied; otherwise logged and re-thrown in a
   * microtask so global error handlers (window.onerror, Sentry) can capture
   * them without aborting `emit`.
   */
  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;
    // Copy to tolerate listener-triggered mutations during iteration.
    const snapshot = Array.from(eventListeners);
    for (const callback of snapshot) {
      try {
        callback(data);
      } catch (err) {
        if (this.onListenerError) {
          try {
            this.onListenerError(err, event);
          } catch (metaErr) {
            // Don't let the forwarder itself break the emit loop.
            queueMicrotask(() => {
              throw metaErr;
            });
          }
        } else {
          console.error('[data-table] listener threw for event', String(event), err);
          queueMicrotask(() => {
            throw err;
          });
        }
      }
    }
  }

  /**
   * Subscribe to an event for a single occurrence
   * @returns Unsubscribe function
   */
  once<K extends keyof Events>(event: K, callback: EventCallback<Events[K]>): () => void {
    const onceCallback: EventCallback<Events[K]> = (data) => {
      this.off(event, onceCallback);
      callback(data);
    };
    return this.on(event, onceCallback);
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   */
  removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
