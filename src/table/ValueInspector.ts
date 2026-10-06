/**
 * ValueInspector — the panel that shows one nested or JSON cell's whole value.
 *
 * A grid cell shows a LIST, ARRAY, STRUCT, MAP, UNION or VARIANT value as
 * DuckDB's text for it, bounded: 32 items and `… +N`, at most 1,000
 * graphemes. A JSON cell shows its text whole, on one line the column's edge
 * cuts off. The inspector reads the exact value instead, as JSON text by
 * `__rowid__` (`fetchCellJson`), parses it without losing a digit
 * (`parseJsonTree`), and shows it as a keyboard tree (`TreeView` over
 * `buildValueTree`): keys, values, types, counts, and containers too big to
 * list at once in buckets. Copy JSON puts the whole value on the clipboard as
 * standard JSON; Ctrl/Cmd+C on a node, that node's. A value too long to show
 * whole is read again for a copy of it, or of a node its cut runs through.
 *
 * It opens from a body cell — `F2` on the cursor, a double click, or the
 * cell's inspect icon — and `TableContainer` mounts it in `.dt-root`, beside
 * the cell: below it when 240 px fit there, else above, and it stays put
 * while the table scrolls under it (what it shows is keyed by rowid, not by
 * the cell). It is a non-modal ModalHost panel: Tab cycles inside it, Escape
 * closes it, and focus goes back to the grid, whose cursor never moved.
 *
 * Everything shown is set with `textContent`: field names, map keys and
 * values come from the data.
 *
 * Lazily loaded, like `DerivedColumnEditPanel`: a table that never opens it
 * never downloads it, nor the tree beneath it.
 */

import { parseDuckDBType } from '../core/duckdbType';
import { nextInstanceId } from '../core/instanceId';
import { type JsonNode, parseJsonTree, prettyJson } from '../core/jsonTree';
import { ModalHost } from '../core/ModalHost';
import { type Strings, defaultStrings } from '../core/Strings';
import type { ColumnSchema } from '../core/types';
import { type CellJson, fetchCellJson } from '../data/cellValue';
import type { WorkerBridge } from '../data/WorkerBridge';
import { copyToClipboard } from '../export/Clipboard';
import {
  type JsonLeafKind,
  type NestedExtractKind,
  resolveNestedPath,
} from '../nested/extractExpression';
import { columnTypeLabel, columnTypeTitle } from '../nested/typeOutline';
import {
  type ValueTreeBucket,
  type ValueTreeNode,
  type ValueTreePathStep,
  buildValueTree,
  defaultExpansion,
  nodeJsonText,
} from '../nested/valueTreeModel';
import { TreeView, type TreeViewNode, activeElementOf, closeIcon, element } from './TreeView';

/**
 * Characters of JSON (code points) read to show a value: 2 MiB. A longer
 * value shows its first 2 MiB, and says so.
 */
export const INSPECTOR_DISPLAY_CHARS = 2 * 1024 * 1024;

/**
 * Characters of JSON read for Copy JSON when the value shown was cut: 8 MiB.
 * A value longer still is "too large to copy" — export the column instead.
 */
export const INSPECTOR_COPY_CHARS = 8 * 1024 * 1024;

/** How long a load runs before the panel says it is loading, in ms: a fast one never flashes. */
const LOADING_DELAY_MS = 150;

/** How long "Copied" and the copy errors stay, in ms. */
const MESSAGE_MS = 3000;

/** Room the panel wants below its cell; with less there, it opens above if more room is there. In px. */
const ROOM_BELOW = 240;

/** Gap between the cell and the panel, and the margin kept from the table's edges. In px. */
const GAP = 4;
const EDGE = 8;

/** The least height the panel is given, in px, when the cell leaves less room: header, a row, footer. */
const MIN_HEIGHT = 120;

/** A JSON null, for a value that turned out to be SQL NULL. */
const NULL_JSON: JsonNode = { kind: 'null' };

/**
 * The "add as column" buttons, each offered on the nodes that have one:
 *
 * - `value`: the node's value (a struct field, a list element, a map value,
 *   a union member, a value inside JSON);
 * - `length`: a list's, an array's or a JSON array's length;
 * - `size`: a map's number of entries (its `'length'`, to
 *   `nestedFieldExpression`);
 * - `tag`: which member a union holds.
 */
export type ValueInspectorExtractKind = 'value' | 'length' | 'size' | 'tag';

/**
 * One "add as column" request from the inspector, ready for
 * `nestedFieldExpression(column, path, { extract, jsonLeaf })`.
 */
