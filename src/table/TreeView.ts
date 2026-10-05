/**
 * TreeView — the WAI-ARIA Authoring Practices tree view, on a flat DOM.
 *
 * Every visible node is a direct `role="treeitem"` child of the `role="tree"`
 * element and states its own place in the hierarchy with `aria-level`,
 * `aria-setsize` and `aria-posinset`. The APG's other form nests each node's
 * children in a `role="group"` inside the node, but a treeitem's accessible
 * name is then computed over everything inside it: an expanded struct would
 * be announced together with every field below it. Flat items, each named by
 * its own `aria-label`, are announced as themselves ("x: 1.25, level 2, 1 of
 * 3"), and browsers derive the structure from the levels — the attributes the
 * APG asks for whenever a tree loads its nodes lazily.
 *
 * The tree is one tab stop. Exactly one item carries `tabindex="0"`: the
 * active one, which is also the only item with `aria-selected="true"` (single
 * select, selection follows focus). The APG keys move it — ↑/↓, →/←,
 * Home/End, `*`, Enter/Space and type-ahead — and Ctrl/Cmd+C and
 * Ctrl/Cmd+Enter hand the active node to the caller (`onCopy`, `onAction`).
 * Moving the active item rewrites two attributes on each of two elements;
 * nothing is re-rendered per keystroke.
 *
 * `Tab` and `Escape` are never claimed. Tab is how a keyboard user leaves the
 * tree — trapping it is a WCAG 2.1.2 failure, the history behind
 * `KeyboardNavigator` and `RovingTabindex` — and Escape belongs to the panel
 * hosting the tree: ModalHost ignores an Escape whose default was prevented.
 * Every other key the tree does not act on is left alone as well.
 *
 * Children load lazily: a node's `children()` runs the first time it expands,
 * once. Its rows are built then, inserted after it, and kept: collapsing
 * detaches them, and expanding again re-attaches the same elements, so
 * `render` runs once per node and expanded descendants come back expanded.
 *
 * The tree knows nothing about values, types or buckets. A container too big
 * to list in one go is split by the caller into ordinary expandable nodes
 * (`[1 … 100]`, `[101 … 200]`, …), and `aria-posinset` / `aria-setsize`
 * count siblings — the children of one parent — wherever they come from.
 */

/** Base (BEM block) class name used when the caller gives none. */
const DEFAULT_CLASS_NAME = 'value-tree';

/**
 * A pause this long, in milliseconds, ends a type-ahead word: the next
 * character starts a new one. The APG leaves the number open; half a second
 * is what its own examples use.
 */
const TYPEAHEAD_RESET_MS = 500;

/**
 * One node of a {@link TreeView}: what the row shows, what assistive
 * technology announces for it, and where its children come from.
 *
 * @example
 * const node: TreeViewNode<string> = {
 *   id: 'point',
 *   label: 'point: struct, 2 fields',
 *   render: (content) => {
 *     content.textContent = 'point';
 *   },
 *   children: () => [
 *     { id: 'point.x', label: 'x: 1.25', render: (el) => (el.textContent = 'x: 1.25') },
 *     { id: 'point.y', label: 'y: 0.58', render: (el) => (el.textContent = 'y: 0.58') },
 *   ],
 *   data: 'point',
 * };
 */
export interface TreeViewNode<T = unknown> {
  /**
   * Names the node in {@link TreeView.setActive}, {@link TreeView.expand} and
   * {@link TreeView.collapse}. Unique within the tree; when two nodes share an
   * id, those methods address the one loaded first.
   */
  id: string;
  /**
   * The item's accessible name (`aria-label`), and the text type-ahead
   * matches. It replaces the row's content for assistive technology, so say
   * what a sighted user sees there, beginning with the same words.
   */
  label: string;
  /**
   * Draws the row's visible content into `content`, the row's empty
   * `__content` element (`dt-value-tree__content` by default); the tree adds
   * the twisty and the structure around it. Called once, when the node's row
   * is built. Write caller text with `textContent`, never `innerHTML`.
   */
  render: (content: HTMLElement) => void;
  /**
   * The node's children. A node with it is expandable, one without it is an
   * end node. Called the first time the node expands and never again — every
   * later expansion re-attaches the rows built from this result.
   */
  children?: (() => readonly TreeViewNode<T>[]) | undefined;
  /**
   * Whether the node has an action: a hover button on its row and
   * Ctrl/Cmd+Enter, both calling {@link TreeViewOptions.onAction}. The button
   * is only rendered when `onAction` is set. Default `false`.
   */
  actionable?: boolean | undefined;
  /**
   * `title` of this node's action button, in place of
   * {@link TreeViewOptions.actionTitle}.
   */
  actionTitle?: string | undefined;
  /** Caller payload, handed back on the node in every callback. */
  data?: T | undefined;
}

