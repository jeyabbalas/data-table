/**
 * @vitest-environment jsdom
 *
 * The value inspector's extract hook when `onExtract` returns a promise of
 * how the add ended: "Adding…" in the status line meanwhile, further
 * requests dropped until it settles, a failure's reason after it, and an
 * outcome for a value no longer shown dropped. A hook that returns nothing
 * (the old shape) still works as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetModalHostForTests } from '@/core/ModalHost';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  ValueInspector,
  type ValueInspectorExtract,
  type ValueInspectorExtractResult,
} from '@/table/ValueInspector';

const TAGS: ColumnSchema = {
  name: 'tags',
  type: 'nested',
  nullable: true,
  originalType: 'VARCHAR[]',
};

let root: HTMLElement;
let grid: HTMLElement;
let cell: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.className = 'dt-root';
  grid = document.createElement('div');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('tabindex', '0');
  cell = document.createElement('div');
  cell.setAttribute('role', 'gridcell');
  grid.appendChild(cell);
  root.appendChild(grid);
  document.body.appendChild(root);
});

afterEach(() => {
  __resetModalHostForTests();
  document.body.innerHTML = '';
});

const bridge = {
  query: vi.fn(async () => [{ json: '["a","b"]', chars: 9 }]),
} as unknown as WorkerBridge;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const LABELS: ValueInspectorExtract['labels'] = {
  value: 'Add as column',
  length: 'Add length as column',
  size: 'Add size as column',
  tag: 'Add tag as column',
};

async function openWith(
  onExtract: ValueInspectorExtract['onExtract'],
): Promise<{ inspector: ValueInspector; leaf: HTMLElement }> {
  const inspector = new ValueInspector({
    bridge,
    returnFocus: grid,
    extract: { onExtract, labels: LABELS },
  });
  root.appendChild(inspector.getElement());
  inspector.open({ tableName: 't', column: TAGS, rowId: 3, row: 3, anchor: cell });
  await vi.waitFor(() =>
    expect(inspector.getElement().querySelectorAll('[role="treeitem"]').length).toBe(3),
  );
  return {
    inspector,
    leaf: inspector.getElement().querySelectorAll<HTMLElement>('[role="treeitem"]')[1]!,
  };
}

const message = (inspector: ValueInspector): string =>
  inspector.getElement().querySelector('.dt-value-inspector__message')!.textContent ?? '';

function ctrlEnter(target: Element): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

describe('ValueInspector — how an "add as column" request ends', () => {
  it('says it is adding, drops requests meanwhile, and shows a failure', async () => {
    const pending = deferred<ValueInspectorExtractResult>();
    const onExtract = vi.fn(() => pending.promise);
    const { inspector, leaf } = await openWith(onExtract);
    leaf.click();
    ctrlEnter(leaf);
    expect(message(inspector)).toBe('Adding…');
    ctrlEnter(leaf);
    expect(onExtract).toHaveBeenCalledTimes(1);

    pending.resolve({ success: false, error: 'Column name "tags_1" already exists' });
    await vi.waitFor(() =>
      expect(message(inspector)).toBe(
        'Could not add the column: Column name "tags_1" already exists',
      ),
    );
    // Settled: the next request goes out.
    ctrlEnter(leaf);
    expect(onExtract).toHaveBeenCalledTimes(2);
    inspector.destroy();
  });

  it('clears "Adding…" on success, and shows a rejection as a failure', async () => {
    const onExtract = vi
      .fn<ValueInspectorExtract['onExtract']>()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('worker gone'));
    const { inspector, leaf } = await openWith(onExtract);
    leaf.click();
    ctrlEnter(leaf);
    await vi.waitFor(() => expect(message(inspector)).toBe(''));
    ctrlEnter(leaf);
    await vi.waitFor(() =>
      expect(message(inspector)).toBe('Could not add the column: worker gone'),
    );
    inspector.destroy();
  });

  it('drops the outcome once the panel has closed, and lets a new request go after reopening', async () => {
    const first = deferred<ValueInspectorExtractResult>();
    const onExtract = vi.fn<ValueInspectorExtract['onExtract']>(() => first.promise);
    const { inspector, leaf } = await openWith(onExtract);
    leaf.click();
    ctrlEnter(leaf);
    inspector.close();

    inspector.open({ tableName: 't', column: TAGS, rowId: 3, row: 3, anchor: cell });
    await vi.waitFor(() =>
      expect(inspector.getElement().querySelectorAll('[role="treeitem"]').length).toBe(3),
    );
    first.resolve({ success: false, error: 'late' });
    await Promise.resolve();
    await Promise.resolve();
    expect(message(inspector)).toBe('');

    onExtract.mockReturnValueOnce(Promise.resolve({ success: true }));
    const again = inspector.getElement().querySelectorAll<HTMLElement>('[role="treeitem"]')[1]!;
    again.click();
    ctrlEnter(again);
    expect(onExtract).toHaveBeenCalledTimes(2);
    inspector.destroy();
  });

  it('still takes a hook that returns nothing, and says nothing for it', async () => {
    const onExtract = vi.fn(() => undefined);
    const { inspector, leaf } = await openWith(onExtract);
    leaf.click();
    ctrlEnter(leaf);
    ctrlEnter(leaf);
    expect(onExtract).toHaveBeenCalledTimes(2);
    expect(message(inspector)).toBe('');
    inspector.destroy();
  });
});
