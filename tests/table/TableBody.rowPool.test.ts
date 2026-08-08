/**
 * @vitest-environment jsdom
 *
 * The row pool recycles elements; it must not recycle their listeners.
 *
 * A row's `mouseenter` / `mouseleave` / `click` handlers close over the row
 * index they were attached for. Historically the only way to shed anonymous
 * handlers was `cloneNode(true)` — deep-copy the row, pool the copy, throw the
 * original away — which cost ~50 node copies per recycled row per scroll frame
 * once rows carried a full column window, and made element identity useless.
 * Now each row's handlers hang off one `AbortController`, and pooling aborts
 * it.
 *
 * What has to stay true either way: a pooled row is inert, and a reused row
 * reports the row it is currently showing rather than the one it used to.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rowsFor } from '../helpers/rowFetchBridge';
import { bodyCells, rowElements, rowPool } from '../helpers/tableBodyDom';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function mount(): Promise<TableBodyHarness> {
  const harness = setupTableBody({ totalRows: 10_000, body: { prefetch: false } });
  const init = harness.body.initialize();
  for (const query of harness.queries.splice(0, harness.queries.length)) {
    query.deferred.resolve(rowsFor(query.sql, harness.columns));
  }
  await init;
  return harness;
}

/** Resolve whatever the last scroll asked for, so rows paint rather than stall. */
async function settle(harness: TableBodyHarness): Promise<void> {
  for (const query of harness.queries.splice(0, harness.queries.length)) {
    query.deferred.resolve(rowsFor(query.sql, harness.columns));
  }
  await harness.drain();
}

describe('TableBody — the row pool recycles elements, not listeners', () => {
  it('pools the element itself rather than a deep clone of it', async () => {
    const harness = await mount();
    const row = rowElements(harness.body).get(0)!;
    const cell = bodyCells(row)[0]!;

    harness.scrollToRow(400);

    // Same element, detached and scrubbed — not a copy of it. Element identity
    // is what lets the cursor ring be tracked by reference, and what makes the
    // reshape on reuse an in-place edit instead of a rebuild.
    expect(rowPool(harness.body)).toContain(row);
    expect(row.isConnected).toBe(false);
    expect(bodyCells(row)[0]).toBe(cell);
    expect(cell.id).toBe('');
    expect(row.hasAttribute('aria-rowindex')).toBe(false);
    expect(row.getAttribute('aria-selected')).toBe('false');

    harness.body.destroy();
  });

  it('leaves a pooled row inert', async () => {
    const harness = await mount();
    const row = rowElements(harness.body).get(0)!;
    harness.scrollToRow(400);
    expect(rowPool(harness.body)).toContain(row);

    // A pooled row is detached, so nothing can dispatch to it in practice —
    // but a listener that survived pooling would still be holding a closure
    // over row 0 and would fire the moment the element is reused.
    harness.state.hoveredRow.set(null);
    row.dispatchEvent(new MouseEvent('mouseenter'));
    expect(harness.state.hoveredRow.get()).toBeNull();

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(harness.state.selectedRows.get().size).toBe(0);

    harness.body.destroy();
  });

  it('rebinds a reused row to the row it now shows', async () => {
    // The bug a stale listener causes: hovering a recycled row highlights
    // whatever row that element used to be.
    const harness = await mount();
    const original = rowElements(harness.body).get(0)!;

    harness.scrollToRow(400);
    await settle(harness);

    const reusedAt = [...rowElements(harness.body).entries()].find(
      ([, element]) => element === original,
    );
    expect(reusedAt, 'the pooled element was reused for a later row').toBeDefined();
    const [index] = reusedAt!;
    expect(index).not.toBe(0);

    original.dispatchEvent(new MouseEvent('mouseenter'));
    expect(harness.state.hoveredRow.get()).toBe(index);

    bodyCells(original)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(harness.state.focusedCell.get()).toEqual({ row: index, column: HARNESS_COLUMNS[0] });

    harness.body.destroy();
  });

  it('binds exactly one handler set however often a row is recycled', async () => {
    // Two live sets would fire `setHoveredRow` twice per event — harmless for
    // an idempotent action, and a silent doubling of work for every other one.
    const harness = await mount();
    const original = rowElements(harness.body).get(0)!;

    for (const row of [400, 0, 900, 0]) {
      harness.scrollToRow(row);
      await settle(harness);
    }

    const entry = [...rowElements(harness.body).entries()].find(
      ([, element]) => element === original,
    );
    expect(entry).toBeDefined();

    let hovers = 0;
    const unsubscribe = harness.state.hoveredRow.subscribe(() => hovers++);
    original.dispatchEvent(new MouseEvent('mouseenter'));
    unsubscribe();

    expect(hovers).toBe(1);
    expect(harness.state.hoveredRow.get()).toBe(entry![0]);

    harness.body.destroy();
  });
});