/** Construction options for {@link TreeView}. */
export interface TreeViewOptions<T = unknown> {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /**
   * Base (BEM block) class name, without the prefix (default:
   * `'value-tree'`). Every class the tree writes derives from it:
   * `${prefix}-${className}` on the tree, and `__item`, `__twisty`,
   * `__content` and `__add` on the parts of each row.
   */
  className?: string | undefined;
  /** Accessible name of the tree (`aria-label`). Give this or `labelledBy`. */
  label?: string | undefined;
  /** Id of the element that names the tree (`aria-labelledby`). */
  labelledBy?: string | undefined;
  /**
   * Which nodes start expanded. Asked once for each expandable node while the
   * tree is built, parents before children, with the node's 1-based level
   * (its `aria-level`). Nodes loaded after construction start collapsed.
   * Default: every node starts collapsed.
   */
  initiallyExpanded?: ((node: TreeViewNode<T>, level: number) => boolean) | undefined;
  /** `title` of the hover action buttons (see {@link TreeViewNode.actionable}). */
  actionTitle?: string | undefined;
  /**
   * The active node changed — by keyboard, pointer, focus,
   * {@link TreeView.setActive}, or a collapse that hid it. Not called for the
   * node that is active when the tree is built: read {@link TreeView.getActive}.
   */
  onActiveChange?: ((node: TreeViewNode<T>) => void) | undefined;
  /**
   * Ctrl/Cmd+C on a node. Not called while text is selected inside the tree:
   * the user chose what to copy, and the browser copies it. Without this
   * callback the keys are left to the browser.
   */
  onCopy?: ((node: TreeViewNode<T>) => void) | undefined;
  /** Ctrl/Cmd+Enter on an actionable node, or a click on its action button. */
  onAction?: ((node: TreeViewNode<T>) => void) | undefined;
}

/** A node's place in the tree, and the row that shows it. */
interface Row<T> {
  readonly node: TreeViewNode<T>;
  readonly parent: Row<T> | null;
  /** 1-based, as `aria-level`. */
  readonly level: number;
  /** The `role="treeitem"` element, attached to the tree exactly while the row is visible. */
  readonly item: HTMLElement;
  readonly twisty: HTMLElement;
  readonly action: HTMLElement | null;
  /** The label as type-ahead compares it. */
  readonly match: string;
  /** What `node.children()` returned, once it has been called. */
  specs: readonly TreeViewNode<T>[] | null;
  /** The rows built from `specs`. */
  children: Row<T>[] | null;
  expanded: boolean;
}

/**
 * A keyboard-first tree of lazily loaded nodes, following the WAI-ARIA
 * Authoring Practices tree view pattern: flat `role="treeitem"` rows with
 * `aria-level` / `aria-setsize` / `aria-posinset`, a roving tab stop, and the
 * APG keys. The value inspector shows one nested cell value in it, and the
 * extract-column picker a column's struct fields.
 *
 * Mount {@link TreeView.getElement} yourself. It is also the scroll container:
 * give it `overflow: auto` and a bounded height, and the tree keeps the active
 * item in view by scrolling itself — never its ancestors, which would jump
 * the table or the host page.
 *
 * Styling hooks, besides the class names: `aria-expanded="true"` /
 * `"false"` on expandable items (end nodes carry none — draw the twisty from
 * it), `aria-selected="true"` on the active item, and `--dt-tree-level` on
 * every item, the same number as its `aria-level` (1 for a root), to indent
 * by. The action button (`__add`) is a pointer-only affordance:
 * `aria-hidden="true"`, `tabindex="-1"`, and it never takes focus; keyboard
 * users reach the same action with Ctrl/Cmd+Enter.
 *
 * @example
 * const tree = new TreeView(roots, {
 *   label: messages.values.treeLabel,
 *   // The root open, and its children too when that stays small.
 *   initiallyExpanded: (_node, level) => level === 1 || (level === 2 && secondLevelRows <= 50),
 *   actionTitle: messages.values.addAsColumn,
 *   onActiveChange: (node) => updateFooter(node.data),
 *   onCopy: (node) => copyJson(node.data),
 *   onAction: (node) => addAsColumn(node.data),
 * });
 * panelBody.appendChild(tree.getElement());
 * modalHost.open({ mode: 'panel', element: panel, initialFocus: tree.getActiveItem() });
 * // On close:
 * tree.destroy();
 */
