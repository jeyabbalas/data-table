/**
 * @vitest-environment jsdom
 *
 * TreeView — the WAI-ARIA APG tree on a flat DOM.
 *
 * Two invariants are checked after nearly every step rather than once:
 * - the roving tab stop: exactly one item has `tabindex="0"`, it is the only
 *   `aria-selected="true"` item, and it is the active node's;
 * - the structure: every visible item's `aria-posinset` / `aria-setsize`
 *   count its own sibling list (the children of one parent), its level is at
 *   most one deeper than the item before it, its parent is expanded, and
 *   `--dt-tree-level` repeats `aria-level`.
 *
 * jsdom has no layout, so scrolling is not covered here; `reveal` is a no-op
 * when every measurement is 0.
 */
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';
import {
  TreeView,
  type TreeViewNode,
  type TreeViewOptions,
  closeIcon,
  element,
} from '@/table/TreeView';

type Spec = TreeViewNode<string>;

/** An end node whose row shows its label. */
function leaf(id: string, label: string = id, extra: Partial<Spec> = {}): Spec {
  return {
    label,
    render: (content) => {
      content.textContent = label;
    },
    data: id,
    ...extra,
  };
}

/** An expandable node. `children` is a spy, so tests can count the loads. */
function branch(
  id: string,
  kids: Spec[],
  label: string = id,
  extra: Partial<Spec> = {},
): Spec & { children: ReturnType<typeof vi.fn<() => Spec[]>> } {
  return {
    label,
    render: (content) => {
      content.textContent = label;
    },
    children: vi.fn(() => kids),
    data: id,
    ...extra,
  } as Spec & { children: ReturnType<typeof vi.fn<() => Spec[]>> };
}

/**
 * fruits
 *   apple
 *   banana
 *     cavendish
 *     plantain
 *   cherry
 * vegetables
 *   carrot
 *   potato
 * grains
 */
function food() {
  const banana = branch('banana', [leaf('cavendish'), leaf('plantain')]);
  const fruits = branch('fruits', [leaf('apple'), banana, leaf('cherry')]);
  const vegetables = branch('vegetables', [leaf('carrot'), leaf('potato')]);
  return { roots: [fruits, vegetables, leaf('grains')], fruits, banana, vegetables };
}

/**
 * A list of `total` values split the way the value model splits big
 * containers: ordinary expandable bucket nodes of `size` items each.
 */
function bucketedList(total: number, size = 100) {
  const buckets: ReturnType<typeof branch>[] = [];
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(start + size - 1, total);
    const values: Spec[] = [];
    for (let i = start; i <= end; i++) values.push(leaf(`list.${i}`, `${i}: v${i}`));
    buckets.push(branch(`list.${start}-${end}`, values, `[${start} … ${end}]`));
  }
  return { list: branch('list', buckets, `list: ${total} items`), buckets };
}

const trees: TreeView<any>[] = [];

/** Build a tree, attach it so `focus()` works in jsdom, and destroy it after the test. */
function mount<T>(roots: TreeViewNode<T>[], options: TreeViewOptions<T> = {}): TreeView<T> {
  const tree = new TreeView(roots, { label: 'Value', ...options });
  document.body.appendChild(tree.getElement());
  trees.push(tree);
  return tree;
}

function items(tree: TreeView<any>): HTMLElement[] {
  return Array.from(tree.getElement().querySelectorAll<HTMLElement>('[role="treeitem"]'));
}

function itemFor(tree: TreeView<any>, label: string): HTMLElement {
  const item = items(tree).find((i) => i.getAttribute('aria-label') === label);
  if (!item) throw new Error(`no visible item "${label}"`);
  return item;
}

/**
 * The visible rows as `label posinset/setsize`, indented two spaces per level
 * below the first, with ` [-]` for an open node and ` [+]` for a closed one.
 */
function outline(tree: TreeView<any>): string[] {
  return items(tree).map((item) => {
    const level = Number(item.getAttribute('aria-level'));
    const expanded = item.getAttribute('aria-expanded');
    const state = expanded === 'true' ? ' [-]' : expanded === 'false' ? ' [+]' : '';
    return (
      `${'  '.repeat(level - 1)}${item.getAttribute('aria-label')} ` +
      `${item.getAttribute('aria-posinset')}/${item.getAttribute('aria-setsize')}${state}`
    );
  });
}

