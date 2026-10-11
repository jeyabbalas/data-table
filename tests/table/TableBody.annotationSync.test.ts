/**
 * @vitest-environment jsdom
 *
 * How the body keeps its rendered rows in step with the annotation store:
 * a change reads only the rows and cells it touched, and writes only what
 * differs; recycled rows carry nothing of what they showed; a cell's native
 * title follows whether its popover has anything to say; and columns that
 * mount mid-session show what is there when they arrive.
 *
 * Counts, not time: DOM mutations, store lookups, cell renders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createSignal } from '@/core/Signal';
import { AnnotationPopover } from '@/table/AnnotationPopover';

import { rowsFor } from '../helpers/rowFetchBridge';
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
  document.body.innerHTML = '';
});

/** Initialize the body and answer its first fetch, so rows 0–14 are data rows. */
async function renderRows(harness: TableBodyHarness): Promise<void> {
  const init = harness.body.initialize();
  await harness.drain();
  const first = harness.queries[0]!;
  first.deferred.resolve(rowsFor(first.sql, HARNESS_COLUMNS));
  await init;
}

function rowAt(harness: TableBodyHarness, index: number): HTMLElement {
  const row = harness.container.querySelector<HTMLElement>(`.dt-row[data-row-index="${index}"]`);
  if (!row) throw new Error(`row ${index} is not rendered`);
  return row;
}

function cellOf(row: HTMLElement, column: string): HTMLElement {
  const cell = Array.from(row.children).find((c) => c.getAttribute('data-column') === column);
  if (!cell) throw new Error(`no cell for ${column}`);
  return cell as HTMLElement;
}

/** The mutation records `run` causes under `target`. */
function mutationsDuring(target: Node, run: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {});
  observer.observe(target, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  });
  try {
    run();
    return observer.takeRecords();
  } finally {
    observer.disconnect();
  }
}

/** The annotation classes on `el`, sorted: their order in the list says nothing. */
function annotationClassesOf(el: Element): string[] {
  return Array.from(el.classList)
    .filter((name) => name.includes('annot'))
    .sort();
}