export class TreeView<T = unknown> {
  private readonly element: HTMLElement;
  private readonly base: string;
  private readonly roots: Row<T>[];
  private readonly rowsByItem = new WeakMap<Element, Row<T>>();
  private readonly rowsById = new Map<string, Row<T>>();
  private readonly actionTitle: string | undefined;
  private readonly onActiveChange: ((node: TreeViewNode<T>) => void) | undefined;
  private readonly onCopy: ((node: TreeViewNode<T>) => void) | undefined;
  private readonly onAction: ((node: TreeViewNode<T>) => void) | undefined;
  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private readonly clickHandler: (e: MouseEvent) => void;
  private readonly dblclickHandler: (e: MouseEvent) => void;
  private readonly mousedownHandler: (e: MouseEvent) => void;
  private readonly focusinHandler: (e: FocusEvent) => void;
  private active: Row<T> | null = null;
  /** The type-ahead word so far, lowercased, and when its last character came. */
  private typed = '';
  private typedAt = 0;
  private destroyed = false;

  constructor(roots: readonly TreeViewNode<T>[], options: TreeViewOptions<T> = {}) {
    this.base = `${options.classPrefix ?? 'dt'}-${options.className ?? DEFAULT_CLASS_NAME}`;
    this.actionTitle = options.actionTitle;
    this.onActiveChange = options.onActiveChange;
    this.onCopy = options.onCopy;
    this.onAction = options.onAction;

    this.element = document.createElement('div');
    this.element.className = this.base;
    this.element.setAttribute('role', 'tree');
    if (options.label !== undefined) this.element.setAttribute('aria-label', options.label);
    if (options.labelledBy !== undefined) {
      this.element.setAttribute('aria-labelledby', options.labelledBy);
    }

    this.roots = this.buildRows(roots, null);

    // Open what the caller wants open, top down, so every answer is given for
    // a node whose parent is already open. Nothing is attached yet, so
    // `expandRow` only loads the children and flags the row.
    const initiallyExpanded = options.initiallyExpanded;
    if (initiallyExpanded) {
      const stack = [...this.roots].reverse();
      for (let row = stack.pop(); row; row = stack.pop()) {
        if (!row.node.children || !initiallyExpanded(row.node, row.level)) continue;
        this.expandRow(row);
        const children = row.children ?? [];
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
    }

    const fragment = document.createDocumentFragment();
    for (const row of visibleRows(this.roots)) fragment.appendChild(row.item);
    this.element.appendChild(fragment);

    const first = this.roots[0];
    if (first) this.setActiveRow(first);

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    this.dblclickHandler = (e: MouseEvent) => this.handleDblClick(e);
    this.mousedownHandler = (e: MouseEvent) => this.handleMouseDown(e);
    this.focusinHandler = (e: FocusEvent) => this.handleFocusIn(e);
    this.element.addEventListener('keydown', this.keydownHandler);
    this.element.addEventListener('click', this.clickHandler);
    this.element.addEventListener('dblclick', this.dblclickHandler);
    this.element.addEventListener('mousedown', this.mousedownHandler);
    this.element.addEventListener('focusin', this.focusinHandler);
  }

  /** The `role="tree"` element. Mount it where the tree belongs. */
  getElement(): HTMLElement {
    return this.element;
  }

  /** The active node, or `null` when the tree has no nodes. */
  getActive(): TreeViewNode<T> | null {
    return this.active?.node ?? null;
  }

  /**
   * The active node's item — the tree's one tab stop — or `null` when the
   * tree has no nodes. Hand it to ModalHost as `initialFocus`.
   */
  getActiveItem(): HTMLElement | null {
    return this.active?.item ?? null;
  }

  /**
   * Make the node with this id the active one: expand its collapsed
   * ancestors, scroll it into view, and move DOM focus to it when focus is
   * already inside the tree ({@link TreeView.focus} moves it from anywhere).
   * Returns `false`, changing nothing, when no loaded node has this id.
   */
  setActive(id: string): boolean {
    if (this.destroyed) return false;
    const row = this.rowsById.get(id);
    if (!row) return false;
    const ancestors: Row<T>[] = [];
    for (let parent = row.parent; parent; parent = parent.parent) ancestors.push(parent);
    // Top down: each expansion then inserts into a visible parent.
    for (let i = ancestors.length - 1; i >= 0; i--) this.expandRow(ancestors[i]);
    this.activate(row, this.containsFocus());
    return true;
  }

  /** Move DOM focus to the active item, scrolling it into view. */
  focus(): void {
    if (this.destroyed || !this.active) return;
    this.focusItem(this.active);
  }

  /**
   * Expand the node with this id, loading its children on first expansion. A
   * node inside a collapsed ancestor is marked expanded and shows its
   * children once the ancestor opens. Returns `false` when no loaded node has
   * this id or the node is an end node.
   */
  expand(id: string): boolean {
    if (this.destroyed) return false;
    const row = this.rowsById.get(id);
    if (!row?.node.children) return false;
    this.expandRow(row);
    return true;
  }

  /**
   * Collapse the node with this id. When the active item was below it, the
   * node becomes the active one (and takes DOM focus if the tree had it).
   * Returns `false` when no loaded node has this id or the node is an end
   * node.
   */
  collapse(id: string): boolean {
    if (this.destroyed) return false;
    const row = this.rowsById.get(id);
    if (!row?.node.children) return false;
    this.collapseRow(row);
    return true;
  }

  /** Remove the listeners and detach the tree element. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.element.removeEventListener('keydown', this.keydownHandler);
    this.element.removeEventListener('click', this.clickHandler);
    this.element.removeEventListener('dblclick', this.dblclickHandler);
    this.element.removeEventListener('mousedown', this.mousedownHandler);
    this.element.removeEventListener('focusin', this.focusinHandler);
    this.element.remove();
  }

  // =========================================
  // Rows
  // =========================================

  private buildRows(specs: readonly TreeViewNode<T>[], parent: Row<T> | null): Row<T>[] {
    const level = parent ? parent.level + 1 : 1;
    const rows = specs.map((node, index) =>
      this.createRow(node, parent, level, index + 1, specs.length),
    );
    // Registered once every row is built, so a `render` that throws leaves
    // no ids behind that point at rows nobody can reach.
    for (const row of rows) {
      if (!this.rowsById.has(row.node.id)) this.rowsById.set(row.node.id, row);
    }
    return rows;
  }

  private createRow(
    node: TreeViewNode<T>,
    parent: Row<T> | null,
    level: number,
    posinset: number,
    setsize: number,
  ): Row<T> {
    const item = document.createElement('div');
    item.className = `${this.base}__item`;
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(level));
    item.setAttribute('aria-setsize', String(setsize));
    item.setAttribute('aria-posinset', String(posinset));
    item.setAttribute('aria-label', node.label);
    item.setAttribute('aria-selected', 'false');
    item.setAttribute('tabindex', '-1');
    // End nodes carry no aria-expanded at all: "false" would describe them
    // as closed parents.
    if (node.children) item.setAttribute('aria-expanded', 'false');
    // The one inline style, and not a visual one: the stylesheet indents by it.
    item.style.setProperty('--dt-tree-level', String(level));

    const twisty = document.createElement('span');
    twisty.className = `${this.base}__twisty`;
    twisty.setAttribute('aria-hidden', 'true');

    const content = document.createElement('span');
    content.className = `${this.base}__content`;
    node.render(content);

    item.append(twisty, content);

    // A span rather than a button: it has no role for `aria-hidden` to
    // contradict, and a focus trap's "focusable controls" selector does not
    // count it as a tab stop. The pointer never focuses it (see mousedown).
    let action: HTMLElement | null = null;
    if (node.actionable && this.onAction) {
      action = document.createElement('span');
      action.className = `${this.base}__add`;
      action.setAttribute('aria-hidden', 'true');
      action.setAttribute('tabindex', '-1');
      const title = node.actionTitle ?? this.actionTitle;
      if (title !== undefined) action.setAttribute('title', title);
      item.appendChild(action);
    }

    const row: Row<T> = {
      node,
      parent,
      level,
      item,
      twisty,
      action,
      match: node.label.trim().toLocaleLowerCase(),
      specs: null,
      children: null,
      expanded: false,
    };
    this.rowsByItem.set(item, row);
    return row;
  }

  private expandRow(row: Row<T>): void {
    if (!row.node.children || row.expanded) return;
    // `children()` runs once: every later expansion re-attaches these rows.
    row.specs ??= row.node.children();
    row.children ??= this.buildRows(row.specs, row);
    row.expanded = true;
    row.item.setAttribute('aria-expanded', 'true');
    if (this.isAttached(row)) {
      // One insertion for the whole block, expanded descendants included.
      const fragment = document.createDocumentFragment();
      for (const descendant of visibleRows(row.children)) fragment.appendChild(descendant.item);
      row.item.after(fragment);
    }
  }

  private collapseRow(row: Row<T>): void {
    if (!row.expanded) return;
    // The active item may be about to leave the DOM with the rows below. It
    // moves up to `row` first, DOM focus with it, so focus is never dropped
    // onto <body> by the removal.
    const active = this.active;
    const moveActive = active !== null && isWithin(active, row);
    if (moveActive) {
      const hadFocus = this.containsFocus();
      this.setActiveRow(row);
      if (hadFocus) row.item.focus({ preventScroll: true });
    }
    if (this.isAttached(row) && row.children) {
      for (const descendant of visibleRows(row.children)) descendant.item.remove();
    }
    row.expanded = false;
    row.item.setAttribute('aria-expanded', 'false');
    if (moveActive) {
      this.reveal(row.item);
      this.onActiveChange?.(row.node);
    }
  }

  private toggle(row: Row<T>): void {
    if (row.expanded) this.collapseRow(row);
    else this.expandRow(row);
  }

  /** `*`: expand every expandable sibling of `row`, `row` included. */
  private expandSiblings(row: Row<T>): void {
    for (const sibling of row.parent?.children ?? this.roots) this.expandRow(sibling);
  }

  private isAttached(row: Row<T>): boolean {
    return row.item.parentNode === this.element;
  }

  /** The row whose item is, or contains, `target`. */
  private rowAt(target: EventTarget | null): Row<T> | null {
    for (
      let el = target instanceof Element ? target : null;
      el && el !== this.element;
      el = el.parentElement
    ) {
      const row = this.rowsByItem.get(el);
      if (row) return row;
    }
    return null;
  }

  // =========================================
  // Active item
  // =========================================

  /** Move the tab stop and the selection to `row`. `true` when it moved. */
  private setActiveRow(row: Row<T>): boolean {
    const previous = this.active;
    if (previous === row) return false;
    if (previous) {
      previous.item.setAttribute('tabindex', '-1');
      previous.item.setAttribute('aria-selected', 'false');
    }
    row.item.setAttribute('tabindex', '0');
    row.item.setAttribute('aria-selected', 'true');
    this.active = row;
    return true;
  }

  /** Make `row` active, scroll it into view, focus it if asked, and tell the caller. */
  private activate(row: Row<T>, focus: boolean): void {
    const changed = this.setActiveRow(row);
    if (focus) this.focusItem(row);
    else this.reveal(row.item);
    if (changed) this.onActiveChange?.(row.node);
  }

  /** Activate the row shown by `item`, if any, and focus it. */
  private moveTo(item: Element | null): void {
    const row = item ? this.rowsByItem.get(item) : undefined;
    if (row) this.activate(row, true);
  }

  private focusItem(row: Row<T>): void {
    // preventScroll, then reveal by hand: the browser's own scroll-into-view
    // walks every scrollable ancestor up to the viewport and would jump the
    // host page on an arrow key.
    row.item.focus({ preventScroll: true });
    this.reveal(row.item);
  }

  /**
   * Scroll the tree so `item` is inside its visible area, keeping the item's
   * top in view when it is taller than the tree. Only the tree element
   * scrolls: an ancestor may be `overflow: hidden`, which still scrolls
   * programmatically and would shift the table under the panel.
   *
   * In jsdom every layout number is 0, which makes this a no-op.
   */
  private reveal(item: HTMLElement): void {
    const box = this.element;
    if (box.scrollHeight <= box.clientHeight) return;
    const top = box.getBoundingClientRect().top + box.clientTop;
    const rect = item.getBoundingClientRect();
    const above = rect.top - top;
    const below = rect.bottom - (top + box.clientHeight);
    if (above < 0) box.scrollTop += above;
    else if (below > 0) box.scrollTop += Math.min(below, above);
  }

  private containsFocus(): boolean {
    const focused = this.element.ownerDocument.activeElement;
    return focused instanceof Node && this.element.contains(focused);
  }

  // =========================================
  // Keyboard
  // =========================================

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.destroyed || e.defaultPrevented || e.isComposing) return;
    // A text field rendered inside a row owns its keys.
    if (isEditable(e.target)) return;
    const row = this.rowAt(e.target);
    if (!row) return;

