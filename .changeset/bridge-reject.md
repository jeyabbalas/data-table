---
'@jeyabbalas/data-table': patch
---

### Fixed

- A request to the DuckDB worker no longer waits for good on a reply that will never come:
  - An error the worker does not catch, during init or later, now rejects every pending request with a `WorkerInitError` whose code is `WORKER_CRASHED`, and terminates the worker. Every later call rejects at once with the same code, instead of being posted to a worker that will not answer, until `bridge.initialize()` starts a new one. Tables sharing the bridge all get this error.
  - A message from the worker that cannot be deserialized (`messageerror`), or that has no string id, rejects every pending request with `WORKER_PROTOCOL_VIOLATION`, since there is no telling whose reply it was, and cancels them in the worker, which carries on.
  - A result reply without its payload rejects its request with `WORKER_PROTOCOL_VIOLATION`.
  - A request whose payload cannot be cloned, such as a detached `ArrayBuffer`, still rejects with the clone error, and no longer leaves its entry and its abort listener behind.