export interface ValueInspectorExtractRequest {
  /** The column the value is read from. */
  column: string;
  /** The node's path from the column (`ValueTreeNode.path`); `[]` for the root. */
  path: readonly ValueTreePathStep[];
  /** What to read at the end of the path. A map's size is its `'length'`. */
  extract: NestedExtractKind;
  /**
   * How to read a value inside a JSON or VARIANT value, from the kind of the
   * value shown: a number as `'number'`, `true`/`false` as `'boolean'`, an
   * object or array as `'json'`, anything else as `'string'`. Only for a
   * `'value'` there.
   */
  jsonLeaf?: JsonLeafKind | undefined;
  /** The node it was asked on. */
  node: ValueTreeNode;
  /** The row the inspector shows (0-based, as sorted and filtered): where the cursor goes next. */
  row: number;
  /** That row's `__rowid__`. */
  rowId: number | bigint;
}

/** How an "add as column" request ended: {@link ValueInspectorExtract.onExtract}. */
export interface ValueInspectorExtractResult {
  success: boolean;
  /** Why it failed, shown in the panel's status line. */
  error?: string | undefined;
}

/**
 * Turns nodes of the tree into columns ("extract field → column"). With it,
 * the footer gets a button for each kind the active node offers, a node
 * whose value can be added gets a hover affordance in its row, and
 * Ctrl/Cmd+Enter adds the active node's value. Without it, the inspector
 * only shows and copies.
 *
 * What a node offers follows `resolveNestedPath`, so the inspector and the
 * header's extract panel agree: nothing on a node no path reaches (a
 * bucket, the inside of a union read through VARIANT, JSON that does not
 * fit its type), `value` wherever the path leads to a value, `length` on a
 * list or an array (and inside JSON on an array only, the value shown being
 * one), `size` on a map, `tag` on a union.
 *
 * @example
 * ```ts
 * const extract: ValueInspectorExtract = {
 *   onExtract: ({ column, path, extract, jsonLeaf }) =>
 *     actions.addNestedFieldColumn(column, path, { extract, jsonLeaf }),
 *   labels: { value: 'Add as column', length: 'Add length as column',
 *             size: 'Add size as column', tag: 'Add tag as column' },
 * };
 * ```
 */
export interface ValueInspectorExtract {
  /**
   * Add it. The panel stays open; closing it, or not, is the caller's. Given
   * a promise of how it ends, the panel says "Adding…" in its status line
   * meanwhile and a failure's reason after, and drops further requests
   * until it settles. Closed meanwhile, it drops the outcome, but still
   * asks nothing new until the add settles; opened again on the same column
   * before then, it says "Adding…" again.
   */
  onExtract(request: ValueInspectorExtractRequest): void | Promise<ValueInspectorExtractResult>;
  /** Text of each footer button; `value`'s is also the row affordance's `title`. */
  labels: Readonly<Record<ValueInspectorExtractKind, string>>;
}

/** What one node offers to add as a column, worked out once. */
interface ExtractChoices {
  /** The node's path, read once: `ValueTreeNode.path` builds a new one on every read. */
  readonly path: readonly ValueTreePathStep[];
  readonly kinds: ReadonlySet<ValueInspectorExtractKind>;
  /** For a value at or inside JSON or VARIANT. */
  readonly jsonLeaf: JsonLeafKind | undefined;
}

/** Construction options for {@link ValueInspector}. */
export interface ValueInspectorOptions {
  /** Reads the values. */
  bridge: WorkerBridge;
  /** CSS class prefix (default: 'dt'). */
  classPrefix?: string | undefined;
  /**
   * The table's instance id (`TableContainer.getInstanceId`), mixed into the
   * ids the panel mints so that two tables never share one, two copies of
   * the library on one page included. Minted when left out.
   */
  instanceId?: string | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
  /** Element to mirror `data-dt-color-scheme` from: the table's `.dt-root`. */
  colorSchemeSource?: HTMLElement | undefined;
  /**
   * Where focus goes when the panel closes: the grid. Not the cell: a cell
   * is pooled, and may be gone or hold another row by then. Without it, the
   * element focused when the panel opened.
   */
  returnFocus?: HTMLElement | undefined;
  /**
   * Called with the column the panel opens on, and with `null` once it
   * closes. `TableContainer` keeps the column mounted meanwhile.
   */
  onOpenChange?: ((column: string | null) => void) | undefined;
  /** "Add as column" (see {@link ValueInspectorExtract}). */
  extract?: ValueInspectorExtract | undefined;
}

/** The value a {@link ValueInspector} shows, and the cell it opens from. */
export interface ValueInspectorTarget {
  /** The relation to read: `state.tableName`, a derived-column view included. */
  tableName: string;
  /** The column's schema entry. */
  column: ColumnSchema;
  /** The row's `__rowid__`, which the value is read by. */
  rowId: number | bigint;
  /** The row's 0-based position in the table as sorted and filtered, for the title. */
  row: number;
  /** The cell: the panel opens below it or above it, and a press on it does not close it. */
  anchor: HTMLElement;
}

