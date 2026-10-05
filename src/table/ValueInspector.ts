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
 * standard JSON; Ctrl/Cmd+C on a node, that node's.
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
  type ValueTreeNode,
  type ValueTreePathStep,
  buildValueTree,
  defaultExpansion,
  nodeJsonText,
} from '../nested/valueTreeModel';
import { TreeView, type TreeViewNode } from './TreeView';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A JSON null, for a value that turned out to be SQL NULL. */
const NULL_JSON: JsonNode = { kind: 'null' };

/** Mints the panels' element ids, unique on the page. */
let panelCount = 0;

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
 *     void actions.addNestedFieldColumn(column, path, { extract, jsonLeaf }),
 *   labels: { value: 'Add as column', length: 'Add length as column',
 *             size: 'Add size as column', tag: 'Add tag as column' },
 * };
 * ```
 */
export interface ValueInspectorExtract {
  /** Add it. The panel stays open; closing it, or not, is the caller's. */
  onExtract(request: ValueInspectorExtractRequest): void;
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
  /** The value shown, and whether it was cut at {@link INSPECTOR_DISPLAY_CHARS}. */
  private loaded: { json: JsonNode; truncated: boolean } | null = null;
  /** What each node offers to add as a column; `null` for nothing. */
  private extractChoices = new WeakMap<ValueTreeNode, ExtractChoices | null>();

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
    this.titleId = `${this.prefix}-value-inspector-${++panelCount}-title`;

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
    this.copyButton.addEventListener('click', () => void this.copyAll());
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
      // icon say, whose press put focus on the cell: bring it back.
      this.tree?.focus();
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
    this.noticeEl.textContent = '';
    this.setMessage('');
    // Hiding Retry while it has focus drops focus out of the panel, where
    // Escape no longer reaches it: the panel holds it instead, and hands it
    // to the tree when the value is back.
    const retryHadFocus = this.retryButton.contains(this.element.ownerDocument.activeElement);
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
    this.setMessage(this.messages.values.loadFailed);
    this.retryButton.hidden = false;
    // Focus still waiting on the panel for the tree goes to Retry instead.
    if (this.focusPending && this.element.ownerDocument.activeElement === this.element) {
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
        if (node.data) void this.copy(nodeJsonText(node.data));
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
    if (this.focusPending && this.element.ownerDocument.activeElement === this.element) {
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
      id: node.id,
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
    const extract: NestedExtractKind = kind === 'size' ? 'length' : kind;
    this.extract.onExtract({
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
  private async copyAll(): Promise<void> {
    const target = this.target;
    const loaded = this.loaded;
    if (!target || !loaded) return;
    if (!loaded.truncated) {
      await this.copy(prettyJson(loaded.json));
      return;
    }
    const seq = this.loadSeq;
    let cell: CellJson | undefined;
    try {
      cell = await fetchCellJson(this.bridge, target.tableName, target.column, target.rowId, {
        maxChars: INSPECTOR_COPY_CHARS,
        signal: this.controller?.signal,
      });
    } catch {
      if (seq === this.loadSeq) this.flash(this.messages.values.copyFailed);
      return;
    }
    if (seq !== this.loadSeq) return;
    if (!cell || cell.text === null) {
      this.flash(this.messages.values.copyFailed);
      return;
    }
    if (cell.truncated) {
      this.flash(this.messages.values.tooLargeToCopy);
      return;
    }
    await this.copy(prettyJson(parseJsonTree(cell.text).root));
  }

  private async copy(text: string): Promise<void> {
    const seq = this.loadSeq;
    let copied = true;
    try {
      await copyToClipboard(text, 'text');
    } catch {
      copied = false;
    }
    if (seq !== this.loadSeq) return;
    this.flash(copied ? this.messages.values.copied : this.messages.values.copyFailed);
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
    this.extractChoices = new WeakMap();
    this.target = null;
    this.onOpenChange?.(null);
  }
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

/** An element of `tag` with `className`, and `text` as its text. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The × of the close button, as the filter panel draws it. */
function closeIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z',
  );
  svg.appendChild(path);
  return svg;
}
