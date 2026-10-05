/**
 * @vitest-environment jsdom
 *
 * The value inspector panel against a mocked bridge: what it shows, when it
 * says it is loading, how it fails and retries, the truncated notice, Copy
 * JSON (and its 8 MiB re-read), node copy, Escape and focus, the abort on
 * close, the extract hook, translated strings, and caller text kept as text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetModalHostForTests } from '@/core/ModalHost';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  INSPECTOR_COPY_CHARS,
  INSPECTOR_DISPLAY_CHARS,
  ValueInspector,
  type ValueInspectorExtract,
  type ValueInspectorOptions,
} from '@/table/ValueInspector';

const TAGS: ColumnSchema = {
  name: 'tags',
  type: 'nested',
  nullable: true,
  originalType: 'VARCHAR[]',
};

const POINT: ColumnSchema = {
  name: 'point',
  type: 'nested',
  nullable: true,
  originalType: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
};

interface Call {
  sql: string;
  signal: AbortSignal | undefined;
  options: unknown;
}

/** A bridge whose every query is answered by `respond`; the calls are kept. */
function makeBridge(respond: (call: Call) => unknown[] | Promise<unknown[]>): {
  bridge: WorkerBridge;
  calls: Call[];
} {
  const calls: Call[] = [];
  const bridge = {
    query: vi.fn(async (sql: string, signal?: AbortSignal, options?: unknown) => {
      const call = { sql, signal, options };
      calls.push(call);
      return respond(call);
    }),
  } as unknown as WorkerBridge;
  return { bridge, calls };
}

/** The row `fetchCellJson` reads: the JSON text, and the length of the whole. */
function jsonRow(text: string | null, chars = text?.length ?? 0): unknown[] {
  return [{ json: text, chars }];
}

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

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Let awaited promises settle. */
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

let root: HTMLElement;
let grid: HTMLElement;
let cell: HTMLElement;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  root = document.createElement('div');
  root.className = 'dt-root';
  grid = document.createElement('div');
  grid.className = 'dt-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('tabindex', '0');
  cell = document.createElement('div');
  cell.id = 'cell-3-0';
  cell.setAttribute('role', 'gridcell');
  cell.setAttribute('tabindex', '-1');
  grid.appendChild(cell);
  grid.setAttribute('aria-activedescendant', cell.id);
  root.appendChild(grid);
  document.body.appendChild(root);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  __resetModalHostForTests();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function mount(bridge: WorkerBridge, options: Partial<ValueInspectorOptions> = {}): ValueInspector {
  const inspector = new ValueInspector({ bridge, returnFocus: grid, ...options });
  root.appendChild(inspector.getElement());
  return inspector;
}

function openOn(
  inspector: ValueInspector,
  column: ColumnSchema = TAGS,
  rowId: number | bigint = 3,
  row = 3,
): void {
  inspector.open({ tableName: 't', column, rowId, row, anchor: cell });
}

const panel = (inspector: ValueInspector): HTMLElement => inspector.getElement();
const q = <T extends Element = HTMLElement>(inspector: ValueInspector, selector: string): T =>
  panel(inspector).querySelector<T>(selector)!;
const items = (inspector: ValueInspector): HTMLElement[] =>
  Array.from(panel(inspector).querySelectorAll<HTMLElement>('[role="treeitem"]'));
const labels = (inspector: ValueInspector): string[] =>
  items(inspector).map((item) => item.getAttribute('aria-label') ?? '');
const message = (inspector: ValueInspector): string =>
  q(inspector, '.dt-value-inspector__message').textContent ?? '';