function expectOneTabStop(tree: TreeView<any>): void {
  const all = items(tree);
  const stops = all.filter((i) => i.getAttribute('tabindex') === '0');
  expect(stops).toHaveLength(1);
  expect(stops[0]).toBe(tree.getActiveItem());
  expect(stops[0]!.getAttribute('aria-label')).toBe(tree.getActive()?.label);
  // Nothing else in the tree is a tab stop either.
  expect(tree.getElement().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  const wrong = all
    .filter((item) => {
      const active = item === stops[0];
      return (
        item.getAttribute('tabindex') !== (active ? '0' : '-1') ||
        item.getAttribute('aria-selected') !== (active ? 'true' : 'false')
      );
    })
    .map((item) => item.getAttribute('aria-label'));
  expect(wrong).toEqual([]);
}

/** Collects every structural problem, so a failure lists them all at once. */
function expectConsistentStructure(tree: TreeView<any>): void {
  const el = tree.getElement();
  const problems: string[] = [];
  const siblingLists = new Map<Element | null, Element[]>();
  const lastAtLevel: Element[] = [];
  let previousLevel = 0;
  for (const item of Array.from(el.children)) {
    const label = item.getAttribute('aria-label');
    // Flat: every child of the tree is a treeitem.
    if (item.getAttribute('role') !== 'treeitem') problems.push(`${label}: not a treeitem`);
    const level = Number(item.getAttribute('aria-level'));
    if (!(level >= 1 && level <= previousLevel + 1)) problems.push(`${label}: level ${level}`);
    const indent = (item as HTMLElement).style.getPropertyValue('--dt-tree-level');
    if (indent !== String(level)) problems.push(`${label}: --dt-tree-level ${indent}`);
    const parent = level === 1 ? null : (lastAtLevel[level - 1] ?? null);
    if (parent && parent.getAttribute('aria-expanded') !== 'true') {
      problems.push(`${label}: shown under a closed parent`);
    }
    lastAtLevel[level] = item;
    lastAtLevel.length = level + 1;
    previousLevel = level;
    const list = siblingLists.get(parent) ?? [];
    list.push(item);
    siblingLists.set(parent, list);
  }
  for (const list of siblingLists.values()) {
    list.forEach((item, index) => {
      const position = `${item.getAttribute('aria-posinset')}/${item.getAttribute('aria-setsize')}`;
      if (position !== `${index + 1}/${list.length}`) {
        problems.push(
          `${item.getAttribute('aria-label')}: ${position}, not ${index + 1}/${list.length}`,
        );
      }
    });
  }
  if (el.querySelector('[role="group"]')) problems.push('a role="group" exists');
  expect(problems).toEqual([]);
}

function expectInvariants(tree: TreeView<any>): void {
  expectOneTabStop(tree);
  expectConsistentStructure(tree);
}

/** Dispatch a keydown where a browser would: on the focused element. */
function press(
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function mouse(type: string, target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function expectFocusOnActive(tree: TreeView<any>): void {
  expect(document.activeElement).toBe(tree.getActiveItem());
}

afterEach(() => {
  for (const tree of trees.splice(0)) tree.destroy();
  __resetModalHostForTests();
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('TreeView — structure', () => {
  it('renders a flat role="tree" whose items carry level, set size, position and expansion', () => {
    const { roots } = food();
    const tree = mount(roots, {
      label: 'Food',
      initiallyExpanded: (node) => node.data === 'fruits',
    });
    const el = tree.getElement();

    expect(el.getAttribute('role')).toBe('tree');
    expect(el.getAttribute('aria-label')).toBe('Food');
    expect(el.hasAttribute('aria-multiselectable')).toBe(false);
    expect(outline(tree)).toEqual([
      'fruits 1/3 [-]',
      '  apple 1/3',
      '  banana 2/3 [+]',
      '  cherry 3/3',
      'vegetables 2/3 [+]',
      'grains 3/3',
    ]);
    // End nodes carry no aria-expanded at all.
    expect(itemFor(tree, 'apple').hasAttribute('aria-expanded')).toBe(false);
    expect(itemFor(tree, 'grains').hasAttribute('aria-expanded')).toBe(false);
    expectInvariants(tree);
  });

  it('builds each row from a decorative twisty and the content the node renders', () => {
    const tree = mount([leaf('x', 'x: 1.25')]);
    const item = items(tree)[0]!;

    expect(tree.getElement().className).toBe('dt-value-tree');
    expect(item.className).toBe('dt-value-tree__item');
    expect(item.getAttribute('aria-label')).toBe('x: 1.25');
    const [twisty, content, ...rest] = Array.from(item.children);
    expect(twisty!.className).toBe('dt-value-tree__twisty');
    expect(twisty!.getAttribute('aria-hidden')).toBe('true');
    expect(content!.className).toBe('dt-value-tree__content');
    expect(content!.textContent).toBe('x: 1.25');
    expect(rest).toEqual([]);
    // The indentation property is the only inline style.
    expect(item.getAttribute('style')).toBe('--dt-tree-level: 1;');
  });

  it('derives every class name from classPrefix', () => {
    const tree = mount([branch('point', [leaf('x', 'x', { actionable: true })])], {
      classPrefix: 'acme',
      initiallyExpanded: () => true,
      onAction: () => {},
    });
    const el = tree.getElement();

    expect(el.className).toBe('acme-value-tree');
    expect(el.querySelectorAll('.acme-value-tree__item')).toHaveLength(2);
    expect(el.querySelectorAll('.acme-value-tree__twisty')).toHaveLength(2);
    expect(el.querySelectorAll('.acme-value-tree__content')).toHaveLength(2);
    expect(el.querySelectorAll('.acme-value-tree__add')).toHaveLength(1);
    expect(el.querySelector('[class*="dt-"]')).toBeNull();
  });

  it('never parses markup out of a label', () => {
    const label = '<img src=x onerror="window.__pwned = true">';
    const tree = mount([leaf('evil', label)]);
    expect(tree.getElement().querySelector('img')).toBeNull();
    expect(items(tree)[0]!.getAttribute('aria-label')).toBe(label);
  });

  it('builds an empty tree with no tab stop', () => {
    const tree = mount([]);
    expect(items(tree)).toEqual([]);
    expect(tree.getActive()).toBeNull();
    expect(tree.getActiveItem()).toBeNull();
    tree.focus();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('TreeView — roving tab stop', () => {
  it('starts on the first root, without reporting it as a change', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, { onActiveChange });

    expect(tree.getActive()?.data).toBe('fruits');
    expect(tree.getActive()?.data).toBe('fruits');
    expectInvariants(tree);
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it('rewrites two attributes on two elements per keystroke, in a tree of 3,000 rows', () => {
    const roots = Array.from({ length: 30 }, (_, r) =>
      branch(
        `r${r}`,
        Array.from({ length: 100 }, (_, c) => leaf(`r${r}.${c}`, `item ${r}.${c}`)),
        `root ${r}`,
      ),
    );
    const tree = mount(roots, { initiallyExpanded: () => true });
    expect(items(tree)).toHaveLength(3030);
    tree.focus();

    const observer = new MutationObserver(() => {});
    observer.observe(tree.getElement(), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    press('ArrowDown');
    press('End');
    const records = observer.takeRecords();
    observer.disconnect();

    expect(records.every((r) => r.type === 'attributes')).toBe(true);
    // root 0 → item 0.0 → item 29.99: three distinct items, two per keystroke.
    expect(records).toHaveLength(8);
    expect(new Set(records.map((r) => r.attributeName))).toEqual(
      new Set(['tabindex', 'aria-selected']),
    );
    expect(new Set(records.slice(0, 4).map((r) => r.target)).size).toBe(2);
    expect(tree.getActive()?.data).toBe('r29.99');
    expectInvariants(tree);
    // Headroom: 3,000 rows are slow to build in jsdom, slower under coverage.
  }, 20_000);

  it('follows focus that arrives from outside its own keys', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, { onActiveChange });

    itemFor(tree, 'vegetables').focus();

    expect(tree.getActive()?.data).toBe('vegetables');
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange.mock.calls[0]![0].data).toBe('vegetables');
    expectInvariants(tree);
  });
});

describe('TreeView — APG keys', () => {
  it('↓ and ↑ walk the visible items without opening or closing any', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, {
      initiallyExpanded: (node) => node.data === 'fruits',
      onActiveChange,
    });
    tree.focus();

    const visited: string[] = [];
    for (let i = 0; i < 5; i++) {
      const event = press('ArrowDown');
      expect(event.defaultPrevented).toBe(true);
      visited.push(tree.getActive()!.data);
      expectFocusOnActive(tree);
      expectInvariants(tree);
    }
    expect(visited).toEqual(['apple', 'banana', 'cherry', 'vegetables', 'grains']);
    expect(outline(tree)).toHaveLength(6);

    press('ArrowUp');
    press('ArrowUp');
    expect(tree.getActive()?.data).toBe('cherry');
    expect(onActiveChange.mock.calls.map(([node]) => node.data)).toEqual([
      ...visited,
      'vegetables',
      'cherry',
    ]);
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('↓ on the last item and ↑ on the first change nothing, but keep the browser from scrolling', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, { onActiveChange });
    tree.focus();

    expect(press('ArrowUp').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('fruits');
    press('End');
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('grains');
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expectInvariants(tree);
  });

  it('→ opens a closed node, then moves to its first child; does nothing on an end node', () => {
    const tree = mount(food().roots);
    tree.focus();

    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('fruits');
    expect(outline(tree)).toEqual([
      'fruits 1/3 [-]',
      '  apple 1/3',
      '  banana 2/3 [+]',
      '  cherry 3/3',
      'vegetables 2/3 [+]',
      'grains 3/3',
    ]);
    expectFocusOnActive(tree);
    expectInvariants(tree);

    press('ArrowRight');
    expect(tree.getActive()?.data).toBe('apple');
    expectFocusOnActive(tree);

    const before = outline(tree);
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('apple');
    expect(outline(tree)).toEqual(before);
    expectInvariants(tree);
  });

  it('← closes an open node, moves a child to its parent, and does nothing on a closed root', () => {
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    itemFor(tree, 'cavendish').focus();

    press('ArrowLeft');
    expect(tree.getActive()?.data).toBe('banana');
    expectFocusOnActive(tree);

    press('ArrowLeft');
    expect(tree.getActive()?.data).toBe('banana');
    expect(itemFor(tree, 'banana').getAttribute('aria-expanded')).toBe('false');
    expect(items(tree).map((i) => i.getAttribute('aria-label'))).not.toContain('cavendish');
    expectInvariants(tree);

    press('ArrowLeft');
    expect(tree.getActive()?.data).toBe('fruits');
    press('ArrowLeft');
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('false');

    const before = outline(tree);
    expect(press('ArrowLeft').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('fruits');
    expect(outline(tree)).toEqual(before);
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('Home and End jump to the first and last visible items', () => {
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    tree.focus();

    expect(press('End').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('grains');
    expectFocusOnActive(tree);
    expect(press('Home').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('fruits');
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('* expands every expandable sibling at the active level, and nothing else', () => {
    const { roots } = food();
    const tree = mount(roots);
    tree.focus();
    press('ArrowDown');
    expect(tree.getActive()?.data).toBe('vegetables');

    // Shift+8 on many layouts.
    const event = press('*', { shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('vegetables');
    expectFocusOnActive(tree);
    expect(outline(tree)).toEqual([
      'fruits 1/3 [-]',
      '  apple 1/3',
      '  banana 2/3 [+]',
      '  cherry 3/3',
      'vegetables 2/3 [-]',
      '  carrot 1/2',
      '  potato 2/2',
      'grains 3/3',
    ]);
    expectInvariants(tree);

    // From inside fruits, only fruits' children are its siblings.
    itemFor(tree, 'apple').focus();
    press('*');
    expect(itemFor(tree, 'banana').getAttribute('aria-expanded')).toBe('true');
    expect(outline(tree)).toHaveLength(10);
    expectInvariants(tree);
  });

  it('Enter and Space toggle an expandable node in place', () => {
    const tree = mount(food().roots);
    tree.focus();

    expect(press('Enter').defaultPrevented).toBe(true);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('true');
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('false');
    expect(press(' ').defaultPrevented).toBe(true);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('true');
    expect(press(' ').defaultPrevented).toBe(true);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('false');
    expect(tree.getActive()?.data).toBe('fruits');
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('leaves Enter on an end node to the host, and claims Space there only to stop a page scroll', () => {
    const onHostKey = vi.fn();
    document.addEventListener('keydown', onHostKey);
    const tree = mount(food().roots);
    tree.focus();
    press('End');
    onHostKey.mockClear();
    const before = outline(tree);

    const enter = press('Enter');
    expect(enter.defaultPrevented).toBe(false);
    expect(onHostKey).toHaveBeenCalledTimes(1);

    const space = press(' ');
    expect(space.defaultPrevented).toBe(true);
    expect(outline(tree)).toEqual(before);
    document.removeEventListener('keydown', onHostKey);
  });

  it('Ctrl+C and Cmd+C hand the active node to onCopy', () => {
    const onCopy = vi.fn();
    const tree = mount(food().roots, { onCopy });
    tree.focus();
    press('ArrowDown');

    expect(press('c', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press('c', { metaKey: true }).defaultPrevented).toBe(true);
    // Caps Lock.
    expect(press('C', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(onCopy).toHaveBeenCalledTimes(3);
    expect(onCopy.mock.calls.every(([node]) => node.data === 'vegetables')).toBe(true);

    expect(press('c', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press('c', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(onCopy).toHaveBeenCalledTimes(3);
    expectInvariants(tree);
  });

  it('leaves Ctrl+C to the browser while text is selected inside the tree', () => {
    const onCopy = vi.fn();
    const outside = document.createElement('p');
    outside.textContent = 'stale selection elsewhere on the page';
    document.body.appendChild(outside);
    const tree = mount(food().roots, { onCopy });
    tree.focus();
    const selection = document.getSelection()!;

    const inside = document.createRange();
    inside.selectNodeContents(tree.getActiveItem()!.querySelector('.dt-value-tree__content')!);
    selection.removeAllRanges();
    selection.addRange(inside);
    expect(press('c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();

    // A selection somewhere else does not own the shortcut: focus is here.
    const elsewhere = document.createRange();
    elsewhere.selectNodeContents(outside);
    selection.removeAllRanges();
    selection.addRange(elsewhere);
    expect(press('c', { metaKey: true }).defaultPrevented).toBe(true);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl+C to the browser when there is no onCopy', () => {
    const tree = mount(food().roots);
    tree.focus();
    expect(press('c', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('Ctrl+Enter and Cmd+Enter hand an actionable node to onAction, and nothing else', () => {
    const onAction = vi.fn();
    const tree = mount([leaf('x', 'x', { actionable: true }), branch('point', [])], { onAction });
    tree.focus();

    expect(press('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press('Enter', { metaKey: true }).defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction.mock.calls.every(([node]) => node.data === 'x')).toBe(true);

    press('ArrowDown');
    const event = press('Enter', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(onAction).toHaveBeenCalledTimes(2);
    // Not mistaken for a plain Enter either.
    expect(itemFor(tree, 'point').getAttribute('aria-expanded')).toBe('false');
    expectInvariants(tree);
  });

  it('leaves Ctrl+Enter alone when there is no onAction', () => {
    const tree = mount([leaf('x', 'x', { actionable: true })]);
    tree.focus();
    expect(press('Enter', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('never claims Tab, Shift+Tab or Escape, and lets them reach the host', () => {
    const onHostKey = vi.fn();
    document.addEventListener('keydown', onHostKey);
    const tree = mount(food().roots, { onCopy: () => {}, onAction: () => {} });
    tree.focus();

    for (const [key, init] of [
      ['Tab', {}],
      ['Tab', { shiftKey: true }],
      ['Escape', {}],
    ] as const) {
      const event = press(key, init);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onHostKey).toHaveBeenCalledTimes(3);
    expect(tree.getActive()?.data).toBe('fruits');
    document.removeEventListener('keydown', onHostKey);
  });

  it('leaves keys it has no use for alone', () => {
    const onHostKey = vi.fn();
    document.addEventListener('keydown', onHostKey);
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    tree.focus();

    for (const [key, init] of [
      ['ArrowDown', { shiftKey: true }],
      ['ArrowDown', { altKey: true }],
      ['ArrowDown', { ctrlKey: true }],
      ['F2', {}],
      ['PageDown', {}],
      ['a', { ctrlKey: true }],
      ['Shift', { shiftKey: true }],
    ] as const) {
      expect(press(key, init).defaultPrevented).toBe(false);
    }
    expect(onHostKey).toHaveBeenCalledTimes(7);
    expect(tree.getActive()?.data).toBe('fruits');
    document.removeEventListener('keydown', onHostKey);
  });

  it('stops the keys it claims from reaching the host', () => {
    const onHostKey = vi.fn();
    document.addEventListener('keydown', onHostKey);
    const tree = mount(food().roots, { onCopy: () => {} });
    tree.focus();

    for (const key of [
      'ArrowDown',
      'ArrowUp',
      'ArrowRight',
      'ArrowLeft',
      'Home',
      'End',
      '*',
      ' ',
    ]) {
      press(key);
    }
    press('c', { ctrlKey: true });
    expect(onHostKey).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onHostKey);
  });

  it('leaves keys typed into a field inside a row to the field', () => {
    const withField: Spec = {
      data: 'field',
      label: 'field',
      render: (content) => content.appendChild(document.createElement('input')),
    };
    const tree = mount([withField, leaf('next')]);
    const input = tree.getElement().querySelector('input')!;
    input.focus();

    expect(press('ArrowDown', {}, input).defaultPrevented).toBe(false);
    expect(press('n', {}, input).defaultPrevented).toBe(false);
    expect(tree.getActive()?.data).toBe('field');
  });

  it('leaves Escape to the panel hosting the tree', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const tree = new TreeView(food().roots, { label: 'Value' });
    trees.push(tree);
    panel.appendChild(tree.getElement());
    const onClose = vi.fn();
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel, initialFocus: tree.getActiveItem(), onClose });
    tree.focus();
    press('ArrowDown');

    press('Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(host.isOpen).toBe(false);
  });
});

describe('TreeView — type-ahead', () => {
  const fruitBowl = () =>
    ['apple', 'apricot', 'banana', 'blueberry', 'cherry'].map((name) => leaf(name));

  it('moves to the next item starting with a typed character, wrapping', () => {
    vi.useFakeTimers();
    const tree = mount(fruitBowl());
    tree.focus();

    expect(press('b').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('banana');
    expectFocusOnActive(tree);

    vi.advanceTimersByTime(600);
    press('a');
    expect(tree.getActive()?.data).toBe('apple');
    expectInvariants(tree);
  });

  it('cycles through the items starting with a character typed again and again', () => {
    vi.useFakeTimers();
    const tree = mount(fruitBowl());
    tree.focus();

    press('b');
    press('b');
    expect(tree.getActive()?.data).toBe('blueberry');
    press('b');
    expect(tree.getActive()?.data).toBe('banana');
    expectInvariants(tree);
  });

  it('matches several characters typed in quick succession, from the active item on', () => {
    vi.useFakeTimers();
    const tree = mount(fruitBowl());
    tree.focus();

    press('a');
    expect(tree.getActive()?.data).toBe('apricot');
    vi.advanceTimersByTime(600);
    press('a');
    expect(tree.getActive()?.data).toBe('apple');
    // "ap" still fits apple, so it stays; "apr" moves on.
    press('p');
    expect(tree.getActive()?.data).toBe('apple');
    press('r');
    expect(tree.getActive()?.data).toBe('apricot');
    // Shift for capitals, matched without case.
    vi.advanceTimersByTime(600);
    press('C', { shiftKey: true });
    expect(tree.getActive()?.data).toBe('cherry');
    expectInvariants(tree);
  });

  it('starts a new word after a pause or a navigation key', () => {
    vi.useFakeTimers();
    const tree = mount(fruitBowl());
    tree.focus();

    press('b');
    press('l');
    expect(tree.getActive()?.data).toBe('blueberry');
    vi.advanceTimersByTime(600);
    press('a');
    expect(tree.getActive()?.data).toBe('apple');

    // Without the reset on ArrowDown, "bc" would match nothing.
    vi.advanceTimersByTime(600);
    press('b');
    press('ArrowDown');
    expect(tree.getActive()?.data).toBe('blueberry');
    press('c');
    expect(tree.getActive()?.data).toBe('cherry');
  });

  it('claims a character that matches nothing, and stays put', () => {
    const tree = mount(fruitBowl());
    tree.focus();
    expect(press('z').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('apple');
  });

  it('only searches visible items', () => {
    const tree = mount(food().roots);
    tree.focus();
    press('c');
    // carrot and cherry are inside collapsed nodes.
    expect(tree.getActive()?.data).toBe('fruits');
  });
});

describe('TreeView — lazy children', () => {
  it('calls children() once, on first expansion, and reuses the rows', () => {
    const { roots, fruits, banana, vegetables } = food();
    const tree = mount(roots);
    tree.focus();

    expect(fruits.children).not.toHaveBeenCalled();
    press('ArrowRight');
    const apple = itemFor(tree, 'apple');
    press('ArrowLeft');
    press('ArrowRight');
    press('Enter');
    press('Enter');

    expect(fruits.children).toHaveBeenCalledTimes(1);
    // The same element, re-attached.
    expect(itemFor(tree, 'apple')).toBe(apple);
    expect(banana.children).not.toHaveBeenCalled();
    expect(vegetables.children).not.toHaveBeenCalled();
    expectInvariants(tree);
  });

  it('renders each node once, however often it is shown', () => {
    const render = vi.fn((content: HTMLElement) => {
      content.textContent = 'apple';
    });
    const fruits = branch('fruits', [{ label: 'apple', render }]);
    const tree = mount([fruits]);
    tree.focus();

    for (let i = 0; i < 3; i++) {
      press('ArrowRight');
      press('ArrowLeft');
    }
    expect(render).toHaveBeenCalledTimes(1);
    expect(fruits.children).toHaveBeenCalledTimes(1);
  });

  it('brings expanded descendants back when an ancestor opens again', () => {
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    const before = outline(tree);
    tree.focus();

    press('ArrowLeft');
    expect(outline(tree)).toEqual([
      'fruits 1/3 [+]',
      'vegetables 2/3 [-]',
      '  carrot 1/2',
      '  potato 2/2',
      'grains 3/3',
    ]);
    press('ArrowRight');

    expect(outline(tree)).toEqual(before);
    expectInvariants(tree);
  });

  it('inserts a node’s 100 children as one block right after it', () => {
    const big = branch(
      'big',
      Array.from({ length: 100 }, (_, i) => leaf(`big.${i}`)),
    );
    const tree = mount([big, leaf('after')]);
    tree.focus();

    const observer = new MutationObserver(() => {});
    observer.observe(tree.getElement(), { childList: true });
    press('ArrowRight');
    const records = observer.takeRecords();
    observer.disconnect();

    expect(records).toHaveLength(1);
    expect(records[0]!.addedNodes).toHaveLength(100);
    const labels = items(tree).map((i) => i.getAttribute('aria-label'));
    expect(labels[1]).toBe('big.0');
    expect(labels[100]).toBe('big.99');
    expect(labels[101]).toBe('after');
    expectInvariants(tree);
  });

  // Every collapse the keys and clicks make is of the active row itself (a
  // twisty click activates its row first). A double click that comes
  // without its two clicks, from assistive technology or automation, is
  // the one that collapses a row the active item is under.
  it('moves the active item, and focus, up to a node that collapses over it', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, { initiallyExpanded: () => true, onActiveChange });
    itemFor(tree, 'plantain').focus();
    expectFocusOnActive(tree);
    onActiveChange.mockClear();

    mouse('dblclick', itemFor(tree, 'fruits').querySelector('.dt-value-tree__content')!);

    expect(tree.getActive()?.data).toBe('fruits');
    expectFocusOnActive(tree);
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange.mock.calls[0]![0].data).toBe('fruits');
    expectInvariants(tree);
  });

  it('moves the active item without stealing focus when the tree did not have it', () => {
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    itemFor(tree, 'plantain').focus();
    elsewhere.focus();

    mouse('dblclick', itemFor(tree, 'banana').querySelector('.dt-value-tree__content')!);

    expect(tree.getActive()?.data).toBe('banana');
    expect(document.activeElement).toBe(elsewhere);
    expectInvariants(tree);
  });

  it('asks initiallyExpanded parents first, with 1-based levels, only while building', () => {
    const asked: [string, number][] = [];
    const deep = branch('a', [branch('a1', [leaf('a1x')])]);
    const later = branch('b', [branch('b1', [leaf('b1x')])]);
    const tree = mount([deep, later], {
      initiallyExpanded: (node, level) => {
        asked.push([node.data, level]);
        return node.data === 'a' || level === 2;
      },
    });

    expect(asked).toEqual([
      ['a', 1],
      ['a1', 2],
      ['b', 1],
    ]);
    expect(outline(tree)).toEqual(['a 1/2 [-]', '  a1 1/1 [-]', '    a1x 1/1', 'b 2/2 [+]']);

    // Nodes loaded later start collapsed, whatever the policy would say.
    mouse('click', itemFor(tree, 'b').querySelector('.dt-value-tree__twisty')!);
    expect(outline(tree)).toEqual([
      'a 1/2 [-]',
      '  a1 1/1 [-]',
      '    a1x 1/1',
      'b 2/2 [-]',
      '  b1 1/1 [+]',
    ]);
    expect(asked).toHaveLength(3);
    expectInvariants(tree);
  });

  it('expresses "the root open, and the second level too while that stays within 50 rows"', () => {
    function inspect(fieldsPerStruct: number): TreeView<string> {
      const structs = ['p', 'q', 'r'].map((name) =>
        branch(
          name,
          Array.from({ length: fieldsPerStruct }, (_, i) => leaf(`${name}.${i}`)),
        ),
      );
      const secondLevelRows = structs.length * fieldsPerStruct;
      return mount([branch('root', structs)], {
        initiallyExpanded: (_node, level) => level === 1 || (level === 2 && secondLevelRows <= 50),
      });
    }

    expect(items(inspect(10))).toHaveLength(1 + 3 + 30);
    expect(items(inspect(20))).toHaveLength(1 + 3);
  });

  it('keeps children() to one call when a row fails to render', () => {
    let broken = true;
    const flaky: Spec = {
      data: 'flaky',
      label: 'flaky',
      render: (content) => {
        if (broken) throw new Error('render failed');
        content.textContent = 'flaky';
      },
    };
    const parent = branch('parent', [flaky]);
    const tree = mount([parent]);
    tree.focus();
    // The throw escapes the key's listener, which reports it rather than
    // throwing to the dispatcher.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent): void => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);

    press('ArrowRight');
    expect(errors).toEqual([new Error('render failed')]);
    expect(outline(tree)).toEqual(['parent 1/1 [+]']);

    broken = false;
    press('ArrowRight');
    window.removeEventListener('error', onError);
    expect(outline(tree)).toEqual(['parent 1/1 [-]', '  flaky 1/1']);
    expect(parent.children).toHaveBeenCalledTimes(1);
    expectInvariants(tree);
  });

  it('opens a node that has no children without moving anywhere', () => {
    const tree = mount([branch('empty', []), leaf('next')]);
    tree.focus();

    press('ArrowRight');
    expect(outline(tree)).toEqual(['empty 1/2 [-]', 'next 2/2']);
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(tree.getActive()?.data).toBe('empty');
    expectInvariants(tree);
  });
});

describe('TreeView — bucketed containers', () => {
  it('counts positions per sibling list through lazy expansion, collapse, re-expansion and *', () => {
    const { list, buckets } = bucketedList(250);
    const tree = mount([list], { initiallyExpanded: (_node, level) => level === 1 });
    tree.focus();

    expect(outline(tree)).toEqual([
      'list: 250 items 1/1 [-]',
      '  [1 … 100] 1/3 [+]',
      '  [101 … 200] 2/3 [+]',
      '  [201 … 250] 3/3 [+]',
    ]);
    expectInvariants(tree);

    // Open the middle bucket from the keyboard.
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowRight');
    let rows = outline(tree);
    expect(rows).toHaveLength(104);
    expect(rows[2]).toBe('  [101 … 200] 2/3 [-]');
    expect(rows[3]).toBe('    101: v101 1/100');
    expect(rows[102]).toBe('    200: v200 100/100');
    expect(rows[103]).toBe('  [201 … 250] 3/3 [+]');
    expectInvariants(tree);

    // * opens the other two buckets too.
    press('*');
    rows = outline(tree);
    expect(rows).toHaveLength(1 + 3 + 250);
    expect(rows[1]).toBe('  [1 … 100] 1/3 [-]');
    expect(rows[2]).toBe('    1: v1 1/100');
    expect(rows[102]).toBe('  [101 … 200] 2/3 [-]');
    expect(rows[152]).toBe('    150: v150 50/100');
    expect(rows[203]).toBe('  [201 … 250] 3/3 [-]');
    expect(rows[233]).toBe('    230: v230 30/50');
    expect(rows[253]).toBe('    250: v250 50/50');
    expect(tree.getActive()?.label).toBe('[101 … 200]');
    expectInvariants(tree);

    // Collapse and re-open the middle bucket: same rows, same attributes.
    const opened = rows;
    press('ArrowLeft');
    expect(outline(tree)).toHaveLength(154);
    expectInvariants(tree);
    press('ArrowRight');
    expect(outline(tree)).toEqual(opened);
    expectInvariants(tree);

    // * from a value inside a bucket: its siblings are end nodes.
    press('ArrowRight');
    expect(tree.getActive()?.label).toBe('101: v101');
    expect(press('*').defaultPrevented).toBe(true);
    expect(outline(tree)).toEqual(opened);

    for (const bucket of buckets) expect(bucket.children).toHaveBeenCalledTimes(1);
    expect(list.children).toHaveBeenCalledTimes(1);
  });
});

describe('TreeView — pointer', () => {
  it('a click makes an item active and focuses it, without toggling it', () => {
    const onActiveChange = vi.fn();
    const tree = mount(food().roots, { onActiveChange });

    mouse('click', itemFor(tree, 'vegetables').querySelector('.dt-value-tree__content')!);

    expect(tree.getActive()?.data).toBe('vegetables');
    expectFocusOnActive(tree);
    expect(itemFor(tree, 'vegetables').getAttribute('aria-expanded')).toBe('false');
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expectInvariants(tree);
  });

  it('a click on the twisty toggles an expandable node, and only activates an end node', () => {
    const tree = mount(food().roots);

    mouse('click', itemFor(tree, 'fruits').querySelector('.dt-value-tree__twisty')!);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('true');
    mouse('click', itemFor(tree, 'vegetables').querySelector('.dt-value-tree__twisty')!);
    expect(tree.getActive()?.data).toBe('vegetables');
    expect(itemFor(tree, 'vegetables').getAttribute('aria-expanded')).toBe('true');
    mouse('click', itemFor(tree, 'vegetables').querySelector('.dt-value-tree__twisty')!);
    expect(itemFor(tree, 'vegetables').getAttribute('aria-expanded')).toBe('false');

    const before = outline(tree);
    mouse('click', itemFor(tree, 'apple').querySelector('.dt-value-tree__twisty')!);
    expect(tree.getActive()?.data).toBe('apple');
    expect(outline(tree)).toEqual(before);
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('a twisty click collapsing over the active item leaves one tab stop', () => {
    const tree = mount(food().roots, { initiallyExpanded: () => true });
    itemFor(tree, 'cavendish').focus();

    mouse('click', itemFor(tree, 'fruits').querySelector('.dt-value-tree__twisty')!);

    expect(tree.getActive()?.data).toBe('fruits');
    expectFocusOnActive(tree);
    expectInvariants(tree);
  });

  it('a double click toggles, except on the twisty, whose own clicks already did', () => {
    const tree = mount(food().roots);

    mouse('dblclick', itemFor(tree, 'fruits').querySelector('.dt-value-tree__content')!);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('true');
    mouse('dblclick', itemFor(tree, 'fruits'));
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('false');

    mouse('dblclick', itemFor(tree, 'fruits').querySelector('.dt-value-tree__twisty')!);
    expect(itemFor(tree, 'fruits').getAttribute('aria-expanded')).toBe('false');

    const before = outline(tree);
    mouse('dblclick', itemFor(tree, 'grains'));
    expect(outline(tree)).toEqual(before);
    expectInvariants(tree);
  });

  it('keeps a double click on an expandable row from selecting a word', () => {
    const tree = mount(food().roots);
    const fruits = itemFor(tree, 'fruits').querySelector('.dt-value-tree__content')!;
    const grains = itemFor(tree, 'grains').querySelector('.dt-value-tree__content')!;

    expect(mouse('mousedown', fruits, { detail: 1 }).defaultPrevented).toBe(false);
    expect(mouse('mousedown', fruits, { detail: 2 }).defaultPrevented).toBe(true);
    // An end node does not toggle, so its words stay selectable.
    expect(mouse('mousedown', grains, { detail: 2 }).defaultPrevented).toBe(false);
  });
});

describe('TreeView — action button', () => {
  function actionTree(onAction: (node: Spec) => void) {
    return mount(
      [
        branch('point', [leaf('x', 'x', { actionable: true })], 'point', { actionable: true }),
        leaf('plain'),
      ],
      { actionTitle: 'Add as column', onAction, initiallyExpanded: () => true },
    );
  }

  it('is rendered for actionable nodes only, hidden from assistive technology and Tab', () => {
    const tree = actionTree(() => {});
    const buttons = tree.getElement().querySelectorAll('.dt-value-tree__add');

    expect(buttons).toHaveLength(2);
    for (const button of Array.from(buttons)) {
      expect(button.getAttribute('aria-hidden')).toBe('true');
      expect(button.getAttribute('tabindex')).toBe('-1');
      expect(button.parentElement!.lastElementChild).toBe(button);
    }
    for (const label of ['point', 'x']) {
      expect(itemFor(tree, label).querySelector('.dt-value-tree__add')!.getAttribute('title')).toBe(
        'Add as column',
      );
    }
    expect(itemFor(tree, 'plain').querySelector('.dt-value-tree__add')).toBeNull();
    expectInvariants(tree);
  });

  it('is not rendered without an onAction to call', () => {
    const tree = mount([leaf('x', 'x', { actionable: true })]);
    expect(tree.getElement().querySelector('.dt-value-tree__add')).toBeNull();
  });

  it('calls onAction on click, making its node active without toggling it', () => {
    const onAction = vi.fn();
    const onActiveChange = vi.fn();
    const tree = mount(
      [leaf('first'), branch('point', [leaf('x')], 'point', { actionable: true })],
      { onAction, onActiveChange },
    );
    const button = itemFor(tree, 'point').querySelector('.dt-value-tree__add')!;

    expect(mouse('mousedown', button).defaultPrevented).toBe(true);
    mouse('click', button);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0].data).toBe('point');
    expect(tree.getActive()?.data).toBe('point');
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expectFocusOnActive(tree);
    expect(itemFor(tree, 'point').getAttribute('aria-expanded')).toBe('false');

    mouse('dblclick', button);
    expect(itemFor(tree, 'point').getAttribute('aria-expanded')).toBe('false');
    expectInvariants(tree);
  });
});

describe('TreeView — destroy', () => {
  it('removes every listener it added and detaches the tree', () => {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const onAction = vi.fn();
    const onActiveChange = vi.fn();
    const tree = new TreeView([leaf('a', 'a', { actionable: true }), leaf('b')], {
      label: 'Value',
      onAction,
      onActiveChange,
      onCopy: () => {},
    });
    document.body.appendChild(tree.getElement());
    const el = tree.getElement();
    const listenersOf = (spy: typeof add) =>
      spy.mock.calls
        .filter((_, i) => spy.mock.contexts[i] === el)
        .map(([type, listener]) => [type, listener]);
    const added = listenersOf(add);
    expect(added.map(([type]) => type).sort()).toEqual(
      ['click', 'dblclick', 'focusin', 'keydown', 'mousedown'].sort(),
    );
    const first = items(tree)[0]!;
    const button = first.querySelector('.dt-value-tree__add')!;

    tree.destroy();

    expect(listenersOf(remove)).toEqual(expect.arrayContaining(added));
    expect(listenersOf(remove)).toHaveLength(added.length);
    expect(el.isConnected).toBe(false);
    // Events on the detached rows reach no handler.
    expect(press('ArrowDown', {}, first).defaultPrevented).toBe(false);
    mouse('click', button);
    expect(mouse('mousedown', button).defaultPrevented).toBe(false);
    expect(onAction).not.toHaveBeenCalled();
    expect(onActiveChange).not.toHaveBeenCalled();
    expect(tree.getActive()?.data).toBe('a');
    expect(() => tree.destroy()).not.toThrow();
  });
});

describe('TreeView — axe', () => {
  it('reports no violations on a tree with open nodes, buckets and action buttons', async () => {
    // Small buckets: the shape matters here, not the count — axe is slow in jsdom.
    const { list } = bucketedList(25, 10);
    const { roots } = food();
    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Value inspector');
    document.body.appendChild(panel);
    const tree = new TreeView(
      [
        list,
        ...roots,
        branch('point', [leaf('x', 'x: 1.25', { actionable: true })], 'point: struct', {
          actionable: true,
        }),
      ],
      {
        label: 'Value',
        initiallyExpanded: () => true,
        actionTitle: 'Add as column',
        onAction: () => {},
      },
    );
    trees.push(tree);
    panel.appendChild(tree.getElement());
    itemFor(tree, '12: v12').focus();
    expect(tree.getActive()?.data).toBe('list.12');
    expect(items(tree).length).toBeGreaterThan(40);

    const results = await axe.run(panel, {
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations', 'passes'],
    });

    const detail = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(',')).join(' | ')}`)
      .join('\n');
    expect(detail).toBe('');
    // The rules this pattern lives or dies by actually ran, and passed.
    const passed = new Set(results.passes.map((p) => p.id));
    for (const rule of [
      'aria-required-children',
      'aria-required-parent',
      'aria-treeitem-name',
      'aria-allowed-attr',
      'aria-valid-attr-value',
      'aria-hidden-focus',
    ]) {
      expect(passed, rule).toContain(rule);
    }
  });
});

describe('TreeView — the helpers the panels share', () => {
  it('builds an element with its class and text, and no class attribute for none', () => {
    const title = element('span', 'dt-x__title', 'tags · Row 4');
    expect(title.tagName).toBe('SPAN');
    expect(title.className).toBe('dt-x__title');
    expect(title.textContent).toBe('tags · Row 4');
    const option = element('option', '');
    expect(option.hasAttribute('class')).toBe(false);
    expect(option.textContent).toBe('');
  });

  it('draws the close button’s × hidden from assistive technology', () => {
    const icon = closeIcon();
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelectorAll('path')).toHaveLength(1);
    expect(closeIcon()).not.toBe(icon);
  });
});

describe('TreeView — inside a shadow root', () => {
  it('moves focus up with the active item when a node collapses over it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const tree = new TreeView(food().roots, { label: 'Food', initiallyExpanded: () => true });
    trees.push(tree);
    shadow.appendChild(tree.getElement());
    itemFor(tree, 'plantain').focus();
    expect(shadow.activeElement).toBe(itemFor(tree, 'plantain'));

    // A double click that comes without its two clicks: see "lazy children".
    mouse('dblclick', itemFor(tree, 'fruits').querySelector('.dt-value-tree__content')!);

    expect(tree.getActive()?.data).toBe('fruits');
    expect(shadow.activeElement).toBe(itemFor(tree, 'fruits'));
    expectInvariants(tree);
  });
});