/** The value a panel is open on. */
export interface ValueInspectorShown {
  column: string;
  row: number;
  rowId: number | bigint;
}

/**
 * A panel showing one nested or JSON value as an accessible tree. See the
 * module comment. One instance serves one table: {@link ValueInspector.open}
 * shows another value in it.
 *
 * ```
 * div.dt-value-inspector [role=dialog]   title "tags · Row 3" · type · ×
 *   div.__status [role=status]            loading / truncated / copied / error + Retry
 *   div.__body > div.dt-value-tree        the TreeView
 *   div.__footer                          [extract…] [Copy JSON] [Close]
 * ```
 *
 * @example
 * ```ts
 * const inspector = new ValueInspector({ bridge, returnFocus: gridElement });
 * root.appendChild(inspector.getElement());
 * inspector.open({ tableName, column, rowId: 1234, row: 12, anchor: cellEl });
 * // later:
 * inspector.destroy();
 * ```
 */
export class ValueInspector {
  private readonly element: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly typeEl: HTMLElement;
  private readonly noticeEl: HTMLElement;
  private readonly messageEl: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly extractButtons = new Map<ValueInspectorExtractKind, HTMLButtonElement>();

  private readonly prefix: string;
  private readonly bridge: WorkerBridge;
  private readonly messages: Strings;
  private readonly colorSchemeSource: HTMLElement | undefined;
  private readonly returnFocus: HTMLElement | undefined;
  private readonly onOpenChange: ((column: string | null) => void) | undefined;
  private readonly extract: ValueInspectorExtract | undefined;
  private readonly titleId: string;
  private readonly modalHost = new ModalHost();

  private target: ValueInspectorTarget | null = null;
  private isOpen = false;
  private destroyed = false;
  private tree: TreeView<ValueTreeNode> | null = null;
  /**
   * The value shown, whether it was cut at {@link INSPECTOR_DISPLAY_CHARS},
   * and for a cut value the nodes the cut runs through, once asked for.
   */
  private loaded: { json: JsonNode; truncated: boolean; cut?: JsonNode[] } | null = null;
  /** What each node offers to add as a column; `null` for nothing. */
  private extractChoices = new WeakMap<ValueTreeNode, ExtractChoices | null>();
  /**
   * The "add as column" request asked for last, until it settles: the next
   * one for its column is dropped meanwhile. A close drops its outcome, not
   * the add, which an open on the same column says is still adding.
   */
  private extracting: {
    column: string;
    outcome: Promise<ValueInspectorExtractResult>;
  } | null = null;

  // Opened, and focus not yet handed on: see the constructor's focus listener.
  private focusPending = false;