describe('ValueInspector', () => {
  it('shows the value as a tree under the column, with the row and the type in the header', async () => {
    const { bridge, calls } = makeBridge(() => jsonRow('["a","b","c"]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();

    expect(panel(inspector).style.display).toBe('');
    expect(panel(inspector).getAttribute('role')).toBe('dialog');
    const title = q(inspector, '.dt-value-inspector__title');
    expect(title.textContent).toBe('tags · Row 4');
    expect(panel(inspector).getAttribute('aria-labelledby')).toBe(title.id);
    const type = q(inspector, '.dt-value-inspector__type');
    expect(type.textContent).toBe('[varchar]');
    expect(type.title).toBe('VARCHAR[]');

    const tree = q(inspector, '[role="tree"]');
    expect(tree.classList.contains('dt-value-tree')).toBe(true);
    expect(tree.getAttribute('aria-label')).toBe('Value of tags');
    expect(labels(inspector)).toEqual(['tags: [varchar], 3 items', '1: "a"', '2: "b"', '3: "c"']);
    // The root row: key, type, count and preview, each in its own span.
    const rootItem = items(inspector)[0]!;
    expect(rootItem.querySelector('.dt-value-tree__key--column')!.textContent).toBe('tags');
    expect(rootItem.querySelector('.dt-value-tree__count')!.textContent).toBe('3 items');
    expect(rootItem.querySelector('.dt-value-tree__preview')!.textContent).toBe('["a", "b", "c"]');
    expect(items(inspector)[1]!.querySelector('.dt-value-tree__value--string')!.textContent).toBe(
      '"a"',
    );

    // One read: by rowid, high priority, past the cache, cut at 2 MiB.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('WHERE "__rowid__" = 3');
    expect(calls[0]!.sql).toContain(String(INSPECTOR_DISPLAY_CHARS));
    expect(calls[0]!.options).toEqual({ priority: 'high', cache: false });
    expect(q(inspector, '.dt-value-inspector__status').getAttribute('role')).toBe('status');
    expect(q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').disabled).toBe(false);
    inspector.destroy();
  });

  it('shows a struct by its fields, keys and values styled by kind', async () => {
    const { bridge } = makeBridge(() => jsonRow('{"x":1.5,"y":null,"tier":"gold"}'));
    const inspector = mount(bridge);
    openOn(inspector, POINT);
    await settle();
    expect(labels(inspector)).toEqual([
      'point: struct(3), 3 fields',
      'x: 1.5',
      'y: null',
      'tier: "gold"',
    ]);
    const [, x, y] = items(inspector);
    expect(x!.querySelector('.dt-value-tree__key--field')!.textContent).toBe('x');
    expect(x!.querySelector('.dt-value-tree__value--number')!.textContent).toBe('1.5');
    expect(y!.querySelector('.dt-value-tree__value--null')!.textContent).toBe('null');
    // End nodes carry no aria-expanded; the root is open.
    expect(items(inspector)[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(x!.hasAttribute('aria-expanded')).toBe(false);
    inspector.destroy();
  });

  it('shows a NULL as a null root', async () => {
    const { bridge } = makeBridge(() => jsonRow(null));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    expect(labels(inspector)).toEqual(['tags: null']);
    inspector.destroy();
  });

  it('says it is loading only once the read has taken 150 ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const read = deferred<unknown[]>();
    const { bridge } = makeBridge(() => read.promise);
    const inspector = mount(bridge);
    openOn(inspector);

    vi.advanceTimersByTime(149);
    expect(message(inspector)).toBe('');
    expect(q(inspector, '.dt-value-inspector__body').getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(1);
    expect(message(inspector)).toBe('Loading…');
    expect(q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').disabled).toBe(true);

    read.resolve(jsonRow('[1]'));
    await settle();
    expect(message(inspector)).toBe('');
    expect(q(inspector, '.dt-value-inspector__body').hasAttribute('aria-busy')).toBe(false);
    expect(labels(inspector)).toEqual(['tags: [varchar], 1 item', '1: 1']);
    inspector.destroy();
  });

  it('never says it is loading when the value comes back fast', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { bridge } = makeBridge(() => jsonRow('[]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    vi.advanceTimersByTime(500);
    expect(message(inspector)).toBe('');
    inspector.destroy();
  });

  it('says when the value could not be read, and Retry reads it again', async () => {
    let fail = true;
    const { bridge, calls } = makeBridge(() => {
      if (fail) throw new Error('boom');
      return jsonRow('["ok"]');
    });
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();

    expect(message(inspector)).toBe('Could not load this value');
    const retry = q<HTMLButtonElement>(inspector, '.dt-value-inspector__retry');
    expect(retry.hidden).toBe(false);
    expect(retry.textContent).toBe('Retry');
    expect(items(inspector)).toHaveLength(0);

    fail = false;
    retry.click();
    await settle();
    expect(calls).toHaveLength(2);
    expect(retry.hidden).toBe(true);
    expect(message(inspector)).toBe('');
    expect(labels(inspector)[1]).toBe('1: "ok"');
    inspector.destroy();
  });

  it('treats a row that is gone as a failed read', async () => {
    const { bridge } = makeBridge(() => []);
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    expect(message(inspector)).toBe('Could not load this value');
    inspector.destroy();
  });

  it('says when a value was cut short, and Copy JSON reads it again up to 8 MiB', async () => {
    const whole = '[1,2,3,4]';
    const { bridge, calls } = makeBridge(({ sql }) =>
      sql.includes(String(INSPECTOR_COPY_CHARS))
        ? jsonRow(whole, 3_000_000)
        : jsonRow('[1,2,', 3_000_000),
    );
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();

    expect(q(inspector, '.dt-value-inspector__notice').textContent).toBe(
      'Showing the first 2,097,152 of 3,000,000 characters',
    );
    // What was read, shown as far as it goes.
    expect(labels(inspector)).toEqual(['tags: [varchar], 2 items', '1: 1', '2: 2']);

    q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').click();
    await settle(10);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sql).toContain(String(INSPECTOR_COPY_CHARS));
    expect(writeText).toHaveBeenCalledWith('[\n  1,\n  2,\n  3,\n  4\n]');
    expect(message(inspector)).toBe('Copied');
    // The notice stays beside the message.
    expect(q(inspector, '.dt-value-inspector__notice').textContent).toMatch(/^Showing the first/);
    inspector.destroy();
  });

  it('says a value over 8 MiB is too large to copy, and copies nothing', async () => {
    const { bridge } = makeBridge(() => jsonRow('[1,2,', 9_000_000));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').click();
    await settle(10);
    expect(writeText).not.toHaveBeenCalled();
    expect(message(inspector)).toBe('Too large to copy');
    inspector.destroy();
  });

  it('copies the whole value as standard JSON, digits kept and NaN as null', async () => {
    const { bridge, calls } = makeBridge(() =>
      jsonRow('{"x":1.50,"y":NaN,"big":170141183460469231731687303715884105727}'),
    );
    const inspector = mount(bridge);
    openOn(inspector, POINT);
    await settle();
    q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').click();
    await settle();
    expect(calls).toHaveLength(1);
    expect(writeText).toHaveBeenCalledWith(
      '{\n  "x": 1.50,\n  "y": null,\n  "big": 170141183460469231731687303715884105727\n}',
    );
    expect(message(inspector)).toBe('Copied');
    inspector.destroy();
  });

  it('clears the copied message after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { bridge } = makeBridge(() => jsonRow('[1]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').click();
    await settle();
    expect(message(inspector)).toBe('Copied');
    vi.advanceTimersByTime(3000);
    expect(message(inspector)).toBe('');
    inspector.destroy();
  });

  it('says when the clipboard refused the copy', async () => {
    writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const { bridge } = makeBridge(() => jsonRow('[1]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    q<HTMLButtonElement>(inspector, '.dt-value-inspector__button').click();
    await settle();
    expect(message(inspector)).toBe('Copy failed');
    inspector.destroy();
  });

  it('copies the active node with Ctrl/Cmd+C', async () => {
    const { bridge } = makeBridge(() => jsonRow('{"x":1.5,"y":-0.5,"tier":"gold"}'));
    const inspector = mount(bridge);
    openOn(inspector, POINT);
    await settle();
    await nextFrame();
    const tierItem = items(inspector)[3]!;
    tierItem.focus();
    tierItem.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true }),
    );
    await settle();
    expect(writeText).toHaveBeenCalledWith('"gold"');
    expect(message(inspector)).toBe('Copied');

    items(inspector)[0]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await settle();
    expect(writeText).toHaveBeenLastCalledWith('{\n  "x": 1.5,\n  "y": -0.5,\n  "tier": "gold"\n}');
    inspector.destroy();
  });

  it('gives focus to the tree’s active item once the tree is there', async () => {
    const { bridge } = makeBridge(() => jsonRow('["a"]'));
    const inspector = mount(bridge);
    grid.focus();
    openOn(inspector);
    await settle();
    await nextFrame();
    const active = items(inspector)[0]!;
    expect(active.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(active);
    inspector.destroy();
  });

  it('holds focus itself while the value loads, then hands it to the tree', async () => {
    const read = deferred<unknown[]>();
    const { bridge } = makeBridge(() => read.promise);
    const inspector = mount(bridge);
    grid.focus();
    openOn(inspector);
    await nextFrame();
    expect(document.activeElement).toBe(panel(inspector));

    read.resolve(jsonRow('["a"]'));
    await settle();
    expect(document.activeElement).toBe(items(inspector)[0]);
    inspector.destroy();
  });

  it('hands focus to the tree once, and not again on a click on its background', async () => {
    const { bridge } = makeBridge(() => jsonRow('["a"]'));
    const inspector = mount(bridge);
    grid.focus();
    openOn(inspector);
    await settle();
    await nextFrame();
    expect(document.activeElement).toBe(items(inspector)[0]);
    // A press on the title or the padding focuses the panel itself.
    panel(inspector).focus();
    expect(document.activeElement).toBe(panel(inspector));
    inspector.destroy();
  });

  it('gives focus back to the tree when asked to open on the value it shows', async () => {
    const { bridge, calls } = makeBridge(() => jsonRow('["a"]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    await nextFrame();
    // The second click of a double click on the icon: its press focused the cell.
    cell.focus();
    openOn(inspector);
    expect(calls).toHaveLength(1);
    expect(document.activeElement).toBe(items(inspector)[0]);
    inspector.destroy();
  });

  it('moves focus to Retry on a failure, and back into the tree after it', async () => {
    let fail = true;
    const { bridge } = makeBridge(() => {
      if (fail) throw new Error('boom');
      return jsonRow('["ok"]');
    });
    const inspector = mount(bridge);
    grid.focus();
    openOn(inspector);
    await settle();
    await nextFrame();
    const retry = q<HTMLButtonElement>(inspector, '.dt-value-inspector__retry');
    expect(document.activeElement).toBe(retry);

    fail = false;
    retry.click();
    // Retry hides itself: the panel holds focus meanwhile, never <body>.
    expect(document.activeElement).toBe(panel(inspector));
    await settle();
    expect(document.activeElement).toBe(items(inspector)[0]);
    inspector.destroy();
  });

  it('closes on Escape and gives focus back to the grid, cursor and activedescendant intact', async () => {
    const { bridge } = makeBridge(() => jsonRow('["a"]'));
    const onOpenChange = vi.fn();
    const inspector = mount(bridge, { onOpenChange });
    grid.focus();
    openOn(inspector);
    await settle();
    await nextFrame();
    expect(onOpenChange).toHaveBeenLastCalledWith('tags');

    const rootKeydown = vi.fn();
    root.addEventListener('keydown', rootKeydown);
    const active = document.activeElement!;
    active.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(inspector.getIsOpen()).toBe(false);
    expect(panel(inspector).style.display).toBe('none');
    expect(document.activeElement).toBe(grid);
    expect(grid.getAttribute('aria-activedescendant')).toBe('cell-3-0');
    // The panel consumed the key: the grid's own Escape (clear the cursor) never ran.
    expect(rootKeydown).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(null);
    expect(inspector.getShown()).toBeNull();
    inspector.destroy();
  });

  it('keeps Tab inside: ×, the tree’s one stop, Copy JSON, Close', async () => {
    const { bridge } = makeBridge(() => jsonRow('["a","b"]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    await nextFrame();
    const closeX = q<HTMLButtonElement>(inspector, '.dt-value-inspector__close');
    const footer = panel(inspector).querySelectorAll<HTMLButtonElement>(
      '.dt-value-inspector__button',
    );
    const last = footer[footer.length - 1]!;
    // One stop in the tree, whatever its size; hidden Retry is no stop.
    expect(panel(inspector).querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);

    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeX);

    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    closeX.dispatchEvent(back);
    expect(document.activeElement).toBe(last);
    inspector.destroy();
  });

  it('closes from its buttons', async () => {
    const { bridge } = makeBridge(() => jsonRow('["a"]'));
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    q<HTMLButtonElement>(inspector, '.dt-value-inspector__close').click();
    expect(inspector.getIsOpen()).toBe(false);

    openOn(inspector);
    await settle();
    const footer = panel(inspector).querySelectorAll<HTMLButtonElement>(
      '.dt-value-inspector__button',
    );
    footer[footer.length - 1]!.click();
    expect(inspector.getIsOpen()).toBe(false);
    inspector.destroy();
  });

  it('aborts its read when it closes, and drops what comes back', async () => {
    const read = deferred<unknown[]>();
    const { bridge, calls } = makeBridge(() => read.promise);
    const inspector = mount(bridge);
    openOn(inspector);
    expect(calls[0]!.signal!.aborted).toBe(false);

    inspector.close();
    expect(calls[0]!.signal!.aborted).toBe(true);
    read.resolve(jsonRow('["late"]'));
    await settle();
    expect(items(inspector)).toHaveLength(0);
    inspector.destroy();
  });

  it('keeps an open panel on the same value, and starts over on another', async () => {
    const { bridge, calls } = makeBridge(({ sql }) =>
      jsonRow(sql.includes('= 7') ? '["seven"]' : '["three"]'),
    );
    const inspector = mount(bridge);
    openOn(inspector);
    await settle();
    openOn(inspector);
    await settle();
    expect(calls).toHaveLength(1);

    openOn(inspector, TAGS, 7, 7);
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(q(inspector, '.dt-value-inspector__title').textContent).toBe('tags · Row 8');
    expect(labels(inspector)[1]).toBe('1: "seven"');
    expect(inspector.getShown()).toEqual({ column: 'tags', row: 7, rowId: 7 });
    inspector.destroy();
  });

  it('writes every caller text as text', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const column: ColumnSchema = {
      name: hostile,
      type: 'nested',
      nullable: true,
      originalType: `STRUCT("${hostile}" VARCHAR)`,
    };
    const { bridge } = makeBridge(() => jsonRow(JSON.stringify({ [hostile]: hostile })));
    const inspector = mount(bridge);
    openOn(inspector, column);
    await settle();
    expect(panel(inspector).querySelector('img')).toBeNull();
    expect(q(inspector, '.dt-value-inspector__title').textContent).toBe(`${hostile} · Row 4`);
    expect(labels(inspector)[1]).toBe(`${hostile}: "${hostile}"`);
    expect(items(inspector)[1]!.querySelector('.dt-value-tree__key')!.textContent).toBe(hostile);
    inspector.destroy();
  });

  it('speaks the language it is given', async () => {
    const messages = mergeStrings(defaultStrings, {
      common: { close: 'Fermer' },
      values: {
        inspectorTitle: (column: string, row: string) => `${column} — ${row}`,
        rowLabel: (row: number) => `ligne ${row}`,
        treeLabel: (column: string) => `Valeur de ${column}`,
        itemCount: (n: number) => `${n} éléments`,
        copyJson: 'Copier le JSON',
        closeLabel: 'Fermer l’inspecteur',
        loadFailed: 'Échec du chargement',
        retry: 'Réessayer',
      },
    });
    const { bridge } = makeBridge(() => jsonRow('["a","b"]'));
    const inspector = mount(bridge, { messages });
    openOn(inspector);
    await settle();
    expect(q(inspector, '.dt-value-inspector__title').textContent).toBe('tags — ligne 4');
    expect(q(inspector, '[role="tree"]').getAttribute('aria-label')).toBe('Valeur de tags');
    expect(labels(inspector)[0]).toBe('tags: [varchar], 2 éléments');
    const buttons = Array.from(
      panel(inspector).querySelectorAll<HTMLButtonElement>('.dt-value-inspector__button'),
      (b) => b.textContent,
    );
    expect(buttons).toEqual(['Copier le JSON', 'Fermer']);
    expect(q(inspector, '.dt-value-inspector__close').getAttribute('aria-label')).toBe(
      'Fermer l’inspecteur',
    );
    expect(q(inspector, '.dt-value-inspector__retry').textContent).toBe('Réessayer');
    inspector.destroy();
  });

  describe('extract hook', () => {
    function extractHook(): ValueInspectorExtract & { onExtract: ReturnType<typeof vi.fn> } {
      return {
        onExtract: vi.fn(),
        labels: {
          value: 'Add as column',
          length: 'Add length as column',
          size: 'Add size as column',
          tag: 'Add tag as column',
        },
      };
    }

    it('shows the footer buttons the active node allows, and asks with its path', async () => {
      const extract = extractHook();
      const { bridge } = makeBridge(() => jsonRow('["a","b"]'));
      const inspector = mount(bridge, { extract });
      openOn(inspector);
      await settle();
      await nextFrame();

      const visible = (): string[] =>
        Array.from(
          panel(inspector).querySelectorAll<HTMLButtonElement>(
            '.dt-value-inspector__button:not([hidden])',
          ),
          (b) => b.textContent ?? '',
        );
      // The root (a list) is active: its length only.
      expect(visible()).toEqual(['Add length as column', 'Copy JSON', 'Close']);
      panel(inspector)
        .querySelector<HTMLButtonElement>('.dt-value-inspector__button:not([hidden])')!
        .click();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ column: 'tags', path: [], extract: 'length', row: 3, rowId: 3 }),
      );

      // ↓ to the second element: its value.
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      expect(visible()).toEqual(['Add as column', 'Copy JSON', 'Close']);

      // Ctrl/Cmd+Enter adds the active node's value; the hover affordance too.
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: [2], extract: 'value' }),
      );
      const add = items(inspector)[1]!.querySelector<HTMLElement>('.dt-value-tree__add')!;
      expect(add.getAttribute('aria-hidden')).toBe('true');
      expect(add.title).toBe('Add as column');
      add.click();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: [1], extract: 'value' }),
      );
      // The root's value is not addable: no affordance on its row.
      expect(items(inspector)[0]!.querySelector('.dt-value-tree__add')).toBeNull();
      inspector.destroy();
    });

    /** The footer buttons shown for each row, as the tree's ↓ walks them. */
    async function offers(
      column: ColumnSchema,
      text: string,
    ): Promise<{ offers: string[][]; extract: ReturnType<typeof extractHook> }> {
      const extract = extractHook();
      const { bridge } = makeBridge(() => jsonRow(text));
      const inspector = mount(bridge, { extract });
      openOn(inspector, column);
      await settle();
      await nextFrame();
      const out: string[][] = [];
      // One row at a time, top to bottom: ↓ moves the active item, and the buttons follow.
      for (const _item of items(inspector)) {
        out.push(
          Array.from(
            panel(inspector).querySelectorAll<HTMLButtonElement>(
              '.dt-value-inspector__button:not([hidden])',
            ),
            (b) => b.textContent ?? '',
          ).slice(0, -2),
        );
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
      }
      inspector.destroy();
      return { offers: out, extract };
    }

    it('offers by the column’s type: nothing on a struct, values on its fields', async () => {
      const { offers: rows } = await offers(POINT, '{"x":1.5,"y":-0.5,"tier":"gold"}');
      expect(rows).toEqual([[], ['Add as column'], ['Add as column'], ['Add as column']]);
    });

    it('offers a map’s size, and its values', async () => {
      const attrs: ColumnSchema = {
        name: 'attrs',
        type: 'nested',
        nullable: true,
        originalType: 'MAP(VARCHAR, INTEGER)',
      };
      const { offers: rows } = await offers(attrs, '{"k1":1,"k2":2}');
      expect(rows).toEqual([['Add size as column'], ['Add as column'], ['Add as column']]);
    });

    it('offers a union’s tag, and its member’s value', async () => {
      const u: ColumnSchema = {
        name: 'u',
        type: 'nested',
        nullable: true,
        originalType: 'UNION(num INTEGER, str VARCHAR)',
      };
      const { offers: rows } = await offers(u, '{"num":42}');
      expect(rows).toEqual([['Add tag as column'], ['Add as column']]);
    });

    it('inside JSON, offers length on arrays only, and reads each value as its kind', async () => {
      const doc: ColumnSchema = {
        name: 'doc',
        type: 'string',
        nullable: true,
        originalType: 'JSON',
      };
      const extract = extractHook();
      const { bridge } = makeBridge(() =>
        jsonRow('{"a":[1,2],"n":1.5,"b":true,"s":"x","o":{"k":null}}'),
      );
      const inspector = mount(bridge, { extract });
      openOn(inspector, doc);
      await settle();
      await nextFrame();
      const visible = (): string[] =>
        Array.from(
          panel(inspector).querySelectorAll<HTMLButtonElement>(
            '.dt-value-inspector__button:not([hidden])',
          ),
          (b) => b.textContent ?? '',
        ).slice(0, -2);
      const down = (): void => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
        );
      };
      const add = (): void => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      };

      // The document itself: an object, so no length.
      expect(visible()).toEqual(['Add as column']);
      down(); // a: [1, 2]
      expect(visible()).toEqual(['Add as column', 'Add length as column']);
      add();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ column: 'doc', path: ['a'], extract: 'value', jsonLeaf: 'json' }),
      );
      panel(inspector)
        .querySelectorAll<HTMLButtonElement>('.dt-value-inspector__button:not([hidden])')[1]!
        .click();
      expect(extract.onExtract.mock.lastCall![0]).toMatchObject({ path: ['a'], extract: 'length' });
      expect(extract.onExtract.mock.lastCall![0]).not.toHaveProperty('jsonLeaf');
      down(); // a[0], expanded: the second level fits
      down(); // a[1]
      down(); // n
      add();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: ['n'], jsonLeaf: 'number' }),
      );
      down(); // b
      add();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: ['b'], jsonLeaf: 'boolean' }),
      );
      down(); // s
      add();
      expect(extract.onExtract).toHaveBeenLastCalledWith(
        expect.objectContaining({ path: ['s'], jsonLeaf: 'string' }),
      );
      inspector.destroy();
    });

    it('offers nothing on a bucket', async () => {
      const list: ColumnSchema = {
        name: 'long_list',
        type: 'nested',
        nullable: true,
        originalType: 'INTEGER[]',
      };
      const text = JSON.stringify(Array.from({ length: 250 }, (_, i) => i));
      const { offers: rows } = await offers(list, text);
      // The root, then its three buckets ([1 … 100], [101 … 200], [201 … 250]).
      expect(rows).toEqual([['Add length as column'], [], [], []]);
    });

    it('without the hook, has no extract buttons, no affordance and no Ctrl/Cmd+Enter', async () => {
      const { bridge } = makeBridge(() => jsonRow('["a"]'));
      const inspector = mount(bridge);
      openOn(inspector);
      await settle();
      expect(panel(inspector).querySelectorAll('.dt-value-inspector__button')).toHaveLength(2);
      expect(panel(inspector).querySelector('.dt-value-tree__add')).toBeNull();
      const leaf = items(inspector)[1]!;
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      leaf.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      inspector.destroy();
    });
  });

  describe('placement', () => {
    function rect(top: number, left: number, width: number, height: number): DOMRect {
      return {
        top,
        left,
        width,
        height,
        bottom: top + height,
        right: left + width,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    }

    beforeEach(() => {
      root.getBoundingClientRect = () => rect(0, 0, 800, 600);
      Object.defineProperty(root, 'clientHeight', { configurable: true, value: 600 });
      Object.defineProperty(root, 'clientWidth', { configurable: true, value: 800 });
    });

    it('opens below the cell when 240 px fit there', () => {
      cell.getBoundingClientRect = () => rect(100, 50, 150, 32);
      const { bridge } = makeBridge(() => new Promise(() => {}));
      const inspector = mount(bridge);
      openOn(inspector);
      const style = panel(inspector).style;
      expect(style.top).toBe('136px');
      expect(style.bottom).toBe('');
      expect(style.left).toBe('50px');
      expect(style.maxHeight).toBe(`${600 - 132 - 4 - 8}px`);
      inspector.destroy();
    });

    it('opens above the cell when it is too near the bottom', () => {
      cell.getBoundingClientRect = () => rect(500, 50, 150, 32);
      const { bridge } = makeBridge(() => new Promise(() => {}));
      const inspector = mount(bridge);
      openOn(inspector);
      const style = panel(inspector).style;
      expect(style.top).toBe('');
      expect(style.bottom).toBe('104px');
      expect(style.maxHeight).toBe(`${500 - 4 - 8}px`);
      inspector.destroy();
    });
  });
});
