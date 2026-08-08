/**
 * Synthetic Worker for testing `WorkerBridge` IPC without spinning up a
 * real worker. Records every `postMessage` from the bridge, lets the test
 * push synthetic responses via `sendFromWorker`, and emits the `__ready__`
 * message on construction so `bridge.initialize()` resolves once the
 * subsequent `init` reply lands.
 */
import type { WorkerMessage, WorkerResponse } from '../../src/worker/types';

export interface MockWorkerOptions {
  /**
   * Auto-handle inbound messages. Returning a `WorkerResponse` synthesizes
   * a worker reply for that message; an array of responses sends multiple
   * (e.g. progress + result); `null` / `undefined` leaves the message
   * unanswered (the test sends responses explicitly via `sendFromWorker`).
   *
   * Special case: if `autoReady` is `true` (default) the mock replies to
   * the very first message with type `'init'` automatically using a
   * stock `{ initialized: true }` `'result'` payload, so simple bridge
   * tests don't have to wire that boilerplate themselves.
   */
  onMessage?: (msg: WorkerMessage) => WorkerResponse | WorkerResponse[] | null | undefined;
  /**
   * If `true` (default), the mock auto-replies to the `init` message with
   * `{ initialized: true }` so `bridge.initialize()` resolves.
   */
  autoInit?: boolean;
  /**
   * If `true` (default), the mock posts the `__ready__` sentinel
   * immediately so `bridge.initialize()` proceeds past its waitForReady
   * step.
   */
  autoReady?: boolean;
  /**
   * If `true`, ignore inbound messages entirely (used to test
   * `initializeTimeoutMs`).
   */
  inert?: boolean;
}

export interface MockWorkerHandle {
  /** The bridge passes this object as a `Worker` to its own constructor path. */
  worker: Worker;
  /** Every message the bridge has posted, in order. */
  posted: WorkerMessage[];
  /**
   * The transfer list passed alongside each entry of {@link posted}, same
   * index. A real `Worker` detaches everything named here; the mock only
   * records it, so tests that need actual detachment run in the browser.
   */
  postedTransfers: readonly unknown[][];
  /** Push a synthetic reply from the worker side. */
  sendFromWorker: (response: WorkerResponse) => void;
  /** Helper: build and send a `result` response keyed off a posted message. */
  reply: (forMessageMatching: (m: WorkerMessage) => boolean, payload: unknown) => void;
  /** Drop all queued responses and stop accepting new ones (simulates terminate). */
  terminate: () => void;
  /** Wait for at least N posted messages, with optional timeout (ms). */
  waitForPosts: (count: number, timeoutMs?: number) => Promise<void>;
}

/**
 * Build a synthetic Worker. The returned handle exposes the inbound queue
 * and an outbound channel for tests.
 */
export function createMockWorker(options: MockWorkerOptions = {}): MockWorkerHandle {
  const autoReady = options.autoReady !== false;
  const autoInit = options.autoInit !== false;
  const inert = options.inert === true;

  const posted: WorkerMessage[] = [];
  const postedTransfers: readonly unknown[][] = [];
  const messageListeners = new Set<(ev: MessageEvent<WorkerResponse>) => void>();
  const errorListeners = new Set<(ev: ErrorEvent) => void>();

  let terminated = false;

  // Pending replies to dispatch once a consumer attaches. Real Workers
  // implicitly buffer messages until the main thread attaches handlers,
  // so the mock mirrors that behavior — replies emitted before any
  // listener exists land in `pendingReplies` and are flushed on the
  // first attach.
  const pendingReplies: WorkerResponse[] = [];

  const hasConsumer = (): boolean => {
    const onMessage = (worker as unknown as { onmessage?: unknown }).onmessage;
    return typeof onMessage === 'function' || messageListeners.size > 0;
  };

  const dispatchMessage = (response: WorkerResponse): void => {
    if (terminated) return;
    if (!hasConsumer()) {
      pendingReplies.push(response);
      return;
    }
    const event = { data: response } as MessageEvent<WorkerResponse>;
    // Real `Worker` fires both the `onmessage` property AND every
    // `addEventListener('message', ...)` listener. Mirror that.
    const onMessage = (
      worker as unknown as { onmessage?: ((ev: MessageEvent<WorkerResponse>) => void) | null }
    ).onmessage;
    if (typeof onMessage === 'function') {
      try {
        onMessage(event);
      } catch (e) {
        console.error(e);
      }
    }
    for (const fn of [...messageListeners]) {
      try {
        fn(event);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const flushPending = (): void => {
    if (!hasConsumer()) return;
    while (pendingReplies.length > 0) {
      const reply = pendingReplies.shift()!;
      dispatchMessage(reply);
    }
  };

  const worker: Worker = {
    postMessage(msg: unknown, transfer?: unknown) {
      if (terminated) return;
      const message = msg as WorkerMessage;
      posted.push(message);
      (postedTransfers as unknown[][]).push(Array.isArray(transfer) ? [...transfer] : []);
      if (inert) return;

      if (options.onMessage) {
        const response = options.onMessage(message);
        if (response) {
          if (Array.isArray(response)) {
            for (const r of response) dispatchMessage(r);
          } else {
            dispatchMessage(response);
          }
          return;
        }
      }
      if (autoInit && message.type === 'init') {
        dispatchMessage({
          id: message.id,
          type: 'result',
          payload: { initialized: true },
        });
      }
    },
    terminate() {
      terminated = true;
    },
    addEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const handler = typeof fn === 'function' ? fn : (fn as EventListener).handleEvent.bind(fn);
      if (type === 'message') {
        messageListeners.add(handler as (ev: MessageEvent<WorkerResponse>) => void);
        // A late-attached listener should still see the `__ready__` and
        // any other reply queued before subscription.
        queueMicrotask(flushPending);
      } else if (type === 'error') {
        errorListeners.add(handler as (ev: ErrorEvent) => void);
      }
    },
    removeEventListener(type: string, fn: EventListenerOrEventListenerObject) {
      const handler = typeof fn === 'function' ? fn : (fn as EventListener).handleEvent.bind(fn);
      if (type === 'message') {
        messageListeners.delete(handler as (ev: MessageEvent<WorkerResponse>) => void);
      } else if (type === 'error') {
        errorListeners.delete(handler as (ev: ErrorEvent) => void);
      }
    },
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    dispatchEvent: () => true,
  } as unknown as Worker;

  if (autoReady) {
    // Microtask so listeners attached synchronously after construction land first.
    queueMicrotask(() => {
      dispatchMessage({ id: '__ready__', type: 'result', payload: { ready: true } });
    });
  }

  return {
    worker,
    posted,
    postedTransfers,
    sendFromWorker: dispatchMessage,
    reply(matcher, payload) {
      const found = posted.find(matcher);
      if (!found) {
        throw new Error('mockWorker.reply: no posted message matched');
      }
      dispatchMessage({ id: found.id, type: 'result', payload });
    },
    terminate() {
      terminated = true;
    },
    async waitForPosts(count: number, timeoutMs = 1000): Promise<void> {
      const start = Date.now();
      while (posted.length < count) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`mockWorker.waitForPosts: timed out at ${posted.length}/${count}`);
        }
        await new Promise((r) => setTimeout(r, 1));
      }
    },
  };
}