  // Bumped by every load and close: a read that comes back to another
  // number is dropped.
  private loadSeq = 0;
  private controller: AbortController | null = null;
  private loadingTimer: ReturnType<typeof setTimeout> | null = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ValueInspectorOptions) {
    this.prefix = options.classPrefix ?? 'dt';
    this.bridge = options.bridge;
    this.messages = options.messages ?? defaultStrings;
    this.colorSchemeSource = options.colorSchemeSource;
    this.returnFocus = options.returnFocus;
    this.onOpenChange = options.onOpenChange;
    this.extract = options.extract;
    this.titleId = `${this.prefix}-${options.instanceId || nextInstanceId()}-value-inspector-title`;

    const p = `${this.prefix}-value-inspector`;
    const m = this.messages.values;

    this.element = document.createElement('div');
    this.element.className = p;
    this.element.style.display = 'none';
    // Set here, not only while open, so the panel is a dialog to assistive
    // technology whatever its state; not modal: the table stays in view.
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-labelledby', this.titleId);

    const header = element('div', `${p}__header`);
    this.titleEl = element('span', `${p}__title`);
    this.titleEl.id = this.titleId;
    this.typeEl = element('span', `${p}__type`);
    const closeX = element('button', `${p}__close`);
    closeX.type = 'button';
    closeX.setAttribute('aria-label', m.closeLabel);
    closeX.appendChild(closeIcon());
    closeX.addEventListener('click', () => this.close());
    header.append(this.titleEl, this.typeEl, closeX);

    // One live region for everything the panel says about itself. The
    // notice (a value cut short) stays; the message (loading, copied, an
    // error) comes and goes.
    const status = element('div', `${p}__status`);
    status.setAttribute('role', 'status');
    this.noticeEl = element('span', `${p}__notice`);
    this.messageEl = element('span', `${p}__message`);
    this.retryButton = element('button', `${p}__retry`);
    this.retryButton.type = 'button';
    this.retryButton.textContent = m.retry;
    this.retryButton.hidden = true;
    this.retryButton.addEventListener('click', () => void this.load());
    status.append(this.noticeEl, this.messageEl, this.retryButton);

    // The tree's slot. The tree itself is the scroll container.
    this.body = element('div', `${p}__body`);

    const footer = element('div', `${p}__footer`);
    if (this.extract) {
      for (const kind of ['value', 'length', 'size', 'tag'] as const) {
        const button = element('button', `${p}__button`);
        button.type = 'button';
        button.textContent = this.extract.labels[kind];
        button.hidden = true;
        button.addEventListener('click', () => {
          const node = this.tree?.getActive()?.data;
          if (node) this.requestExtract(node, kind);
        });
        this.extractButtons.set(kind, button);
        footer.appendChild(button);
      }
    }
    this.copyButton = element('button', `${p}__button`);
    this.copyButton.type = 'button';
    this.copyButton.textContent = m.copyJson;
    this.copyButton.disabled = true;
    this.copyButton.addEventListener('click', () => this.copyAll());
    const closeButton = element('button', `${p}__button`);
    closeButton.type = 'button';
    closeButton.textContent = this.messages.common.close;
    closeButton.addEventListener('click', () => this.close());
    footer.append(this.copyButton, closeButton);

    this.element.append(header, status, this.body, footer);

    // The panel takes focus itself when it opens (ModalHost's initial
    // focus), and hands it to the tree's active item once there is a tree.
    // Only then: once focus has gone to anything inside, by the user's hand
    // or ours, a click on the panel's background leaves focus where it lands.
    this.element.addEventListener('focus', () => {
      if (this.focusPending) this.handOnFocus();
    });
    this.element.addEventListener('focusin', (e) => {
      if (e.target !== this.element) this.focusPending = false;
    });
  }

  /** The panel element. Mount it in the table's `.dt-root`, before opening. */
  getElement(): HTMLElement {
    return this.element;
  }

  /** Whether the panel is open. */
  getIsOpen(): boolean {
    return this.isOpen;
  }

  /** The value the panel is open on, or `null` while it is closed. */
  getShown(): ValueInspectorShown | null {
    const target = this.target;
    return target && this.isOpen
      ? { column: target.column.name, row: target.row, rowId: target.rowId }
      : null;
  }

  /**
   * Open the panel on a value: beside `target.anchor`, reading the value by
   * its rowid. Open on that same value already, nothing changes; open on
   * another, it starts over with this one.
   */
  open(target: ValueInspectorTarget): void {
    if (this.destroyed) return;
    const shown = this.target;
    if (
      this.isOpen &&
      shown &&
      shown.tableName === target.tableName &&
      shown.column.name === target.column.name &&
      shown.rowId === target.rowId
    ) {
      // Asked again, by the second click of a double click on the inspect
      // icon say, whose press put focus on the cell: bring it back. To the
      // tree, or to Retry after a failed read; while the value loads, to
      // the panel, which hands it on as soon as either is there. Never left
      // outside the open panel, where no key reaches it.
      this.focusPending = true;
      this.handOnFocus();
      if (this.focusPending) this.element.focus({ preventScroll: true });
      return;
    }
    if (this.isOpen) this.modalHost.close();

    const m = this.messages.values;
    this.target = target;
    this.isOpen = true;
    this.titleEl.textContent = m.inspectorTitle(target.column.name, m.rowLabel(target.row + 1));
    this.typeEl.textContent = columnTypeLabel(target.column);
    const fullType = columnTypeTitle(target.column);
    if (fullType === null) this.typeEl.removeAttribute('title');
    else this.typeEl.title = fullType;

    this.element.style.display = '';
    this.position(target.anchor);
    this.focusPending = true;
    this.onOpenChange?.(target.column.name);

    this.modalHost.open({
      mode: 'panel',
      element: this.element,
      labelledBy: this.titleId,
      returnFocus: this.returnFocus,
      // The cell stays where it was, beside the panel: the page need not
      // move to show the top of the grid.
      restoreFocusPreventScroll: true,
      // The panel itself: the tree is not there yet. It passes focus on to
      // the tree's active item when it is.
      initialFocus: this.element,
      // A press on the cell is not "outside": the second click of a double
      // click on the inspect icon would close the panel the first opened.
      outsideClickIgnore: [target.anchor],
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });

    void this.load();
  }

  /** Close the panel; focus goes back to `returnFocus`. */
  close(): void {
    if (!this.isOpen) return;
    // ModalHost calls handleHostClose() below.
    this.modalHost.close();
  }

  /** Close the panel and remove it from the DOM. */
  destroy(): void {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.modalHost.destroy();
    this.clearMessageTimer();
    this.element.remove();
  }

  // =========================================
  // Loading
  // =========================================

  /** Read the value and show it; on failure, say so, with Retry. */
  private async load(): Promise<void> {
    const target = this.target;
    if (!target || this.destroyed) return;
    const seq = this.startLoad();
    const controller = new AbortController();
    this.controller = controller;

    this.destroyTree();
    this.loaded = null;
    // The last value's: nothing is there to add until this one is shown.
    this.updateExtractButtons(undefined);
    this.noticeEl.textContent = '';
    this.setMessage('');
    // Hiding Retry while it has focus drops focus out of the panel, where
    // Escape no longer reaches it: the panel holds it instead, and hands it
    // to the tree when the value is back.
    const retryHadFocus = this.retryButton.contains(activeElementOf(this.element));
    this.retryButton.hidden = true;
    if (retryHadFocus) {
      this.focusPending = true;
      this.element.focus({ preventScroll: true });
    }
    this.copyButton.disabled = true;
    this.body.setAttribute('aria-busy', 'true');
    this.loadingTimer = setTimeout(() => {
      this.loadingTimer = null;
      if (seq === this.loadSeq) this.setMessage(this.messages.values.loading);
    }, LOADING_DELAY_MS);

    let cell: CellJson | undefined;
    try {
      cell = await fetchCellJson(this.bridge, target.tableName, target.column, target.rowId, {
        maxChars: INSPECTOR_DISPLAY_CHARS,
        signal: controller.signal,
      });
    } catch {
      if (seq === this.loadSeq) this.showLoadError();
      return;
    }
    if (seq !== this.loadSeq) return;
    // No such row any more: the table changed under the panel.
    if (cell === undefined) {
      this.showLoadError();
      return;
    }

    this.endLoading();
    const json = cell.text === null ? NULL_JSON : parseJsonTree(cell.text).root;
    this.loaded = { json, truncated: cell.truncated };
    this.showTree(target, json);
    // Asked for before the panel last closed, and still adding.
    if (this.extracting?.column === target.column.name) this.sayExtracting();
    if (cell.truncated) {
      this.noticeEl.textContent = this.messages.values.truncatedNotice(
        INSPECTOR_DISPLAY_CHARS,
        cell.totalChars,
      );
    }
    this.copyButton.disabled = false;
  }

  /** Drop any read in flight, and number the next one. */
  private startLoad(): number {
    this.controller?.abort();
    this.controller = null;
    if (this.loadingTimer !== null) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
    return ++this.loadSeq;
  }

  private endLoading(): void {
    if (this.loadingTimer !== null) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
    this.body.removeAttribute('aria-busy');
    this.setMessage('');
  }

  private showLoadError(): void {
    this.endLoading();
    this.updateExtractButtons(undefined);
    this.setMessage(this.messages.values.loadFailed);
    this.retryButton.hidden = false;
    // Focus still waiting on the panel for the tree goes to Retry instead.
    if (this.focusPending && activeElementOf(this.element) === this.element) {
      this.handOnFocus();
    }
  }

  // =========================================
  // Tree
  // =========================================

  private showTree(target: ValueInspectorTarget, json: JsonNode): void {
    const m = this.messages.values;
    const root = buildValueTree(json, parseDuckDBType(target.column.originalType ?? ''), m, {
      rootKey: target.column.name,
    });
    const expand = defaultExpansion(root);
    const tree = new TreeView<ValueTreeNode>([this.viewNode(root)], {
      classPrefix: this.prefix,
      label: m.treeLabel(target.column.name),
      initiallyExpanded: (node, level) => (node.data ? expand(node.data, level) : false),
      actionTitle: this.extract?.labels.value,
      onActiveChange: (node) => this.updateExtractButtons(node.data),
      onCopy: (node) => {
        if (node.data) this.copyNode(node.data);
      },
      onAction: this.extract
        ? (node) => {
            if (node.data) this.requestExtract(node.data, 'value');
          }
        : undefined,
    });
    this.tree = tree;
    this.body.replaceChildren(tree.getElement());
    this.updateExtractButtons(tree.getActive()?.data);
    if (this.focusPending && activeElementOf(this.element) === this.element) {
      this.handOnFocus();
    }
  }

  /** Give the panel's focus to the tree's active item, or after a failure to Retry. */
  private handOnFocus(): void {
    if (this.tree) {
      this.focusPending = false;
      this.tree.focus();
    } else if (!this.retryButton.hidden) {
      this.focusPending = false;
      this.retryButton.focus();
    }
  }

  private destroyTree(): void {
    this.tree?.destroy();
    this.tree = null;
    this.body.replaceChildren();
  }

  /** A value-tree node as a tree-view node; its children are mapped as they load. */
  private viewNode(node: ValueTreeNode): TreeViewNode<ValueTreeNode> {
    const children = node.children;
    return {
      label: node.label,
      render: (content) => this.renderNode(content, node),
      children: children ? () => children().map((child) => this.viewNode(child)) : undefined,
      actionable: this.choicesOf(node)?.kinds.has('value') === true,
      data: node,
    };
  }

  /**
   * One row's content: the key (`x: `, `3: `, `k1 → ` for a map entry),
   * then a leaf's value in its style, or a container's type, count and
   * preview. A bucket shows its label alone.
   */
  private renderNode(content: HTMLElement, node: ValueTreeNode): void {
    const t = `${this.prefix}-value-tree`;
    const key = node.key;
    if (key) {
      // `jsonIndex` → `--json-index`
      const kind = key.kind.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      content.appendChild(element('span', `${t}__key ${t}__key--${kind}`, key.text));
      if (key.kind === 'bucket') return;
      content.appendChild(element('span', `${t}__sep`, key.kind === 'mapKey' ? ' → ' : ': '));
    }
    const value = node.value;
    if (value) {
      content.appendChild(element('span', `${t}__value ${t}__value--${value.style}`, value.text));
      if (value.more !== undefined) content.appendChild(element('span', `${t}__more`, value.more));
      return;
    }
    content.appendChild(element('span', `${t}__type`, node.typeLabel));
    if (node.countText !== undefined) {
      content.appendChild(element('span', `${t}__count`, node.countText));
    }
    if (node.preview !== undefined) {
      content.appendChild(element('span', `${t}__preview`, node.preview));
    }
  }

  // =========================================
  // Extract
  // =========================================

  /**
   * What `node` offers to add as a column (see {@link ValueInspectorExtract}),
   * or `null` for nothing, or without the extract hook. Worked out once per
   * node, the first time it is shown or made active.
   */
  private choicesOf(node: ValueTreeNode): ExtractChoices | null {
    const target = this.target;
    if (!this.extract || !target) return null;
    const known = this.extractChoices.get(node);
    if (known !== undefined) return known;

    let choices: ExtractChoices | null = null;
    const path = node.path;
    if (path !== null) {
      const column = target.column;
      const resolved = resolveNestedPath(
        { name: column.name, originalType: column.originalType ?? '' },
        path,
      );
      if (resolved.ok) {
        const kinds = new Set<ValueInspectorExtractKind>();
        for (const extract of resolved.extracts) {
          if (extract !== 'length') kinds.add(extract);
          // Inside JSON any value has a length to SQL (0 for a non-array);
          // the value shown says whether this one is an array.
          else if (!resolved.json) kinds.add(resolved.type.kind === 'map' ? 'size' : 'length');
          else if (node.json.kind === 'array') kinds.add('length');
        }
        if (kinds.size > 0) {
          choices = { path, kinds, jsonLeaf: resolved.json ? jsonLeafOf(node) : undefined };
        }
      }
    }
    this.extractChoices.set(node, choices);
    return choices;
  }

  /** Show the footer buttons the active node offers. */
  private updateExtractButtons(node: ValueTreeNode | undefined): void {
    if (this.extractButtons.size === 0) return;
    const kinds = node ? this.choicesOf(node)?.kinds : undefined;
    for (const [kind, button] of this.extractButtons) button.hidden = kinds?.has(kind) !== true;
  }

  private requestExtract(node: ValueTreeNode, kind: ValueInspectorExtractKind): void {
    const target = this.target;
    const choices = this.choicesOf(node);
    if (!this.extract || !target || !choices?.kinds.has(kind)) return;
    // One add at a time for a column, through closes and opens.
    if (this.extracting?.column === target.column.name) return;
    const extract: NestedExtractKind = kind === 'size' ? 'length' : kind;
    const asked = this.extract.onExtract({
      column: target.column.name,
      path: choices.path,
      extract,
      ...(extract === 'value' && choices.jsonLeaf !== undefined
        ? { jsonLeaf: choices.jsonLeaf }
        : {}),
      node,
      row: target.row,
      rowId: target.rowId,
    });
    if (!asked) return;
    const outcome = asked.catch((err: unknown) => ({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    const extracting = { column: target.column.name, outcome };
    this.extracting = extracting;
    void outcome.then(() => {
      if (this.extracting === extracting) this.extracting = null;
    });
    this.sayExtracting();
  }

  /**
   * Say "Adding…" in the status line until the add asked for last settles,
   * then a failure's reason. The line is numbered anew by a load and a
   * close: an outcome for a value no longer shown is dropped.
   */
  private sayExtracting(): void {
    const extracting = this.extracting;
    if (!extracting) return;
    const seq = this.loadSeq;
    this.setMessage(this.messages.values.adding);
    void extracting.outcome.then((result) => {
      if (seq !== this.loadSeq || this.destroyed) return;
      this.setMessage(result.success ? '' : this.messages.values.extractFailed(result.error ?? ''));
    });
  }

  // =========================================
  // Copy
  // =========================================

  /**
   * Copy JSON: the whole value, as standard JSON (numbers as DuckDB wrote
   * them, `NaN` and `±Infinity` as `null`). A value shown cut short is read
   * again, up to {@link INSPECTOR_COPY_CHARS}; past that it is too large to
   * copy.
   */
  private copyAll(): void {
    const loaded = this.loaded;
    if (!this.target || !loaded) return;
    this.copy(
      loaded.truncated
        ? this.readWhole().then((json) => prettyJson(json))
        : () => prettyJson(loaded.json),
    );
  }

  /**
   * Ctrl/Cmd+C on a node: its JSON. In a value shown cut short, a node the
   * cut runs through, a container it left open or the value it fell in, is
   * read again with the rest, as Copy JSON reads the whole value: the tree
   * closed it where the text ended, and a string or number cut short looks
   * whole there. Every other node lies wholly inside what was read, and is
   * copied from the tree.
   */
  private copyNode(node: ValueTreeNode): void {
    const loaded = this.loaded;
    if (!loaded) return;
    const cut = loaded.truncated ? (loaded.cut ??= cutPath(loaded.json)) : [];
    const depth = cut.indexOf(node.json);
    const bucket = node.bucket;
    // A bucket spans some of its container's children: cut only when it
    // holds the last of them.
    if (depth < 0 || (bucket && bucket.end < childCount(node.json))) {
      this.copy(() => nodeJsonText(node));
      return;
    }
    this.copy(
      this.readWhole().then((root) => {
        // The same node in the whole value: the same last children, down.
        let json: JsonNode | undefined = root;
        for (let level = 0; level < depth && json; level++) {
          json = childAt(json, childCount(cut[level]!) - 1);
        }
        if (!json) throw new Error('The value read again is not the one shown');
        return prettyJson(bucket ? sliceOf(json, bucket) : json);
      }),
    );
  }

  /**
   * The value read again for a copy, up to {@link INSPECTOR_COPY_CHARS}: the
   * one shown was cut short. Rejects with a {@link CopyFailure} when it is
   * longer still, and as a copy that failed when it cannot be read.
   */
  private async readWhole(): Promise<JsonNode> {
    const target = this.target;
    if (!target) throw new Error('The panel is closed');
    const cell = await fetchCellJson(this.bridge, target.tableName, target.column, target.rowId, {
      maxChars: INSPECTOR_COPY_CHARS,
      signal: this.controller?.signal,
    });
    if (!cell || cell.text === null) throw new Error('No value to copy');
    if (cell.truncated) throw new CopyFailure(this.messages.values.tooLargeToCopy);
    return parseJsonTree(cell.text).root;
  }

  /**
   * Put text on the clipboard, and say how it went: "Copied", or why not.
   * The text comes as a function, so that a value too large to write out
   * (nested past what a string can hold) fails as a copy does; or as a
   * promise, for a value read again, whose clipboard write starts at once
   * all the same (see {@link writeWhenRead}).
   */
  private copy(text: (() => string) | Promise<string>): void {
    const seq = this.loadSeq;
    let written: Promise<void>;
    try {
      written = typeof text === 'function' ? copyToClipboard(text(), 'text') : writeWhenRead(text);
    } catch (err) {
      written = Promise.reject(err);
    }
    const m = this.messages.values;
    const say = (message: string): void => {
      // A load or a close since: the message is not about what is shown.
      if (seq === this.loadSeq && !this.destroyed) this.flash(message);
    };
    written.then(
      () => say(m.copied),
      (err: unknown) => say(err instanceof CopyFailure ? err.message : m.copyFailed),
    );
  }

  // =========================================
  // Status
  // =========================================

  private setMessage(text: string): void {
    this.clearMessageTimer();
    this.messageEl.textContent = text;
  }

  /** A message that clears itself. */
  private flash(text: string): void {
    this.setMessage(text);
    this.messageTimer = setTimeout(() => {
      this.messageTimer = null;
      this.messageEl.textContent = '';
    }, MESSAGE_MS);
  }

  private clearMessageTimer(): void {
    if (this.messageTimer !== null) {
      clearTimeout(this.messageTimer);
      this.messageTimer = null;
    }
  }

  // =========================================
  // Placement + close
  // =========================================

  /**
   * Below the cell when {@link ROOM_BELOW} px fit there, else on whichever
   * side has more room, within the table and the window, and no taller than
   * that room. Left-aligned with the cell, kept inside the table. Only on
   * open: the panel does not follow the cell as the table scrolls.
   *
   * In jsdom every rect is zero, which leaves the stylesheet's defaults.
   */
  private position(anchor: HTMLElement): void {
    const style = this.element.style;
    style.top = '';
    style.bottom = '';
    style.left = '';
    style.maxHeight = '';
    const root = this.element.parentElement;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width === 0 && rootRect.height === 0) return;
    const cell = anchor.getBoundingClientRect();

    // Offsets are from the root's padding box.
    const originLeft = rootRect.left + root.clientLeft;
    const originTop = rootRect.top + root.clientTop;
    const originBottom = originTop + root.clientHeight;

    const width = this.element.offsetWidth;
    const left = Math.max(EDGE, Math.min(cell.left - originLeft, root.clientWidth - width - EDGE));
    style.left = `${left}px`;

    const viewTop = Math.max(originTop, 0);
    const viewBottom = Math.min(originBottom, window.innerHeight || originBottom);
    const below = viewBottom - cell.bottom - GAP - EDGE;
    const above = cell.top - viewTop - GAP - EDGE;
    if (below >= ROOM_BELOW || below >= above) {
      style.top = `${cell.bottom - originTop + GAP}px`;
      style.maxHeight = `${Math.max(below, MIN_HEIGHT)}px`;
    } else {
      style.bottom = `${originBottom - cell.top + GAP}px`;
      style.maxHeight = `${Math.max(above, MIN_HEIGHT)}px`;
    }
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.focusPending = false;
    this.startLoad();
    this.clearMessageTimer();
    this.element.style.display = 'none';
    this.destroyTree();
    this.loaded = null;
    this.updateExtractButtons(undefined);
    this.extractChoices = new WeakMap();
    this.target = null;
    this.onOpenChange?.(null);
  }
}

/** A copy that did not happen, for the reason its message tells the user. */
class CopyFailure extends Error {}

/**
 * Write text that is still being read. Safari allows a clipboard write only
 * while the click or key press that asked is being handled: a write after
 * the read's await fails with `NotAllowedError`. A `ClipboardItem` given the
 * promise starts the write now, and takes the text when it comes. Without
 * `ClipboardItem`, the text is written once it is read.
 */
function writeWhenRead(text: Promise<string>): Promise<void> {
  const clipboard = navigator.clipboard;
  if (typeof ClipboardItem !== 'function' || typeof clipboard?.write !== 'function') {
    return text.then((value) => copyToClipboard(value, 'text'));
  }
  const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
  // Seen here: a read that failed is told below, never left unhandled.
  blob.catch(() => undefined);
  return clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(
    () => undefined,
    // A read that failed fails the write too, and its reason is the one to tell.
    (err: unknown) => text.then(() => Promise.reject(err)),
  );
}

/**
 * The JSON nodes of a value cut short that the cut may run through: the
 * root, its last child, that one's last child, and so on down. Every
 * container still open where the text ended is one of them, and so is the
 * value it ended in; every other node ended before a comma or its own
 * closing bracket, inside what was read.
 */
function cutPath(root: JsonNode): JsonNode[] {
  const path: JsonNode[] = [];
  for (let node: JsonNode | undefined = root; node; node = childAt(node, childCount(node) - 1)) {
    path.push(node);
  }
  return path;
}

/** How many children a JSON array or object holds; 0 for anything else. */
function childCount(json: JsonNode): number {
  return json.kind === 'array'
    ? json.items.length
    : json.kind === 'object'
      ? json.entries.length
      : 0;
}

/** A JSON array's item or an object's entry's value at `index`. */
function childAt(json: JsonNode, index: number): JsonNode | undefined {
  if (json.kind === 'array') return json.items[index];
  return json.kind === 'object' ? json.entries[index]?.value : undefined;
}

/** The part of a container a bucket spans, as `nodeJsonText` copies it. */
function sliceOf(json: JsonNode, { start, end }: ValueTreeBucket): JsonNode {
  if (json.kind === 'array') return { kind: 'array', items: json.items.slice(start, end) };
  if (json.kind === 'object') return { kind: 'object', entries: json.entries.slice(start, end) };
  return json;
}

/** How a value inside JSON or VARIANT is read as a column, by the kind of the one shown. */
function jsonLeafOf(node: ValueTreeNode): JsonLeafKind {
  switch (node.json.kind) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
    case 'array':
      return 'json';
    default:
      return 'string';
  }
}
