/**
 * ExtractColumnPanel — the column header's "extract field → column" panel.
 *
 * A nested or JSON column's header has an extract button
 * (`.dt-col-extract-btn`) that opens this panel under it. The panel shows the
 * column's DuckDB type (`parseDuckDBType(column.originalType)`) as a keyboard
 * tree (`TreeView`): a struct's fields at any depth, a union's members and
 * its tag, a list's or an array's length and its element, a map's size and
 * its value. A part picked there, with what it still needs — an element's
 * 1-based position, a map value's key, and for a part that is JSON or VARIANT
 * a JSON path and how to read what it leads to — is the path
 * `actions.addNestedFieldColumn` takes. A JSON or VARIANT column has no tree:
 * the panel asks for the path at once.
 *
 * The panel shows the expression the column will read (`nestedFieldExpression`)
 * and its name, which follows the part picked until the user types one, and
 * says inline why a part cannot be read, Add column off meanwhile. It adds
 * nothing itself: Add column, or Enter in a field, hands the request to
 * `onSubmit`. `TableContainer.extractColumn` serves it, because adding the
 * column re-renders the table, which tears this panel down; a failure comes
 * back while the panel is still there, and the panel shows it (`role="alert"`).
 *
 * A non-modal ModalHost panel in `.dt-root`, like the filter panel: Tab cycles
 * inside it, Escape closes it, and focus goes back to the button that opened
 * it.
 *
 * Everything shown is set with `textContent`: field names, member tags and the
 * keys typed in come from the data or the user.
 *
 * Lazily loaded, like `DerivedColumnEditPanel`: a table that never opens it
 * never downloads it.
 */

import { collidingColumnName, columnNameKey } from '../core/columnNames';
import { type DuckDBTypeNode, parseDuckDBType } from '../core/duckdbType';
import { ModalHost } from '../core/ModalHost';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import { type ColumnSchema, ROWID_COLUMN } from '../core/types';
import {
  type JsonLeafKind,
  type NestedExtractKind,
  type NestedPathStep,
  nestedFieldExpression,
  uniqueColumnName,
} from '../nested/extractExpression';
import { columnTypeLabel, columnTypeTitle, typeOutline } from '../nested/typeOutline';
import { TreeView, type TreeViewNode } from './TreeView';

/** Gap between the button and the panel, and the margin kept from the table's edges. In px. */
const GAP = 4;
const EDGE = 8;

/** The least height the panel is given, in px, when the button leaves less room below. */
const MIN_HEIGHT = 160;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Mints the panels' element ids, unique on the page. */
let panelCount = 0;

// ---------------------------------------------------------------------------
// JSON paths
// ---------------------------------------------------------------------------

/**
 * {@link parseJsonPath}'s answer: the steps, or the 1-based character (code
 * point) where the path stops making sense.
 */
export type JsonPathParse =
  | { readonly ok: true; readonly steps: NestedPathStep[] }
  | { readonly ok: false; readonly at: number };