    if (!this.handleKey(e, row)) return;
    // Claimed keys stop here, so a host's document-level shortcuts cannot act
    // on them a second time.
    e.preventDefault();
    e.stopPropagation();
    // Any other key the tree acts on ends a type-ahead word, so a letter typed
    // after an arrow starts a new search instead of extending the old one.
    if (!isTypeaheadKey(e.key)) this.typed = '';
  }

  /** Act on a keystroke from `row`'s item. `true` when the key was the tree's. */
  private handleKey(e: KeyboardEvent, row: Row<T>): boolean {
    // Alt-modified keys belong to the browser and the platform.
    if (e.altKey) return false;

    if (e.ctrlKey || e.metaKey) {
      if (e.shiftKey) return false;
      if (e.key === 'c' || e.key === 'C') {
        // Text selected inside the tree is the user's own choice of what to
        // copy (KeyboardNavigator defers the same way). A selection elsewhere
        // on the page is not: focus is here, and so is the intent.
        if (!this.onCopy || this.hasTextSelection()) return false;
        this.onCopy(row.node);
        return true;
      }
      if (e.key === 'Enter') {
        if (!this.onAction || !row.node.actionable) return false;
        this.onAction(row.node);
        return true;
      }
      return false;
    }

    // `*` is Shift+8 on many layouts, so it is matched before Shift is ruled out.
    if (e.key === '*') {
      this.expandSiblings(row);
      return true;
    }

    // Shift+arrow would extend a selection in a multi-select tree; this one
    // is single select, so it leaves those keys alone. A no-op at the edge
    // (↓ on the last item, → on an end node) still claims the key, or the
    // browser would scroll the tree out from under the focused item.
    if (!e.shiftKey) {
      switch (e.key) {
        case 'ArrowDown':
          this.moveTo(row.item.nextElementSibling);
          return true;
        case 'ArrowUp':
          this.moveTo(row.item.previousElementSibling);
          return true;
        case 'ArrowRight':
          if (!row.expanded) this.expandRow(row);
          else this.moveTo(row.children?.[0]?.item ?? null);
          return true;
        case 'ArrowLeft':
          if (row.expanded) this.collapseRow(row);
          else if (row.parent) this.activate(row.parent, true);
          return true;
        case 'Home':
          this.moveTo(this.element.firstElementChild);
          return true;
        case 'End':
          this.moveTo(this.element.lastElementChild);
          return true;
        case 'Enter':
          // An end node has no default action here, so Enter on it stays
          // the host's.
          if (!row.node.children) return false;
          this.toggle(row);
          return true;
        case ' ':
        case 'Spacebar':
          // Claimed on an end node too: the browser would page-scroll the tree.
          if (row.node.children) this.toggle(row);
          return true;
      }
    }

    if (isTypeaheadKey(e.key)) {
      this.typeAhead(e.key, row);
      return true;
    }
    return false;
  }

  /**
   * APG type-ahead: move to the next visible item whose label starts with the
   * characters typed in quick succession. The same character typed again and
   * again cycles through the items that start with it, as in a native
   * listbox; any other word is matched from the active item on, so a word
   * that still fits the active item keeps it.
   */
  private typeAhead(key: string, from: Row<T>): void {
    const now = Date.now();
    if (now - this.typedAt > TYPEAHEAD_RESET_MS) this.typed = '';
    this.typedAt = now;
    const char = key.toLocaleLowerCase();
    this.typed += char;

    const cycling = Array.from(this.typed).every((c) => c === char);
    const prefix = cycling ? char : this.typed;
    const count = this.element.childElementCount;
    let item: Element | null = cycling ? this.nextItem(from.item) : from.item;
    for (let step = 0; step < count && item; step++) {
      const row = this.rowsByItem.get(item);
      if (row?.match.startsWith(prefix)) {
        this.activate(row, true);
        return;
      }
      item = this.nextItem(item);
    }
  }

  /** The visible item after `item`, wrapping to the first. */
  private nextItem(item: Element): Element | null {
    return item.nextElementSibling ?? this.element.firstElementChild;
  }

  /** Whether the document has a non-empty text selection that touches the tree. */
  private hasTextSelection(): boolean {
    const selection = this.element.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().length === 0) return false;
    for (let i = 0; i < selection.rangeCount; i++) {
      if (selection.getRangeAt(i).intersectsNode(this.element)) return true;
    }
    return false;
  }

  // =========================================
  // Pointer + focus
  // =========================================

  private handleClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const row = this.rowAt(e.target);
    if (!row) return;
    const target = e.target as Node;
    this.activate(row, true);
    if (row.action?.contains(target)) {
      this.onAction?.(row.node);
    } else if (row.twisty.contains(target)) {
      this.toggle(row);
    }
  }

  private handleDblClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const row = this.rowAt(e.target);
    if (!row?.node.children) return;
    const target = e.target as Node;
    // The twisty and the action button answer single clicks, and a double
    // click on them has already been two of those.
    if (row.twisty.contains(target) || row.action?.contains(target)) return;
    this.toggle(row);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const row = this.rowAt(e.target);
    if (!row) return;
    const target = e.target as Node;
    if (row.action?.contains(target)) {
      // `tabindex="-1"` makes the button focusable by the pointer; keeping
      // focus on the item keeps the tab stop where the keyboard expects it.
      e.preventDefault();
      return;
    }
    // A double click toggles an expandable row. Left alone, it would also
    // select the word under the pointer — and a selection inside the tree
    // hands the next Ctrl/Cmd+C to the browser instead of `onCopy`.
    if (e.detail > 1 && row.node.children) e.preventDefault();
  }

  private handleFocusIn(e: FocusEvent): void {
    if (this.destroyed) return;
    const row = this.rowAt(e.target);
    if (!row || row === this.active) return;
    // Focus that arrives some other way — a click, a host's `initialFocus`, a
    // screen reader moving its own cursor — makes its item the active one, so
    // the tab stop and the selection never disagree with DOM focus.
    this.activate(row, false);
  }
}

/** `rows` and their expanded descendants, in display order. Iterative: values nest deeply. */
function visibleRows<T>(rows: readonly Row<T>[]): Row<T>[] {
  const out: Row<T>[] = [];
  const stack: Row<T>[] = [];
  for (let i = rows.length - 1; i >= 0; i--) stack.push(rows[i]);
  for (let row = stack.pop(); row; row = stack.pop()) {
    out.push(row);
    if (row.expanded && row.children) {
      for (let i = row.children.length - 1; i >= 0; i--) stack.push(row.children[i]);
    }
  }
  return out;
}

/** Whether `row` is a descendant of `ancestor`. */
function isWithin<T>(row: Row<T>, ancestor: Row<T>): boolean {
  for (let parent = row.parent; parent; parent = parent.parent) {
    if (parent === ancestor) return true;
  }
  return false;
}

/** A single printable character: type-ahead input. `*` is a command of its own. */
function isTypeaheadKey(key: string): boolean {
  return key !== '*' && /^\S$/u.test(key);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}
