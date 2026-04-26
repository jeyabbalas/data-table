// Bootstrap script for the Node-side DuckDB harness.
//
// Spawned as the entry of a `worker_threads.Worker`. duckdb-wasm's worker
// modules (`duckdb-node-eh.worker.cjs` etc.) are written for a Web-Worker
// global (`self`, `addEventListener`, `postMessage`). This bootstrap
// installs the DOM event-target shape on `global`, bridges
// `parentPort` <-> dispatch, then `require`s the worker module passed via
// `workerData.mod`.
//
// This file is the moral equivalent of duckdb-wasm's bundled `He()`
// worker-side shim (cf. node_modules/@duckdb/duckdb-wasm/dist/duckdb-node.cjs)
// — extracted so we can drive it with a path instead of a blob URL,
// since Node's `fetch` does not accept `file://` URLs (`createWorker`
// otherwise resolves the worker source via `fetch`).
'use strict';

const { workerData, parentPort } = require('worker_threads');

function MessageEvent(type, data) {
  this.type = type;
  this.data = data;
  this.timeStamp = Date.now();
  this.target = global;
  this.currentTarget = global;
}

const listeners = new Map();
function dispatch(type, data) {
  const ev = new MessageEvent(type, data);
  const handler = global['on' + type];
  if (typeof handler === 'function') {
    try {
      handler.call(global, ev);
    } catch (e) {
      console.error(e);
    }
  }
  const arr = listeners.get(type);
  if (arr) {
    for (const fn of [...arr]) {
      try {
        fn.call(global, ev);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

global.self = global;
global.postMessage = (msg, transfer) => parentPort.postMessage(msg, transfer);
global.addEventListener = (type, fn) => {
  let arr = listeners.get(type);
  if (!arr) listeners.set(type, (arr = []));
  arr.push(fn);
};
global.removeEventListener = (type, fn) => {
  const arr = listeners.get(type);
  if (!arr) return;
  const i = arr.indexOf(fn);
  if (i !== -1) arr.splice(i, 1);
};
global.dispatchEvent = (ev) => dispatch(ev.type, ev.data);

const queued = [];
let queueing = true;
parentPort.on('message', (data) => {
  if (queueing) queued.push(data);
  else dispatch('message', data);
});
parentPort.on('error', (err) => dispatch('error', err));

require(workerData.mod);

queueing = false;
for (const data of queued) dispatch('message', data);