/** The escapes a quoted key takes besides `\uXXXX`: JSON's, and `\'`. */
const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "'": "'",
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/** Characters a key after `.` cannot hold: the ones that end it, and quotes. */
const DOT_KEY_END = /[.[\]"']/;

/**
 * Read a JSON path, as typed into the extract panel, into the steps
 * `nestedFieldExpression` takes inside a JSON or VARIANT value: object keys
 * (strings) and 0-based array indexes (numbers).
 *
 * - `$` first is optional: `$.a.b[0]`, `a.b[0]`, `.a` and `[0]` all read.
 * - A key after `.` runs to the next `.` or `[`, and holds anything but those,
 *   `]` and quotes: `$.my field`, `$.ünï`. A key that holds them is quoted, in
 *   brackets or after the dot: `$["a.b"]`, `$['it\'s']`, `$."a.b"`. Inside
 *   quotes a backslash escapes as in JSON (`\"`, `\\`, `\n`, `é`) and
 *   `\'` is a `'`.
 * - `[n]` is an array index, counted from 0. A minus sign is read too, so that
 *   `nestedFieldExpression` can say indexes start at 0.
 * - Spaces around the whole path, and inside brackets around what they hold,
 *   are left out.
 * - An empty path, or `$` alone, is the JSON value itself: no steps.
 *
 * Wildcards (`[*]`), slices and recursive descent (`..`) are not paths to one
 * value, and do not parse; `.*` is the key `*`.
 *
 * Never throws.
 *
 * @example
 * ```ts
 * parseJsonPath('$.a.b[0]');        // { ok: true, steps: ['a', 'b', 0] }
 * parseJsonPath('$["a.b"][0]');     // { ok: true, steps: ['a.b', 0] }
 * parseJsonPath('tags[1]');         // { ok: true, steps: ['tags', 1] }
 * parseJsonPath('$.a.');            // { ok: false, at: 5 }
 * ```
 */
export function parseJsonPath(text: string): JsonPathParse {
  const source = typeof text === 'string' ? text : '';
  const start = source.length - source.trimStart().length;
  const s = source.trim();
  const fail = (index: number): JsonPathParse => ({
    ok: false,
    // 1-based, in code points of what was typed.
    at: Array.from(source.slice(0, start + index)).length + 1,
  });
  const steps: NestedPathStep[] = [];
  let i = 0;

  /** A quoted key from `s[i]`, its quote, to the closing one. */
  const quoted = (): { key: string; end: number } | { failAt: number } => {
    const quote = s[i];
    let key = '';
    for (let j = i + 1; j < s.length;) {
      const c = s[j]!;
      if (c === quote) return { key, end: j + 1 };
      if (c !== '\\') {
        key += c;
        j++;
        continue;
      }
      const e = s[j + 1];
      if (e === 'u') {
        const hex = s.slice(j + 2, j + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return { failAt: j };
        key += String.fromCharCode(parseInt(hex, 16));
        j += 6;
      } else if (e !== undefined && ESCAPES[e] !== undefined) {
        key += ESCAPES[e];
        j += 2;
      } else {
        return { failAt: j };
      }
    }
    return { failAt: i };
  };

  /** Spaces from `s[i]` on. */
  const skipSpaces = (): void => {
    while (i < s.length && /\s/.test(s[i]!)) i++;
  };

  if (s[0] === '$') i = 1;
  else if (s.length > 0 && s[0] !== '.' && s[0] !== '[') {
    // A path without `$` may open with a bare key: `a.b[0]`.
    let end = 0;
    while (end < s.length && !DOT_KEY_END.test(s[end]!)) end++;
    if (end === 0) return fail(0);
    steps.push(s.slice(0, end));
    i = end;
  }

  while (i < s.length) {
    const c = s[i];
    if (c === '.') {
      i++;
      if (s[i] === '"' || s[i] === "'") {
        const read = quoted();
        if ('failAt' in read) return fail(read.failAt);
        steps.push(read.key);
        i = read.end;
        continue;
      }
      let end = i;
      while (end < s.length && !DOT_KEY_END.test(s[end]!)) end++;
      if (end === i) return fail(i);
      steps.push(s.slice(i, end));
      i = end;
    } else if (c === '[') {
      i++;
      skipSpaces();
      if (s[i] === '"' || s[i] === "'") {
        const read = quoted();
        if ('failAt' in read) return fail(read.failAt);
        steps.push(read.key);
        i = read.end;
      } else {
        const digits = /^-?\d+/.exec(s.slice(i));
        if (!digits) return fail(i);
        steps.push(Number(digits[0]));
        i += digits[0].length;
      }
      skipSpaces();
      if (s[i] !== ']') return fail(i);
      i++;
    } else {
      return fail(i);
    }
  }
  return { ok: true, steps };
}

// ---------------------------------------------------------------------------
// The column's parts
// ---------------------------------------------------------------------------

/**
 * What a node of the panel's tree stands for:
 *
 * - `field`: a struct's field, by name, or by position when it has none;
 * - `member`: a union's member;
 * - `element`: a list's or an array's elements, at a position typed in;
 * - `mapValue`: a map's values, by a key typed in;
 * - `length`, `size`, `tag`: a list's or an array's length, a map's number
 *   of entries, which member a union holds. End nodes, of their container.
 */
type PartKind = 'field' | 'member' | 'element' | 'mapValue' | 'length' | 'size' | 'tag';

/** One node of the panel's tree: a part of the column's type. */
interface Part {
  /** The tree node's id: the parts' indexes from the top, `1/0/2`. */
  readonly id: string;
  readonly kind: PartKind;
  /** The part this one is a part of; `null` for the column itself. */
  readonly parent: Part | null;
  /**
   * The path step this part adds: a field's name (its 1-based position when
   * it has none), a member's tag. `null` for an element and a map value,
   * whose step is typed in, and for the end nodes, which add none.
   */
  readonly step: NestedPathStep | null;
  /** The type this part reads; an end node has its container's. */
  readonly type: DuckDBTypeNode;
  /** The key its row shows. */
  readonly key: string;
}

/** Whether a part is an end node that reads its container: a length, a size, a tag. */
function isEndPart(part: Part): boolean {
  return part.kind === 'length' || part.kind === 'size' || part.kind === 'tag';
}

/** Whether values of `type` are JSON or VARIANT, read by a JSON path. */
function isJsonType(type: DuckDBTypeNode): boolean {
  return type.kind === 'json' || type.kind === 'variant';
}

/** Whether a value of `type` has parts of its own: {@link partsOf} finds some. */
function hasPartsOf(type: DuckDBTypeNode): boolean {
  switch (type.kind) {
    case 'struct':
      return type.fields.length > 0;
    case 'union':
    case 'list':
    case 'array':
    case 'map':
      return true;
    default:
      return false;
  }
}

/** A name or tag as a row shows it: the empty one as `""`. */
function shownName(name: string): string {
  return name === '' ? '""' : name;
}

/** The parts of a value of `type`, in the part `parent` (`null`: the column). */
function partsOf(type: DuckDBTypeNode, parent: Part | null, m: Strings['values']): Part[] {
  const id = (index: number): string => (parent ? `${parent.id}/${index}` : String(index));
  switch (type.kind) {
    case 'struct':
      return type.fields.map((field, index) => ({
        id: id(index),
        kind: 'field',
        parent,
        step: field.name ?? index + 1,
        type: field.type,
        key: field.name === null ? String(index + 1) : shownName(field.name),
      }));
    case 'union':
      return [
        { id: id(0), kind: 'tag', parent, step: null, type, key: m.tagNode },
        ...type.members.map((member, index): Part => ({
          id: id(index + 1),
          kind: 'member',
          parent,
          step: member.tag,
          type: member.type,
          key: shownName(member.tag),
        })),
      ];
    case 'list':
    case 'array':
      return [
        { id: id(0), kind: 'length', parent, step: null, type, key: m.lengthNode },
        { id: id(1), kind: 'element', parent, step: null, type: type.element, key: m.elementNode },
      ];
    case 'map':
      return [
        { id: id(0), kind: 'size', parent, step: null, type, key: m.sizeNode },
        { id: id(1), kind: 'mapValue', parent, step: null, type: type.value, key: m.mapValueNode },
      ];
    default:
      return [];
  }
}

/** `part` and the parts it is in, from the top down. */
function chainOf(part: Part | null): Part[] {
  const chain: Part[] = [];
  for (let p = part; p; p = p.parent) chain.push(p);
  return chain.reverse();
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

/**
 * What the extract panel asks to add: the arguments of
 * `actions.addNestedFieldColumn(column, path, { extract, jsonLeaf, name })`.
 */
export interface ExtractColumnPanelRequest {
  /** The nested or JSON column. */
  column: string;
  /** The steps from the column to the part, as `nestedFieldExpression` reads them. */
  path: readonly NestedPathStep[];
  /** What to read at the end of the path. */
  extract: NestedExtractKind;
  /** How to read a value inside JSON or VARIANT; only for a `'value'` there. */
  jsonLeaf?: JsonLeafKind | undefined;
  /**
   * The name typed in. Left out while the panel's own is kept: the action
   * makes the same one, unique among the columns there are when it runs.
   */
  name?: string | undefined;
}

/** How a request ended: what {@link ExtractColumnPanelOptions.onSubmit} resolves to. */
export interface ExtractColumnPanelResult {
  success: boolean;
  /** Why it failed, shown in the panel. */
  error?: string | undefined;
}

/** Construction options for {@link ExtractColumnPanel}. */
export interface ExtractColumnPanelOptions {
  /** CSS class prefix (default: 'dt'). */
  classPrefix?: string | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
  /** Element to mirror `data-dt-color-scheme` from: the table's `.dt-root`. */
  colorSchemeSource?: HTMLElement | undefined;
  /**
   * Add the column. The panel says "Adding…" meanwhile, closes on success if
   * it is still there, and shows a failure's reason.
   */
  onSubmit: (request: ExtractColumnPanelRequest) => Promise<ExtractColumnPanelResult>;
  /**
   * Called with the column the panel opens for, and with `null` once it
   * closes. `TableContainer` keeps that column mounted meanwhile, so the
   * button focus goes back to is there.
   */
  onOpenChange?: ((column: string | null) => void) | undefined;
}

/** How "Read as" reads a value inside JSON or VARIANT, by the select's value. */
function jsonLeafOf(readAs: string): JsonLeafKind {
  return readAs === 'number' || readAs === 'boolean' || readAs === 'json' ? readAs : 'string';
}

/**
 * The header's "extract field → column" panel: a tree of the column's type,
 * the inputs the part picked needs, the new column's name and expression, and
 * Add column. See the module comment. One instance serves one table.
 *
 * ```
 * div.dt-extract-panel [role=dialog]   "Extract from people" · [struct(3)] · ×
 *   div.__body
 *     div.__tree > div.dt-value-tree    length / element: struct(3) / name: varchar …
 *     div.__steps > div.__field         Position in people [1]
 *     div.__json                        JSON path [$.a[0]] (hint) · Read as [Text]
 *     div.__field                       Column name [people_1_name]
 *     div.__field                       Expression `"people"[1]['name']`
 *     div.__error                       why the part cannot be read
 *   div.__footer                        [alert] [Cancel] [Add column]
 * ```
 *
 * @example
 * ```ts
 * const panel = new ExtractColumnPanel(state, {
 *   onSubmit: ({ column, path, extract, jsonLeaf, name }) =>
 *     actions.addNestedFieldColumn(column, path, { extract, jsonLeaf, name }),
 * });
 * root.appendChild(panel.getElement());
 * panel.toggle('people', extractButton);
 * // later:
 * panel.destroy();
 * ```
 */
export class ExtractColumnPanel {
  private readonly element: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly typeEl: HTMLElement;
  private readonly treeSlot: HTMLElement;
  private readonly stepsEl: HTMLElement;
  private readonly jsonEl: HTMLElement;
  private readonly jsonPathInput: HTMLInputElement;
  private readonly readAsSelect: HTMLSelectElement;
  private readonly nameInput: HTMLInputElement;
  private readonly expressionEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly alertEl: HTMLElement;
  private readonly addButton: HTMLButtonElement;

  private readonly prefix: string;
  private readonly messages: Strings;
  private readonly colorSchemeSource: HTMLElement | undefined;
  private readonly onSubmit: (
    request: ExtractColumnPanelRequest,
  ) => Promise<ExtractColumnPanelResult>;
  private readonly onOpenChange: ((column: string | null) => void) | undefined;
  /** The start of every element id the panel mints, unique on the page. */
  private readonly idBase: string;
  private readonly titleId: string;
  private readonly errorId: string;
  private readonly modalHost = new ModalHost();

  private column: ColumnSchema | null = null;
  private columnType: DuckDBTypeNode | null = null;
  private anchor: HTMLElement | null = null;
  private tree: TreeView<Part> | null = null;
  /** The part picked; `null` for the column itself, a JSON or VARIANT one. */
  private selection: Part | null = null;
  /** Whether anything can be picked: a column whose type could not be read has no parts. */
  private hasParts = false;
  /** What was typed for each element's position and map value's key, by part id. */
  private readonly stepValues = new Map<string, string>();
  /** The inputs of the steps typed in, by part id, as rendered for the selection. */
  private stepInputs = new Map<string, HTMLInputElement>();
  /** Whether the name is the user's: then it no longer follows the part picked. */
  private nameEdited = false;
  /** What Add column sends now; `null` while something is wrong. */
  private request: ExtractColumnPanelRequest | null = null;
  private pending = false;
  private isOpen = false;
  private destroyed = false;
  // Bumped by every submit, open and close: an outcome that comes back to
  // another number is dropped.
  private submitSeq = 0;

  constructor(
    private readonly state: TableState,
    options: ExtractColumnPanelOptions,
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.messages = options.messages ?? defaultStrings;
    this.colorSchemeSource = options.colorSchemeSource;
    this.onSubmit = options.onSubmit;
    this.onOpenChange = options.onOpenChange;
    const id = `${this.prefix}-extract-panel-${++panelCount}`;
    this.idBase = id;
    this.titleId = `${id}-title`;
    this.errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const p = `${this.prefix}-extract-panel`;
    const m = this.messages.values;

    this.element = element('div', p);
    this.element.style.display = 'none';
    // A dialog to assistive technology whatever its state; not modal: the
    // table stays in view and in reach.
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-labelledby', this.titleId);

    const header = element('div', `${p}__header`);
    this.titleEl = element('span', `${p}__title`);
    this.titleEl.id = this.titleId;
    this.typeEl = element('span', `${p}__type`);
    const closeX = element('button', `${p}__close`);
    closeX.type = 'button';
    closeX.setAttribute('aria-label', m.extractCloseLabel);
    closeX.appendChild(closeIcon());
    closeX.addEventListener('click', () => this.close());
    header.append(this.titleEl, this.typeEl, closeX);

    const body = element('div', `${p}__body`);

    // The tree's slot: the tree is its own scroll container.
    this.treeSlot = element('div', `${p}__tree`);

    // One field per position or key the part picked needs, rebuilt with it.
    this.stepsEl = element('div', `${p}__steps`);

    // A JSON or VARIANT part: the path into it, and how to read the end.
    this.jsonEl = element('div', `${p}__json`);
    this.jsonPathInput = element('input', `${this.prefix}-filter-input ${p}__input ${p}__path`);
    this.jsonPathInput.type = 'text';
    this.jsonPathInput.autocomplete = 'off';
    this.jsonPathInput.spellcheck = false;
    this.jsonPathInput.placeholder = '$';
    this.jsonPathInput.setAttribute('aria-describedby', `${hintId} ${this.errorId}`);
    this.jsonPathInput.addEventListener('input', () => this.update());
    const hint = element('span', `${p}__hint`, m.jsonPathHint);
    hint.id = hintId;
    const pathField = this.field(`${id}-path`, m.jsonPathLabel, this.jsonPathInput);
    pathField.appendChild(hint);
    this.readAsSelect = element('select', `${this.prefix}-filter-select ${p}__input`);
    for (const kind of ['string', 'number', 'boolean', 'json', 'length'] as const) {
      const option = element('option', '', m.readAs[kind]);
      option.value = kind;
      this.readAsSelect.appendChild(option);
    }
    this.readAsSelect.addEventListener('change', () => this.update());
    this.jsonEl.append(pathField, this.field(`${id}-read-as`, m.readAsLabel, this.readAsSelect));

    this.nameInput = element('input', `${this.prefix}-filter-input ${p}__input ${p}__name`);
    this.nameInput.type = 'text';
    this.nameInput.autocomplete = 'off';
    this.nameInput.spellcheck = false;
    this.nameInput.setAttribute('aria-describedby', this.errorId);
    this.nameInput.addEventListener('input', () => {
      // Emptied, it is the panel's again: the placeholder shows the name
      // used, and the next part picked fills it in.
      this.nameEdited = this.nameInput.value.trim() !== '';
      this.update({ keepName: true });
    });
    const nameField = this.field(`${id}-name`, m.columnNameLabel, this.nameInput);

    // What the column will read, as text: a `code` element, which takes no
    // name, after its visible label.
    const expressionField = element('div', `${p}__field`);
    this.expressionEl = element('code', `${p}__expression`);
    expressionField.append(element('span', `${p}__label`, m.expressionLabel), this.expressionEl);

    // Why the part cannot be read: described by the inputs, not live, as it
    // changes with every key typed.
    this.errorEl = element('div', `${p}__error`);
    this.errorEl.id = this.errorId;

    body.append(this.treeSlot, this.stepsEl, this.jsonEl, nameField, expressionField, this.errorEl);

    const footer = element('div', `${p}__footer`);
    // Why the add failed. In the DOM from the start, empty, so the text put
    // in it is announced.
    this.alertEl = element('div', `${p}__alert`);
    this.alertEl.setAttribute('role', 'alert');
    const cancel = element('button', `${p}__button`, this.messages.common.cancel);
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    this.addButton = element('button', `${p}__button ${p}__button--primary`, m.addColumn);
    this.addButton.type = 'button';
    this.addButton.addEventListener('click', () => void this.submit());
    footer.append(this.alertEl, cancel, this.addButton);

    this.element.append(header, body, footer);

    // Enter in a field, or on an end node of the tree, adds the column; so
    // does Ctrl/Cmd+Enter anywhere. The tree claims Enter on a node that
    // expands, and buttons and the select keep their own.
    this.element.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey) {
        return;
      }
      const target = e.target;
      const submits =
        e.ctrlKey ||
        e.metaKey ||
        target instanceof HTMLInputElement ||
        (target instanceof HTMLElement && target.getAttribute('role') === 'treeitem');
      if (!submits) return;
      e.preventDefault();
      void this.submit();
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

  /** The column the panel is open for, or `null` while it is closed. */
  getCurrentColumn(): string | null {
    return this.isOpen ? (this.column?.name ?? null) : null;
  }

  /** Open the panel for `column` under `anchor`, or close it when it is open for that column. */
  toggle(column: string, anchor: HTMLElement): void {
    if (this.isOpen && this.column?.name === column) this.close();
    else this.open(column, anchor);
  }

  /**
   * Open the panel for `column`, a nested or JSON column of the schema, under
   * `anchor`, the button that opened it, where focus goes back on close. Open
   * for another column, it starts over with this one.
   */
  open(column: string, anchor: HTMLElement): void {
    if (this.destroyed) return;
    const entry = this.state.schema.get().find((c) => c.name === column);
    if (!entry) return;
    if (this.isOpen) this.modalHost.close();

    const m = this.messages.values;
    this.column = entry;
    const type = parseDuckDBType(entry.originalType ?? '');
    this.columnType = type;
    this.titleEl.textContent = m.extractTitle(entry.name);
    this.typeEl.textContent = columnTypeLabel(entry);
    const fullType = columnTypeTitle(entry);
    if (fullType === null) this.typeEl.removeAttribute('title');
    else this.typeEl.title = fullType;

    // Each open starts over: no part, path, name or failure carried over.
    this.submitSeq++;
    this.pending = false;
    this.stepValues.clear();
    this.jsonPathInput.value = '';
    this.readAsSelect.value = 'string';
    this.nameInput.value = '';
    this.nameEdited = false;
    this.alertEl.textContent = '';
    this.addButton.textContent = m.addColumn;
    this.addButton.removeAttribute('aria-disabled');
    this.buildTree(entry, type);

    this.anchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    this.isOpen = true;
    this.element.style.display = '';
    this.onOpenChange?.(entry.name);
    this.position(anchor);

    this.modalHost.open({
      mode: 'panel',
      element: this.element,
      labelledBy: this.titleId,
      // The button toggles the panel: its press is not an outside click.
      outsideClickIgnore: [`.${this.prefix}-col-extract-btn`],
      returnFocus: anchor,
      initialFocus: this.tree?.getActiveItem() ?? (this.hasParts ? this.jsonPathInput : null),
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });
  }

  /** Close the panel; focus goes back to the button that opened it. */
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
    this.destroyTree();
    this.element.remove();
  }

  // =========================================
  // Tree
  // =========================================

  private buildTree(column: ColumnSchema, type: DuckDBTypeNode): void {
    this.destroyTree();
    const m = this.messages.values;
    if (isJsonType(type)) {
      // Nothing to pick: the path goes straight into the column.
      this.hasParts = true;
      this.treeSlot.hidden = true;
      this.select(null);
      return;
    }
    const roots = partsOf(type, null, m);
    this.hasParts = roots.length > 0;
    if (!this.hasParts) {
      this.treeSlot.hidden = true;
      this.select(null);
      return;
    }
    const tree = new TreeView<Part>(
      roots.map((part) => this.viewNode(part)),
      {
        classPrefix: this.prefix,
        label: m.extractTreeLabel(column.name),
        // A list's or a map's content open at the top, so a list of structs
        // shows its fields at once.
        initiallyExpanded: (node, level) =>
          level === 1 && (node.data?.kind === 'element' || node.data?.kind === 'mapValue'),
        onActiveChange: (node) => this.select(node.data ?? null),
      },
    );
    this.tree = tree;
    this.treeSlot.hidden = false;
    this.treeSlot.replaceChildren(tree.getElement());
    this.select(tree.getActive()?.data ?? null);
  }

  private destroyTree(): void {
    this.tree?.destroy();
    this.tree = null;
    this.treeSlot.replaceChildren();
  }

  /** A part as a tree node; its parts are made when it first expands. */
  private viewNode(part: Part): TreeViewNode<Part> {
    const m = this.messages.values;
    const end = isEndPart(part);
    const typeLabel = end ? '' : typeOutline(part.type, 'label');
    const expands = !end && hasPartsOf(part.type);
    return {
      id: part.id,
      label: end ? part.key : `${part.key}: ${typeLabel}`,
      render: (content) => {
        const t = `${this.prefix}-value-tree`;
        const keyKind =
          part.kind === 'member' || (part.kind === 'field' && typeof part.step === 'string')
            ? 'field'
            : part.kind === 'field'
              ? 'position'
              : 'part';
        content.appendChild(element('span', `${t}__key ${t}__key--${keyKind}`, part.key));
        if (end) return;
        content.append(
          element('span', `${t}__sep`, ': '),
          element('span', `${t}__type`, typeLabel),
        );
      },
      children: expands
        ? () => partsOf(part.type, part, m).map((child) => this.viewNode(child))
        : undefined,
      data: part,
    };
  }

  /** Pick a part: the fields it needs, then what it reads. */
  private select(part: Part | null): void {
    this.selection = part;
    this.renderSteps();
    this.jsonEl.hidden = !this.readsJson();
    this.update();
  }

  /** Whether the part picked is JSON or VARIANT, read by a JSON path. */
  private readsJson(): boolean {
    const part = this.selection;
    if (part) return !isEndPart(part) && isJsonType(part.type);
    return this.hasParts && this.columnType !== null && isJsonType(this.columnType);
  }

  // =========================================
  // Steps typed in
  // =========================================

  /** One field for each element position and map key on the way to the part picked. */
  private renderSteps(): void {
    const inputs = new Map<string, HTMLInputElement>();
    const fields: HTMLElement[] = [];
    for (const part of chainOf(this.selection)) {
      if (part.kind !== 'element' && part.kind !== 'mapValue') continue;
      const { field, input } = this.stepField(part);
      inputs.set(part.id, input);
      fields.push(field);
    }
    this.stepInputs = inputs;
    this.stepsEl.replaceChildren(...fields);
    this.stepsEl.hidden = fields.length === 0;
  }

  private stepField(part: Part): { field: HTMLElement; input: HTMLInputElement } {
    const m = this.messages.values;
    const container = part.parent?.type ?? this.columnType;
    const name = this.containerName(part.parent);
    const position = part.kind === 'element';
    const input = element(
      'input',
      `${this.prefix}-filter-input ${this.prefix}-extract-panel__input`,
    );
    input.autocomplete = 'off';
    input.setAttribute('aria-describedby', this.errorId);
    if (position) {
      input.type = 'number';
      input.min = '1';
      input.step = '1';
      if (container?.kind === 'array') input.max = String(container.size);
    } else {
      input.type = 'text';
      input.spellcheck = false;
      input.setAttribute('aria-required', 'true');
      const key = container?.kind === 'map' ? container.key : null;
      if (key?.kind === 'scalar' && key.dataType === 'integer') {
        input.setAttribute('inputmode', 'numeric');
      }
    }
    input.value = this.stepValues.get(part.id) ?? (position ? '1' : '');
    input.addEventListener('input', () => {
      this.stepValues.set(part.id, input.value);
      this.update();
    });
    const field = this.field(
      `${this.idBase}-step-${part.id.replace(/\//g, '-')}`,
      position ? m.positionLabel(name) : m.keyLabel(name),
      input,
    );
    return { field, input };
  }

  /** A labelled field: `div.__field` holding `label.__label` for `control`, which gets `id`. */
  private field(
    id: string,
    text: string,
    control: HTMLInputElement | HTMLSelectElement,
  ): HTMLElement {
    const p = `${this.prefix}-extract-panel`;
    const field = element('div', `${p}__field`);
    const label = element('label', `${p}__label`, text);
    control.id = id;
    label.htmlFor = id;
    field.append(label, control);
    return field;
  }

  /**
   * The name a position or key field gives its container: the column, a
   * field, a member; an element or map value after its own container's name
   * (`matrix › element`), as is a field with no name.
   */
  private containerName(part: Part | null): string {
    if (!part) return this.column?.name ?? '';
    if (part.kind === 'field' && typeof part.step === 'string') return part.key;
    if (part.kind === 'member') return part.key;
    return `${this.containerName(part.parent)} › ${part.key}`;
  }

  // =========================================
  // What the part reads
  // =========================================

  /**
   * Work out the request for what is picked and typed now, and show it: the
   * expression, the name, and why it cannot be sent when it cannot.
   *
   * @param keepName - From the name field itself: leave what it holds.
   */
  private update({ keepName = false }: { keepName?: boolean } = {}): void {
    for (const input of [this.jsonPathInput, this.nameInput, ...this.stepInputs.values()]) {
      input.removeAttribute('aria-invalid');
    }
    this.alertEl.textContent = '';
    this.request = null;
    const column = this.column;
    const m = this.messages.values;
    if (!column) return;
    if (!this.hasParts) {
      this.fail(m.nothingToExtract, null);
      return;
    }

    // The steps, and for each the field it was typed in, if any.
    const path: NestedPathStep[] = [];
    const sources: (HTMLInputElement | null)[] = [];
    for (const part of chainOf(this.selection)) {
      const input = this.stepInputs.get(part.id) ?? null;
      if (part.kind === 'element') {
        const raw = (this.stepValues.get(part.id) ?? '1').trim();
        if (!/^\d+$/.test(raw) || Number(raw) < 1) {
          this.fail(m.positionInvalid, input);
          return;
        }
        path.push(Number(raw));
        sources.push(input);
      } else if (part.kind === 'mapValue') {
        const key = this.stepValues.get(part.id);
        if (key === undefined || key === '') {
          // A field just shown is empty, not wrong: it is marked once typed
          // in, or once Enter is pressed.
          this.fail(m.keyRequired, key === undefined ? null : input);
          return;
        }
        path.push(key);
        sources.push(input);
      } else if (part.step !== null) {
        path.push(part.step);
        sources.push(null);
      }
    }

    const part = this.selection;
    let extract: NestedExtractKind = 'value';
    let jsonLeaf: JsonLeafKind | undefined;
    if (part && (part.kind === 'length' || part.kind === 'size')) extract = 'length';
    else if (part?.kind === 'tag') extract = 'tag';
    else if (this.readsJson()) {
      const parsed = parseJsonPath(this.jsonPathInput.value);
      if (!parsed.ok) {
        this.fail(m.jsonPathInvalid(parsed.at), this.jsonPathInput);
        return;
      }
      for (const step of parsed.steps) {
        path.push(step);
        sources.push(this.jsonPathInput);
      }
      const readAs = this.readAsSelect.value;
      if (readAs === 'length') extract = 'length';
      else jsonLeaf = jsonLeafOf(readAs);
    }

    const result = nestedFieldExpression(
      { name: column.name, originalType: column.originalType ?? '' },
      path,
      { extract, jsonLeaf },
    );
    if (!result.ok) {
      // In English, as the action reports it: the step at fault marks its field.
      this.fail(result.error.message, sources[result.error.step] ?? null);
      return;
    }

    this.expressionEl.textContent = result.expression;
    const names = this.state.schema.get().map((c) => c.name);
    const defaultName = uniqueColumnName(result.name, names);
    this.nameInput.placeholder = defaultName;
    if (!this.nameEdited && !keepName) this.nameInput.value = defaultName;
    const typed = this.nameInput.value.trim();
    const name = this.nameEdited && typed !== '' ? typed : defaultName;
    const taken =
      columnNameKey(name) === ROWID_COLUMN ? ROWID_COLUMN : collidingColumnName(name, names);
    if (taken !== undefined) {
      this.fail(this.messages.derived.nameDuplicate(taken), this.nameInput, true);
      return;
    }

    this.errorEl.textContent = '';
    this.errorEl.hidden = true;
    this.request = {
      column: column.name,
      path,
      extract,
      ...(jsonLeaf !== undefined && extract === 'value' ? { jsonLeaf } : {}),
      ...(this.nameEdited && typed !== '' ? { name: typed } : {}),
    };
    this.addButton.disabled = false;
  }

  /**
   * Say why nothing can be added, mark the field at fault, and turn Add
   * column off.
   *
   * @param keepExpression - Only the name is wrong: the expression stands.
   */
  private fail(message: string, input: HTMLInputElement | null, keepExpression = false): void {
    if (!keepExpression) this.expressionEl.textContent = '';
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
    input?.setAttribute('aria-invalid', 'true');
    this.addButton.disabled = true;
  }

  // =========================================
  // Add
  // =========================================

  private async submit(): Promise<void> {
    const request = this.request;
    if (!this.isOpen || this.pending) return;
    if (!request) {
      // Enter with a key still to type: now its empty field is wrong.
      let marked = false;
      for (const part of chainOf(this.selection)) {
        if (part.kind === 'mapValue' && !this.stepValues.has(part.id)) {
          this.stepValues.set(part.id, '');
          marked = true;
        }
      }
      if (marked) this.update();
      return;
    }
    const m = this.messages.values;
    const seq = ++this.submitSeq;
    this.pending = true;
    this.alertEl.textContent = '';
    // Not `disabled`: the button keeps focus, and with it Escape and the
    // focus trap, while the column is added.
    this.addButton.setAttribute('aria-disabled', 'true');
    this.addButton.textContent = m.adding;
    let result: ExtractColumnPanelResult;
    try {
      result = await this.onSubmit(request);
    } catch (err) {
      result = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    // Added, the table re-rendered and destroyed the panel; closed or
    // opened anew meanwhile, the outcome is not this one's.
    if (this.destroyed || seq !== this.submitSeq) return;
    this.pending = false;
    this.addButton.removeAttribute('aria-disabled');
    this.addButton.textContent = m.addColumn;
    if (result.success) {
      this.close();
      return;
    }
    // Against the columns there are now: a name taken meanwhile is not the
    // default any more.
    this.update();
    this.alertEl.textContent = m.extractFailed(result.error ?? '');
  }

  // =========================================
  // Placement + close
  // =========================================

  /**
   * Under the button, left-aligned with it, kept inside the table, and no
   * taller than the room below it. In jsdom every rect is zero, which leaves
   * the stylesheet's defaults.
   */
  private position(anchor: HTMLElement): void {
    const style = this.element.style;
    style.left = '';
    style.top = '';
    style.maxHeight = '';
    const root = this.element.parentElement;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    if (rootRect.width === 0 && rootRect.height === 0) return;
    const button = anchor.getBoundingClientRect();
    // Offsets are from the root's padding box.
    const originLeft = rootRect.left + root.clientLeft;
    const originTop = rootRect.top + root.clientTop;
    const width = this.element.offsetWidth;
    const left = Math.max(
      EDGE,
      Math.min(button.left - originLeft, root.clientWidth - width - EDGE),
    );
    const top = button.bottom - originTop + GAP;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.maxHeight = `${Math.max(root.clientHeight - top - EDGE, MIN_HEIGHT)}px`;
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.submitSeq++;
    this.pending = false;
    this.element.style.display = 'none';
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.anchor = null;
    this.destroyTree();
    this.onOpenChange?.(null);
  }
}

/** An element of `tag` with `className`, and `text` as its text. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
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
