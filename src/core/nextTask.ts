/**
 * Resolves in a task of its own, once every microtask queued before it has
 * run: after the state update that follows a settled change, for one.
 *
 * Through a message channel rather than `setTimeout(0)`. A page in a
 * background tab gets its timers throttled to one a second, and a chain of
 * them to one a minute once it has been hidden for five minutes: a load
 * opened in a background tab waited tens of seconds on these. A message is
 * not throttled.
 *
 * @internal
 */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}