describe('TableBody — annotation changes', () => {
  let store: AnnotationStore;
  let harness: TableBodyHarness;

  beforeEach(async () => {
    store = new AnnotationStore();
    harness = setupTableBody({ body: { annotations: store } });
    await renderRows(harness);
  });

  afterEach(() => {
    harness.body.destroy();
    store.destroy();
  });

  it('writes nothing when a change leaves every rendered row and cell as it is', () => {
    const ann = store.add({
      scope: 'cell',
      rowId: 3,
      column: 'tag',
      severity: 'error',
      message: 'e',
    });
    store.add({ scope: 'row', rowId: 4, severity: 'info', message: 'i' });

    const records = mutationsDuring(harness.container, () => {
      // Far from the view, on a column no row renders, a message changed
      // under the same severity, and a severity no rendered cell shows
      // hidden and shown again.
      store.add({ scope: 'cell', rowId: 5_000, column: 'tag', severity: 'error', message: 'far' });
      store.add({ scope: 'row', rowId: 6_000, severity: 'warning', message: 'far' });
      store.add({ scope: 'column', column: 'elsewhere', severity: 'info', message: 'x' });
      store.update(ann.id, { message: 'the same severity' });
      store.setSeverityFilter({ warning: false });
      store.setSeverityFilter({ warning: true });
    });

    expect(records).toEqual([]);
  });

  it('writes only the cell a cell-scope change touches', () => {
    const tag = cellOf(rowAt(harness, 3), 'tag');
    const records = mutationsDuring(harness.container, () => {
      store.add({ scope: 'cell', rowId: 3, column: 'tag', severity: 'warning', message: 'w' });
    });
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((r) => r.target))).toEqual(new Set([tag]));
    expect(annotationClassesOf(tag)).toEqual(['dt-cell--annotated', 'dt-cell--annotation-warning']);
    expect(tag.getAttribute('data-dt-annotation-count')).toBe('1');
  });

  it('reads no rendered row for a change far from the view, however many come', () => {
    const rowReads = vi.spyOn(store, 'summarizeRowScope');
    const cellReads = vi.spyOn(store, 'summarizeCellScope');
    const columnReads = vi.spyOn(store, 'summarizeColumnScope');

    const records = mutationsDuring(harness.container, () => {
      for (let i = 0; i < 10_000; i++) {
        store.add({
          scope: 'cell',
          rowId: 1_000 + i,
          column: 'tag',
          severity: 'info',
          message: 'x',
        });
        store.add({ scope: 'row', rowId: 20_000 + i, severity: 'error', message: 'y' });
      }
    });

    expect(rowReads).not.toHaveBeenCalled();
    expect(cellReads).not.toHaveBeenCalled();
    expect(columnReads).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it('reads the row and the cells of a row-scope change, and no other', () => {
    const rowReads = vi.spyOn(store, 'summarizeRowScope');
    const cellReads = vi.spyOn(store, 'summarizeCellScope');

    store.add({ scope: 'row', rowId: 6, severity: 'error', message: 'r' });

    expect(rowReads.mock.calls.map(([rowId]) => rowId)).toEqual([6]);
    expect(cellReads.mock.calls.map(([rowId, column]) => `${rowId}/${column}`)).toEqual([
      '6/id',
      '6/tag',
    ]);
    const row = rowAt(harness, 6);
    expect(annotationClassesOf(row)).toEqual(['dt-row--annotated', 'dt-row--annotation-error']);
    for (const column of ['id', 'tag']) {
      expect(annotationClassesOf(cellOf(row, column))).toEqual([
        'dt-cell--row-annotated',
        'dt-cell--row-annotation-error',
      ]);
    }
  });

  it('reads each rendered row once for a column-scope change, and writes that column only', () => {
    const records = mutationsDuring(harness.container, () => {
      store.add({ scope: 'column', column: 'tag', severity: 'info', message: 'c' });
    });
    const touched = new Set(records.map((r) => (r.target as Element).getAttribute('data-column')));
    expect(touched).toEqual(new Set(['tag']));
    for (let i = 0; i < 15; i++) {
      expect(annotationClassesOf(cellOf(rowAt(harness, i), 'tag'))).toEqual([
        'dt-cell--col-annotated',
        'dt-cell--col-annotation-info',
      ]);
      expect(annotationClassesOf(cellOf(rowAt(harness, i), 'id'))).toEqual([]);
    }
  });

  it('takes a cell’s title away while it shows a severity, and gives it back', () => {
    const cell = cellOf(rowAt(harness, 3), 'tag');
    const renders = vi.spyOn(
      (harness.body as unknown as { cellRenderer: { render: () => void } }).cellRenderer,
      'render',
    );
    expect(cell.title).toBe('tag-3');

    const ann = store.add({
      scope: 'cell',
      rowId: 3,
      column: 'tag',
      severity: 'error',
      message: 'e',
    });
    expect(cell.hasAttribute('title')).toBe(false);
    expect(renders).not.toHaveBeenCalled();

    // Every annotation there hidden: no popover, so the title is back.
    store.setSeverityFilter({ error: false });
    expect(cell.title).toBe('tag-3');
    expect(annotationClassesOf(cell)).toEqual(['dt-cell--annotated']);
    expect(cell.getAttribute('data-dt-annotation-count')).toBe('1');

    store.setSeverityFilter({ error: true });
    expect(cell.hasAttribute('title')).toBe(false);

    // The last annotation goes: the title comes back, from a render of that
    // cell alone.
    renders.mockClear();
    store.remove(ann.id);
    expect(cell.title).toBe('tag-3');
    expect(annotationClassesOf(cell)).toEqual([]);
    expect(cell.hasAttribute('data-dt-annotation-count')).toBe(false);
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it('keeps the title off a cell its render rewrote, while it shows a severity', () => {
    store.add({ scope: 'row', rowId: 2, severity: 'warning', message: 'r' });
    const row = rowAt(harness, 2);
    // A render of the row again (a fetch landing, a column change) writes
    // every title anew.
    harness.state.pinnedColumns.set([]);
    harness.body.refresh();
    const first = harness.queries.at(-1)!;
    first.deferred.resolve(rowsFor(first.sql, HARNESS_COLUMNS));
    return harness.drain().then(() => {
      const again = rowAt(harness, 2);
      expect(again).not.toBe(row);
      for (const column of ['id', 'tag']) {
        expect(cellOf(again, column).hasAttribute('title')).toBe(false);
      }
      expect(cellOf(rowAt(harness, 1), 'tag').title).toBe('tag-1');
    });
  });
});

describe('TableBody — recycled rows', () => {
  it('carry no annotation classes, counts, titles or popover reference onto other rows', async () => {
    const store = new AnnotationStore();
    const popover = new AnnotationPopover({ portalTarget: document.body });
    const harness = setupTableBody({ body: { annotations: store, annotationPopover: popover } });
    await renderRows(harness);
    for (let i = 0; i < 15; i++) {
      store.add({ scope: 'row', rowId: i, severity: 'error', message: `r${i}` });
      store.add({ scope: 'cell', rowId: i, column: 'tag', severity: 'warning', message: `c${i}` });
    }
    const tag = cellOf(rowAt(harness, 2), 'tag');
    tag.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(popover.isOpenFor(tag)).toBe(true);
    expect(tag.getAttribute('aria-describedby')).toBe(popover.getId());

    // Rows 0–14 go to the pool, and the rows rendered now come from it.
    harness.scrollToRow(60);

    // The popover went with its anchor's row.
    expect(popover.isOpen()).toBe(false);
    const rows = Array.from(
      harness.container.querySelectorAll<HTMLElement>('.dt-row:not([data-placeholder])'),
    );
    expect(rows.length).toBe(20);
    for (const row of rows) {
      const index = Number(row.getAttribute('data-row-index'));
      expect(index).toBeGreaterThanOrEqual(55);
      expect(annotationClassesOf(row)).toEqual([]);
      for (const column of ['id', 'tag']) {
        const cell = cellOf(row, column);
        expect(annotationClassesOf(cell)).toEqual([]);
        expect(cell.hasAttribute('data-dt-annotation-count')).toBe(false);
        expect(cell.hasAttribute('aria-describedby')).toBe(false);
        expect(cell.title).toBe(column === 'tag' ? `tag-${index}` : String(index));
      }
    }

    // And scrolled back, rows 0–14 show their annotations again.
    harness.scrollToRow(0);
    const back = cellOf(rowAt(harness, 2), 'tag');
    expect(annotationClassesOf(back)).toEqual([
      'dt-cell--annotated',
      'dt-cell--annotation-warning',
      'dt-cell--row-annotated',
      'dt-cell--row-annotation-error',
    ]);
    expect(back.getAttribute('data-dt-annotation-count')).toBe('2');
    harness.body.destroy();
    popover.destroy();
    store.destroy();
  });
});

describe('TableBody — columns that mount mid-session', () => {
  it('show the annotations there when they mount, and nothing of them while away', async () => {
    const store = new AnnotationStore();
    const mounted = createSignal<readonly string[]>(['id']);
    const harness = setupTableBody({ body: { annotations: store, mountedColumns: mounted } });
    await renderRows(harness);
    const row = rowAt(harness, 3);
    expect(row.querySelector('[data-column="tag"]')).toBeNull();

    // On a column no row renders: nothing to write.
    const records = mutationsDuring(harness.container, () => {
      store.add({ scope: 'column', column: 'tag', severity: 'warning', message: 'c' });
      store.add({ scope: 'cell', rowId: 3, column: 'tag', severity: 'error', message: 'x' });
    });
    expect(records).toEqual([]);

    // Scrolled into view.
    mounted.set(['id', 'tag']);
    const tag = cellOf(rowAt(harness, 3), 'tag');
    expect(annotationClassesOf(tag)).toEqual([
      'dt-cell--annotated',
      'dt-cell--annotation-error',
      'dt-cell--col-annotated',
      'dt-cell--col-annotation-warning',
    ]);
    expect(cellOf(rowAt(harness, 4), 'tag').getAttribute('data-dt-annotation-count')).toBe('1');

    // Away again, the annotations go; back, the cells are clean.
    mounted.set(['id']);
    store.clear();
    mounted.set(['id', 'tag']);
    for (let i = 0; i < 15; i++) {
      expect(annotationClassesOf(cellOf(rowAt(harness, i), 'tag'))).toEqual([]);
      expect(cellOf(rowAt(harness, i), 'tag').title).toBe(`tag-${i}`);
    }
    harness.body.destroy();
    store.destroy();
  });

  it('keep their annotations through a pin, and show them again after a hide and a show', async () => {
    const store = new AnnotationStore();
    const harness = setupTableBody({ body: { annotations: store } });
    await renderRows(harness);
    store.add({ scope: 'cell', rowId: 5, column: 'tag', severity: 'info', message: 'x' });

    harness.actions.toggleColumnPin('tag');
    const pinned = cellOf(rowAt(harness, 5), 'tag');
    expect(pinned.classList.contains('dt-cell--pinned')).toBe(true);
    expect(annotationClassesOf(pinned)).toEqual(['dt-cell--annotated', 'dt-cell--annotation-info']);

    harness.actions.hideColumn('tag');
    expect(rowAt(harness, 5).querySelector('[data-column="tag"]')).toBeNull();
    // Added while the column is hidden.
    store.add({ scope: 'column', column: 'tag', severity: 'error', message: 'c' });
    harness.actions.showColumn('tag');
    await harness.drain();
    const shown = cellOf(rowAt(harness, 5), 'tag');
    expect(annotationClassesOf(shown)).toEqual([
      'dt-cell--annotated',
      'dt-cell--annotation-info',
      'dt-cell--col-annotated',
      'dt-cell--col-annotation-error',
    ]);
    expect(shown.getAttribute('data-dt-annotation-count')).toBe('2');
    harness.body.destroy();
    store.destroy();
  });
});

describe('TableBody — the popover on a cell', () => {
  let store: AnnotationStore;
  let popover: AnnotationPopover;
  let harness: TableBodyHarness;

  beforeEach(async () => {
    store = new AnnotationStore();
    popover = new AnnotationPopover({
      portalTarget: document.body,
      severityFilter: () => store.getSeverityFilter(),
    });
    harness = setupTableBody({ body: { annotations: store, annotationPopover: popover } });
    await renderRows(harness);
  });

  afterEach(() => {
    harness.body.destroy();
    popover.destroy();
    store.destroy();
  });

  const popoverEl = (): HTMLElement => document.getElementById(popover.getId())!;
  const messages = (): string[] =>
    Array.from(popoverEl().querySelectorAll('.dt-annotation-message'), (n) => n.textContent ?? '');

  it('opens again on the same cell after it was hidden', () => {
    store.add({ scope: 'cell', rowId: 3, column: 'tag', severity: 'error', message: 'e' });
    const cell = cellOf(rowAt(harness, 3), 'tag');
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(popover.isOpenFor(cell)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(popover.isOpen()).toBe(false);

    // The pointer never left the cell: moving over it again opens it.
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(popover.isOpenFor(cell)).toBe(true);
  });

  it('refreshes in place as the cell’s annotations change, and hides when none is left', async () => {
    const first = store.add({
      scope: 'cell',
      rowId: 3,
      column: 'tag',
      severity: 'error',
      message: 'e1',
    });
    const cell = cellOf(rowAt(harness, 3), 'tag');
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(messages()).toEqual(['e1']);

    const second = store.add({ scope: 'row', rowId: 3, severity: 'info', message: 'r1' });
    await Promise.resolve();
    expect(popover.isOpenFor(cell)).toBe(true);
    expect(messages()).toEqual(['r1', 'e1']);

    // A change elsewhere rewrites nothing.
    const records = await (async () => {
      const observer = new MutationObserver(() => {});
      observer.observe(popoverEl(), { subtree: true, childList: true, characterData: true });
      store.add({ scope: 'cell', rowId: 9, column: 'tag', severity: 'error', message: 'far' });
      await Promise.resolve();
      const taken = observer.takeRecords();
      observer.disconnect();
      return taken;
    })();
    expect(records).toEqual([]);

    store.removeMany([first.id, second.id]);
    await Promise.resolve();
    expect(popover.isOpen()).toBe(false);
  });

  it('lists only the severities the filter shows, and opens nowhere every one is hidden', async () => {
    store.add({ scope: 'cell', rowId: 3, column: 'tag', severity: 'error', message: 'e' });
    store.add({ scope: 'cell', rowId: 3, column: 'tag', severity: 'info', message: 'i' });
    store.add({ scope: 'cell', rowId: 4, column: 'tag', severity: 'info', message: 'only info' });
    store.setSeverityFilter({ info: false });

    const cell = cellOf(rowAt(harness, 3), 'tag');
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(messages()).toEqual(['e']);
    expect(popoverEl().querySelector('.dt-annotation-popover__hidden')?.textContent).toBe(
      '1 hidden by the severity filter',
    );

    const hidden = cellOf(rowAt(harness, 4), 'tag');
    hidden.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(popover.isOpenFor(hidden)).toBe(false);

    // Shown again by the filter, it opens.
    store.setSeverityFilter({ info: true });
    hidden.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(popover.isOpenFor(hidden)).toBe(true);
    // Hidden again while open: the popover goes.
    store.setSeverityFilter({ info: false });
    await Promise.resolve();
    expect(popover.isOpen()).toBe(false);
  });
});
