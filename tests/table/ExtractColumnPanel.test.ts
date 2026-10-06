/**
 * @vitest-environment jsdom
 *
 * The header's extract panel on its own: the JSON path parser, the tree of a
 * column's type for each kind of type, the position and key fields, the JSON
 * path and "Read as", the default name and how it follows the part picked
 * until the user types one, the expression preview, the errors shown inline,
 * the request it hands on and the failure it shows, the keyboard, focus, and
 * translated strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { takenColumnName } from '@/core/columnNames';
import { __resetModalHostForTests } from '@/core/ModalHost';
import { createTableState, type TableState } from '@/core/State';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';
import {
  ExtractColumnPanel,
  type ExtractColumnPanelOptions,
  type ExtractColumnPanelRequest,
  type ExtractColumnPanelResult,
  parseJsonPath,
} from '@/table/ExtractColumnPanel';

// ---------------------------------------------------------------------------
// The JSON path parser
// ---------------------------------------------------------------------------

describe('parseJsonPath', () => {
  it.each([
    ['', []],
    ['$', []],
    ['  $  ', []],
    ['$.a.b[0]', ['a', 'b', 0]],
    ['a.b[0]', ['a', 'b', 0]],
    ['.a', ['a']],
    ['[0]', [0]],
    ['$[0][12]', [0, 12]],
    ['$[007]', [7]],
    ['$[ 1 ]', [1]],
    ['$.my field', ['my field']],
    ['$.ünï.😀', ['ünï', '😀']],
    ['$.a$b', ['a$b']],
    ['$.*', ['*']],
    ['$.0', ['0']],
  ] as const)('reads %j', (text, steps) => {
    expect(parseJsonPath(text)).toEqual({ ok: true, steps });
  });

  it.each([
    ['$["a.b"][0]', ['a.b', 0]],
    ["$['a.b']", ['a.b']],
    ['$."a.b"', ['a.b']],
    ["$.'x'.y", ['x', 'y']],
    ['$[ "k" ]', ['k']],
    ['$[""]', ['']],
    ['["0"][0]', ['0', 0]],
    ['$["q\\"k"]', ['q"k']],
    ["$['it\\'s']", ["it's"]],
    ['$["it\'s"]', ["it's"]],
    ['$["a\\\\b"]', ['a\\b']],
    ['$["\\n\\t\\/\\u00e9\\uD83D\\uDE00"]', ['\n\t/é😀']],
    ['$["a]b[c"]', ['a]b[c']],
  ] as const)('reads the quoted key in %j', (text, steps) => {
    expect(parseJsonPath(text)).toEqual({ ok: true, steps });
  });

  it('reads a minus sign, for the expression to refuse', () => {
    expect(parseJsonPath('$[-1]')).toEqual({ ok: true, steps: [-1] });
  });

  it.each([
    ['$.', 3],
    ['$..a', 3],
    ['$.a.', 5],
    ['$[', 3],
    ['$[0', 4],
    ['$[]', 3],
    ['$[ ]', 4],
    ['$[a]', 3],
    ['$[*]', 3],
    ['$[1.5]', 4],
    ['$["a', 3],
    ['$["a"', 6],
    ['$["\\x"]', 4],
    ['$["\\u12"]', 4],
    ['$a', 2],
    ['$$', 2],
    ['$.a]', 4],
    ['$.a"b', 4],
    ['a[', 3],
    ['.', 2],
    ['"a"', 1],
    [']', 1],
    ['  $.', 5],
    // In characters as typed, not UTF-16 units: the emoji counts once.
    ['$.😀.', 5],
  ] as const)('stops at %j, character %i', (text, at) => {
    expect(parseJsonPath(text)).toEqual({ ok: false, at });
  });

  it('never throws, whatever it is given', () => {
    const alphabet = ['$', '.', '[', ']', '"', "'", '\\', 'u', '0', '9', 'a', '-', ' ', '😀', '*'];
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let n = 0; n < 3000; n++) {
      let text = '';
      const length = Math.floor(random() * 12);
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(random() * alphabet.length)];
      const parsed = parseJsonPath(text);
      if (parsed.ok) {
        for (const step of parsed.steps) {
          expect(typeof step === 'string' || Number.isInteger(step), text).toBe(true);
        }
      } else {
        expect(parsed.at, text).toBeGreaterThanOrEqual(1);
        expect(parsed.at, text).toBeLessThanOrEqual(Array.from(text).length + 1);
      }
    }
    for (const odd of [undefined, null, 42, {}] as unknown as string[]) {
      expect(parseJsonPath(odd)).toEqual({ ok: true, steps: [] });
    }
  });
});

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

const nested = (name: string, originalType: string): ColumnSchema => ({
  name,
  type: 'nested',
  nullable: true,
  originalType,
});

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT' },
  { name: 'id', type: 'integer', nullable: false, originalType: 'BIGINT' },
  nested('point', 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)'),
  nested('odd', 'STRUCT("quote""d" VARCHAR, "my field" INTEGER, "" BOOLEAN, "<b>x</b>" VARCHAR)'),
  nested('pair', 'STRUCT(INTEGER, VARCHAR)'),
  nested('u', 'UNION(num INTEGER, str VARCHAR)'),
  nested('people', 'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]'),
  nested('tags', 'VARCHAR[]'),
  nested('matrix', 'SMALLINT[][]'),
  nested('emb', 'FLOAT[3]'),
  nested('attrs', 'MAP(VARCHAR, INTEGER)'),
  nested('int_keys', 'MAP(INTEGER, VARCHAR)'),
  nested(
    'nested_struct',
    'STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR)), "version" INTEGER)',
  ),
  nested('s', 'STRUCT(meta JSON, n INTEGER)'),
  nested('json_list', 'JSON[]'),
  nested('v', 'VARIANT'),
  nested('broken', 'STRUCT(' + 'x '.repeat(3)),
  { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
];

let state: TableState;
let root: HTMLElement;
let anchor: HTMLButtonElement;
let panel: ExtractColumnPanel;
let onSubmit: ReturnType<
  typeof vi.fn<(r: ExtractColumnPanelRequest) => Promise<ExtractColumnPanelResult>>
>;
let onOpenChange: ReturnType<typeof vi.fn<(column: string | null) => void>>;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function mount(options: Partial<ExtractColumnPanelOptions> = {}): ExtractColumnPanel {
  panel = new ExtractColumnPanel(state, { onSubmit, onOpenChange, ...options });
  root.appendChild(panel.getElement());
  return panel;
}

beforeEach(() => {
  state = createTableState();
  state.schema.set(SCHEMA);
  root = document.createElement('div');
  root.className = 'dt-root';
  anchor = document.createElement('button');
  anchor.className = 'dt-col-action-btn dt-col-extract-btn';
  anchor.setAttribute('aria-expanded', 'false');
  root.appendChild(anchor);
  document.body.appendChild(root);
  onSubmit = vi.fn(async () => ({ success: true }));
  onOpenChange = vi.fn();
});

afterEach(() => {
  panel?.destroy();
  __resetModalHostForTests();
  document.body.innerHTML = '';
});

const el = (): HTMLElement => panel.getElement();
const q = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  el().querySelector<T>(selector)!;
const items = (): HTMLElement[] => [...el().querySelectorAll<HTMLElement>('[role="treeitem"]')];
const labels = (): string[] => items().map((item) => item.getAttribute('aria-label') ?? '');
const item = (label: string): HTMLElement => {
  const found = items().find((i) => i.getAttribute('aria-label') === label);
  if (!found) throw new Error(`no tree item "${label}" in ${JSON.stringify(labels())}`);
  return found;
};
/** Pick a part, as a click on its row does. */
const pick = (label: string): void => item(label).click();
const active = (): string | null =>
  el().querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('aria-label') ?? null;
const expression = (): string => q('.dt-extract-panel__expression').textContent ?? '';
const nameInput = (): HTMLInputElement => q<HTMLInputElement>('.dt-extract-panel__name');
const pathInput = (): HTMLInputElement => q<HTMLInputElement>('.dt-extract-panel__path');
const readAs = (): HTMLSelectElement => q<HTMLSelectElement>('select');
const addButton = (): HTMLButtonElement =>
  q<HTMLButtonElement>('.dt-extract-panel__button--primary');
const errorEl = (): HTMLElement => q('.dt-extract-panel__error');
/** The inline error, or `null` while there is none. */
const error = (): string | null => (errorEl().hidden ? null : errorEl().textContent);
const alertEl = (): HTMLElement => q('[role="alert"]');
/** The position and key fields, by their labels. */
const steps = (): { label: string; input: HTMLInputElement }[] =>
  [...el().querySelectorAll<HTMLInputElement>('.dt-extract-panel__steps input')].map((input) => ({
    label: input.labels?.[0]?.textContent ?? '',
    input,
  }));
const isShown = (): boolean => el().style.display !== 'none';
const jsonShown = (): boolean => !q('.dt-extract-panel__json').hidden;

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
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

describe('ExtractColumnPanel', () => {
  describe('the tree of the column’s type', () => {
    it('shows a struct’s fields, the first one picked', () => {
      mount().open('point', anchor);
      expect(labels()).toEqual(['x: double', 'y: double', 'tier: varchar']);
      expect(active()).toBe('x: double');
      expect(el().querySelector('[role="tree"]')!.getAttribute('aria-label')).toBe(
        'Parts of point',
      );
      expect(expression()).toBe(`"point"['x']`);
      expect(nameInput().value).toBe('point_x');
      expect(error()).toBeNull();
      expect(addButton().disabled).toBe(false);
    });

    it('shows odd field names as they are, as text', () => {
      mount().open('odd', anchor);
      expect(labels()).toEqual([
        'quote"d: varchar',
        'my field: integer',
        '"": boolean',
        '<b>x</b>: varchar',
      ]);
      expect(el().querySelector('[role="tree"] b')).toBeNull();
      expect(item('<b>x</b>: varchar').querySelector('.dt-value-tree__key')!.textContent).toBe(
        '<b>x</b>',
      );
      expect(expression()).toBe(`"odd"['quote"d']`);
      expect(nameInput().value).toBe('odd_quote_d');
      pick('"": boolean');
      // DuckDB reads a field named '' only by struct_extract_at.
      expect(expression()).toBe('struct_extract_at("odd", 3)');
      expect(nameInput().value).toBe('odd_field');
    });

    it('shows unnamed fields by position, and reads them so', () => {
      mount().open('pair', anchor);
      expect(labels()).toEqual(['1: integer', '2: varchar']);
      expect(items()[0]!.querySelector('.dt-value-tree__key--position')).toBeTruthy();
      pick('2: varchar');
      expect(expression()).toBe('struct_extract("pair", 2)');
      expect(nameInput().value).toBe('pair_2');
    });

    it('shows a union’s tag and members', () => {
      mount().open('u', anchor);
      expect(labels()).toEqual(['tag', 'num: integer', 'str: varchar']);
      expect(items()[0]!.querySelector('.dt-value-tree__key--part')!.textContent).toBe('tag');
      expect(expression()).toBe('union_tag("u")');
      expect(nameInput().value).toBe('u_tag');
      pick('num: integer');
      expect(expression()).toBe(`union_extract("u", 'num')`);
      expect(nameInput().value).toBe('u_num');
    });

    it('shows a list of structs with its element open, and its length', () => {
      mount().open('people', anchor);
      expect(labels()).toEqual([
        'length',
        'element: struct(3)',
        'name: varchar',
        'age: integer',
        'langs: [varchar]',
      ]);
      expect(item('name: varchar').getAttribute('aria-level')).toBe('2');
      expect(item('element: struct(3)').getAttribute('aria-expanded')).toBe('true');
      expect(item('langs: [varchar]').getAttribute('aria-expanded')).toBe('false');
      expect(expression()).toBe('len("people")');
      expect(nameInput().value).toBe('people_length');
    });

    it('shows a map’s size and value', () => {
      mount().open('attrs', anchor);
      expect(labels()).toEqual(['size', 'value: integer']);
      expect(expression()).toBe('cardinality("attrs")');
      expect(nameInput().value).toBe('attrs_size');
    });

    it('shows a fixed-size array as a list', () => {
      mount().open('emb', anchor);
      expect(labels()).toEqual(['length', 'element: float']);
      expect(expression()).toBe('len("emb")');
    });

    it('keeps a struct field that is a struct closed until it opens, and extracts it whole', () => {
      mount().open('nested_struct', anchor);
      expect(labels()).toEqual(['owner: struct(2)', 'version: integer']);
      expect(expression()).toBe(`"nested_struct"['owner']`);
      expect(nameInput().value).toBe('nested_struct_owner');
      key(item('owner: struct(2)'), 'ArrowRight');
      expect(labels()).toEqual([
        'owner: struct(2)',
        'name: varchar',
        'contact: struct(1)',
        'version: integer',
      ]);
      key(item('contact: struct(1)'), 'ArrowRight');
      pick('email: varchar');
      expect(expression()).toBe(`"nested_struct"['owner']['contact']['email']`);
      expect(nameInput().value).toBe('nested_struct_owner_contact_email');
    });

    it('says so when the type could not be read', () => {
      mount().open('broken', anchor);
      expect(items()).toEqual([]);
      expect(error()).toBe('This column has no parts to extract');
      expect(addButton().disabled).toBe(true);
    });
  });

  describe('positions and keys', () => {
    it('asks for an element’s position, 1 at first', () => {
      mount().open('tags', anchor);
      expect(steps()).toEqual([]);
      pick('element: varchar');
      const [position] = steps();
      expect(position!.label).toBe('Position in tags');
      expect(position!.input.type).toBe('number');
      expect(position!.input.min).toBe('1');
      expect(position!.input.value).toBe('1');
      expect(expression()).toBe('"tags"[1]');
      expect(nameInput().value).toBe('tags_1');

      type(position!.input, '3');
      expect(expression()).toBe('"tags"[3]');
      expect(nameInput().value).toBe('tags_3');
    });

    it.each(['0', '', '-2', '1.5'])('refuses the position %j', (value) => {
      mount().open('tags', anchor);
      pick('element: varchar');
      const input = steps()[0]!.input;
      type(input, value);
      expect(error()).toBe('Enter a whole number, 1 or more');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(expression()).toBe('');
      expect(addButton().disabled).toBe(true);
      type(input, '2');
      expect(error()).toBeNull();
      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it('bounds a fixed-size array’s position, and marks the field', () => {
      mount().open('emb', anchor);
      pick('element: float');
      const input = steps()[0]!.input;
      expect(input.max).toBe('3');
      type(input, '4');
      expect(error()).toBe('Position 4 is outside 1–3 of FLOAT[3]');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(addButton().disabled).toBe(true);
    });

    it('asks for each position on the way, named by its list, and keeps them across parts', () => {
      mount().open('people', anchor);
      pick('name: varchar');
      expect(steps().map((s) => s.label)).toEqual(['Position in people']);
      type(steps()[0]!.input, '2');
      expect(expression()).toBe(`"people"[2]['name']`);
      pick('age: integer');
      expect(steps()[0]!.input.value).toBe('2');
      expect(expression()).toBe(`"people"[2]['age']`);

      key(item('langs: [varchar]'), 'ArrowRight');
      pick('element: varchar');
      expect(steps().map((s) => s.label)).toEqual(['Position in people', 'Position in langs']);
      type(steps()[1]!.input, '3');
      expect(expression()).toBe(`"people"[2]['langs'][3]`);
      expect(nameInput().value).toBe('people_2_langs_3');
    });

    it('names a list inside a list after the outer one’s element', () => {
      mount().open('matrix', anchor);
      key(item('element: [smallint]'), 'ArrowRight');
      pick('element: smallint');
      expect(steps().map((s) => s.label)).toEqual([
        'Position in matrix',
        'Position in matrix › element',
      ]);
      expect(expression()).toBe('"matrix"[1][1]');
    });

    it('asks for a map value’s key, and reads it as the key type', () => {
      mount().open('attrs', anchor);
      pick('value: integer');
      const [field] = steps();
      expect(field!.label).toBe('Key in attrs');
      expect(field!.input.type).toBe('text');
      expect(field!.input.value).toBe('');
      expect(field!.input.getAttribute('aria-required')).toBe('true');
      expect(error()).toBe('Enter a key');
      // Empty, not yet wrong: nothing was typed in it.
      expect(field!.input.hasAttribute('aria-invalid')).toBe(false);
      expect(addButton().disabled).toBe(true);

      type(field!.input, "it's");
      expect(expression()).toBe(`map_extract_value("attrs", 'it''s')`);
      expect(nameInput().value).toBe('attrs_it_s');
      expect(addButton().disabled).toBe(false);
    });

    it('marks an empty key invalid once it is typed in, or once Enter is pressed', () => {
      mount().open('attrs', anchor);
      pick('value: integer');
      const input = steps()[0]!.input;
      type(input, 'w');
      type(input, '');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(error()).toBe('Enter a key');

      // A fresh open starts over, and Enter on the empty field marks it.
      panel.close();
      panel.open('attrs', anchor);
      pick('value: integer');
      const fresh = steps()[0]!.input;
      expect(fresh.hasAttribute('aria-invalid')).toBe(false);
      expect(key(fresh, 'Enter').defaultPrevented).toBe(true);
      expect(fresh.getAttribute('aria-invalid')).toBe('true');
      expect(error()).toBe('Enter a key');
      expect(onSubmit).not.toHaveBeenCalled();

      // Picked again, the field keeps what it showed: still empty, still marked.
      pick('size');
      expect(fresh.isConnected).toBe(false);
      pick('value: integer');
      expect(steps()[0]!.input.getAttribute('aria-invalid')).toBe('true');
      type(steps()[0]!.input, 'width');
      expect(steps()[0]!.input.hasAttribute('aria-invalid')).toBe(false);
      expect(expression()).toBe(`map_extract_value("attrs", 'width')`);
    });

    it('reads a whole-number key as a number, and says why another is no key', () => {
      mount().open('int_keys', anchor);
      pick('value: varchar');
      const input = steps()[0]!.input;
      expect(input.getAttribute('inputmode')).toBe('numeric');
      type(input, 'abc');
      expect(error()).toBe('The map\'s keys are INTEGER: "abc" is not a whole number');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      type(input, '007');
      expect(expression()).toBe('map_extract_value("int_keys", 7)');
    });
  });

  describe('JSON and VARIANT', () => {
    it('asks a JSON column for the path at once, with its hint', async () => {
      mount().open('doc', anchor);
      expect(items()).toEqual([]);
      expect(q('.dt-extract-panel__tree').hidden).toBe(true);
      expect(jsonShown()).toBe(true);
      expect(pathInput().labels![0]!.textContent).toBe('JSON path');
      const describedBy = pathInput().getAttribute('aria-describedby')!.split(' ');
      expect(document.getElementById(describedBy[0]!)!.textContent).toBe(
        defaultStrings.values.jsonPathHint,
      );
      expect(describedBy[1]).toBe(errorEl().id);
      await nextFrame();
      expect(document.activeElement).toBe(pathInput());
      // The value itself, as text, until a path is typed.
      expect(expression()).toBe(`json_extract_string("doc", '$')`);
      expect(nameInput().value).toBe('doc_string');
    });

    it('reads keys, indexes and quoted keys', () => {
      mount().open('doc', anchor);
      type(pathInput(), '$.a.b[0]');
      expect(expression()).toBe(`json_extract_string("doc", '$.a.b[0]')`);
      expect(nameInput().value).toBe('doc_a_b_0');
      type(pathInput(), '$["a.b"][0]');
      expect(expression()).toBe(`json_extract_string("doc", '$."a.b"[0]')`);
      type(pathInput(), 'score');
      expect(expression()).toBe(`json_extract_string("doc", '$.score')`);
    });

    it('reads as text, a number, a boolean, JSON, or the array’s length', () => {
      mount().open('doc', anchor);
      expect([...readAs().options].map((o) => [o.value, o.textContent])).toEqual([
        ['string', 'Text'],
        ['number', 'Number'],
        ['boolean', 'Boolean'],
        ['json', 'JSON'],
        ['length', 'Array length'],
      ]);
      expect(readAs().labels![0]!.textContent).toBe('Read as');
      type(pathInput(), '$.score');
      choose(readAs(), 'number');
      expect(expression()).toBe(`TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)`);
      choose(readAs(), 'boolean');
      expect(expression()).toBe(`TRY_CAST(json_extract_string("doc", '$.score') AS BOOLEAN)`);
      choose(readAs(), 'json');
      expect(expression()).toBe(`json_extract("doc", '$.score')`);
      type(pathInput(), '$.tags');
      choose(readAs(), 'length');
      expect(expression()).toBe(`json_array_length("doc", '$.tags')`);
      expect(nameInput().value).toBe('doc_tags_length');
    });

    it('says where a path stops making sense', () => {
      mount().open('doc', anchor);
      type(pathInput(), '$.a.');
      expect(error()).toBe('Not a JSON path: check character 5');
      expect(pathInput().getAttribute('aria-invalid')).toBe('true');
      expect(expression()).toBe('');
      expect(addButton().disabled).toBe(true);
      type(pathInput(), '$[-1]');
      expect(error()).toBe('JSON array indexes start at 0, not -1');
      expect(pathInput().getAttribute('aria-invalid')).toBe('true');
      type(pathInput(), '$[1]');
      expect(error()).toBeNull();
      expect(pathInput().hasAttribute('aria-invalid')).toBe(false);
    });

    it('asks a JSON field of a struct for a path, and only it', () => {
      mount().open('s', anchor);
      expect(labels()).toEqual(['meta: json', 'n: integer']);
      expect(jsonShown()).toBe(true);
      type(pathInput(), '$.k');
      expect(expression()).toBe(`json_extract_string("s"['meta'], '$.k')`);
      expect(nameInput().value).toBe('s_meta_k');
      pick('n: integer');
      expect(jsonShown()).toBe(false);
      expect(expression()).toBe(`"s"['n']`);
    });

    it('reads a VARIANT column, and JSON in a list, by path too', () => {
      mount().open('v', anchor);
      type(pathInput(), '$.a');
      expect(expression()).toBe(`json_extract_string(CAST("v" AS JSON), '$.a')`);

      panel.open('json_list', anchor);
      pick('element: json');
      expect(steps().map((s) => s.label)).toEqual(['Position in json_list']);
      expect(jsonShown()).toBe(true);
      type(pathInput(), '$.a');
      expect(expression()).toBe(`json_extract_string("json_list"[1], '$.a')`);
    });
  });

  describe('the column name', () => {
    it('is the part’s, unique, and follows the part picked', () => {
      state.schema.set([...SCHEMA, nested('POINT_X', 'INTEGER[]')]);
      mount().open('point', anchor);
      expect(nameInput().value).toBe('point_x_2');
      expect(nameInput().placeholder).toBe('point_x_2');
      pick('y: double');
      expect(nameInput().value).toBe('point_y');
      expect(nameInput().labels![0]!.textContent).toBe('Column name');
    });

    it('stops following once typed, and follows again once emptied', async () => {
      mount().open('point', anchor);
      type(nameInput(), 'longitude');
      pick('y: double');
      expect(nameInput().value).toBe('longitude');
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({
        column: 'point',
        path: ['y'],
        extract: 'value',
        name: 'longitude',
      });
      await vi.waitFor(() => expect(isShown()).toBe(false));

      panel.open('point', anchor);
      type(nameInput(), 'longitude');
      type(nameInput(), '');
      // Empty, it stays so; the placeholder is the name used.
      expect(nameInput().value).toBe('');
      expect(nameInput().placeholder).toBe('point_x');
      expect(error()).toBeNull();
      pick('tier: varchar');
      expect(nameInput().value).toBe('point_tier');
    });

    it('refuses a name another column has, in any letter case', () => {
      mount().open('point', anchor);
      type(nameInput(), 'ID');
      expect(error()).toBe('A column named "id" already exists');
      expect(nameInput().getAttribute('aria-invalid')).toBe('true');
      expect(addButton().disabled).toBe(true);
      // The expression still stands: only the name is wrong.
      expect(expression()).toBe(`"point"['x']`);
      type(nameInput(), '__ROWID__');
      expect(error()).toBe('Column name "__ROWID__" is reserved for the synthetic row id');
      type(nameInput(), 'x_coord');
      expect(error()).toBeNull();
    });
  });

  describe('adding', () => {
    it('hands on the request, leaving out the name it made, and closes on success', async () => {
      mount().open('point', anchor);
      await nextFrame();
      addButton().click();
      expect(onSubmit).toHaveBeenCalledWith({ column: 'point', path: ['x'], extract: 'value' });
      await vi.waitFor(() => expect(panel.getIsOpen()).toBe(false));
      expect(isShown()).toBe(false);
      expect(document.activeElement).toBe(anchor);
      expect(anchor.getAttribute('aria-expanded')).toBe('false');
    });

    it('sends how to read JSON with a value, and not with a length', async () => {
      mount().open('doc', anchor);
      type(pathInput(), '$.score');
      choose(readAs(), 'number');
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({
        column: 'doc',
        path: ['score'],
        extract: 'value',
        jsonLeaf: 'number',
      });
      await vi.waitFor(() => expect(panel.getIsOpen()).toBe(false));

      panel.open('doc', anchor);
      type(pathInput(), '$.tags');
      choose(readAs(), 'length');
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({
        column: 'doc',
        path: ['tags'],
        extract: 'length',
      });
    });

    it('sends a length, a size and a tag as such', () => {
      mount().open('people', anchor);
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({ column: 'people', path: [], extract: 'length' });
      panel.open('attrs', anchor);
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({ column: 'attrs', path: [], extract: 'length' });
      panel.open('u', anchor);
      addButton().click();
      expect(onSubmit).toHaveBeenLastCalledWith({ column: 'u', path: [], extract: 'tag' });
    });

    it('says it is adding, adds once, and shows a failure without closing', async () => {
      const pending = deferred<ExtractColumnPanelResult>();
      onSubmit.mockReturnValueOnce(pending.promise);
      mount().open('point', anchor);
      await nextFrame();
      addButton().focus();
      addButton().click();
      expect(addButton().getAttribute('aria-disabled')).toBe('true');
      expect(addButton().textContent).toBe('Adding…');
      // Still focusable, so focus, Escape and the trap stay in the panel.
      expect(addButton().disabled).toBe(false);
      expect(document.activeElement).toBe(addButton());
      addButton().click();
      key(nameInput(), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(1);

      pending.resolve({ success: false, error: 'Column name "point_x" already exists' });
      await vi.waitFor(() =>
        expect(alertEl().textContent).toBe(
          'Could not add the column: Column name "point_x" already exists',
        ),
      );
      expect(panel.getIsOpen()).toBe(true);
      expect(addButton().hasAttribute('aria-disabled')).toBe(false);
      expect(addButton().textContent).toBe('Add column');
      expect(alertEl().closest('.dt-extract-panel__footer')).toBeTruthy();

      // The next change clears it.
      pick('y: double');
      expect(alertEl().textContent).toBe('');
    });

    it('shows a rejection as a failure', async () => {
      onSubmit.mockRejectedValueOnce(new Error('worker gone'));
      mount().open('point', anchor);
      addButton().click();
      await vi.waitFor(() =>
        expect(alertEl().textContent).toBe('Could not add the column: worker gone'),
      );
    });

    it('closed while adding and opened again for that column, says it is adding, and asks nothing new', async () => {
      const first = deferred<ExtractColumnPanelResult>();
      onSubmit.mockReturnValueOnce(first.promise);
      mount().open('point', anchor);
      addButton().click();
      panel.close();
      panel.open('point', anchor);
      expect(addButton().textContent).toBe('Adding…');
      expect(addButton().getAttribute('aria-disabled')).toBe('true');
      addButton().click();
      key(nameInput(), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(1);

      first.resolve({ success: false, error: 'late' });
      await vi.waitFor(() => expect(alertEl().textContent).toBe('Could not add the column: late'));
      expect(addButton().textContent).toBe('Add column');
      addButton().click();
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('drops the outcome once it closes, or opens for another column, or is destroyed', async () => {
      const first = deferred<ExtractColumnPanelResult>();
      onSubmit.mockReturnValueOnce(first.promise);
      mount().open('point', anchor);
      addButton().click();
      panel.close();
      panel.open('tags', anchor);
      // Another column's add goes ahead.
      expect(addButton().textContent).toBe('Add column');
      first.resolve({ success: false, error: 'late' });
      await Promise.resolve();
      await Promise.resolve();
      expect(alertEl().textContent).toBe('');
      expect(panel.getIsOpen()).toBe(true);

      const second = deferred<ExtractColumnPanelResult>();
      onSubmit.mockReturnValueOnce(second.promise);
      addButton().click();
      expect(onSubmit).toHaveBeenCalledTimes(2);
      panel.destroy();
      second.resolve({ success: false, error: 'late' });
      await Promise.resolve();
      expect(el().isConnected).toBe(false);
    });

    it('does nothing while something is wrong', () => {
      mount().open('attrs', anchor);
      pick('value: integer');
      key(steps()[0]!.input, 'Enter');
      addButton().click();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('keyboard and focus', () => {
    it('opens with focus on the tree, which the arrow keys walk', async () => {
      mount().open('point', anchor);
      await nextFrame();
      expect(document.activeElement).toBe(item('x: double'));
      key(document.activeElement!, 'ArrowDown');
      expect(document.activeElement).toBe(item('y: double'));
      expect(expression()).toBe(`"point"['y']`);
      key(document.activeElement!, 'End');
      expect(expression()).toBe(`"point"['tier']`);
    });

    it('adds on Enter in a field or on an end node, and on Ctrl/Cmd+Enter anywhere', async () => {
      mount().open('people', anchor);
      await nextFrame();
      // An expandable node: Enter toggles it.
      key(item('element: struct(3)'), 'Enter');
      expect(item('element: struct(3)').getAttribute('aria-expanded')).toBe('false');
      expect(onSubmit).not.toHaveBeenCalled();

      // Each add closes the panel once it lands.
      const landed = (): Promise<void> => vi.waitFor(() => expect(panel.getIsOpen()).toBe(false));
      key(item('length'), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(1);
      await landed();

      panel.open('point', anchor);
      key(nameInput(), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(2);
      await landed();

      panel.open('doc', anchor);
      key(pathInput(), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(3);
      await landed();

      panel.open('doc', anchor);
      key(readAs(), 'Enter');
      expect(onSubmit).toHaveBeenCalledTimes(3);
      key(readAs(), 'Enter', { ctrlKey: true });
      expect(onSubmit).toHaveBeenCalledTimes(4);
      await landed();

      panel.open('point', anchor);
      key(q('.dt-extract-panel__button'), 'Enter', { metaKey: true });
      expect(onSubmit).toHaveBeenCalledTimes(5);
      await landed();
      // Shift and Alt are left alone.
      panel.open('point', anchor);
      key(nameInput(), 'Enter', { shiftKey: true });
      key(nameInput(), 'Enter', { altKey: true });
      expect(onSubmit).toHaveBeenCalledTimes(5);
    });

    it('closes on Escape, Cancel and ×, giving focus back to its button', async () => {
      mount().open('point', anchor);
      await nextFrame();
      expect(anchor.getAttribute('aria-expanded')).toBe('true');
      key(document.activeElement!, 'Escape');
      expect(panel.getIsOpen()).toBe(false);
      expect(document.activeElement).toBe(anchor);
      expect(anchor.getAttribute('aria-expanded')).toBe('false');

      panel.open('point', anchor);
      await nextFrame();
      key(nameInput(), 'Escape');
      expect(panel.getIsOpen()).toBe(false);

      panel.open('point', anchor);
      [...el().querySelectorAll<HTMLButtonElement>('.dt-extract-panel__button')]
        .find((b) => b.textContent === 'Cancel')!
        .click();
      expect(panel.getIsOpen()).toBe(false);

      panel.open('point', anchor);
      q<HTMLButtonElement>('.dt-extract-panel__close').click();
      expect(panel.getIsOpen()).toBe(false);
      expect(document.activeElement).toBe(anchor);
    });

    it('toggles on its column, starts over on another, and says which it is open for', () => {
      mount();
      panel.toggle('point', anchor);
      expect(panel.getCurrentColumn()).toBe('point');
      expect(onOpenChange).toHaveBeenLastCalledWith('point');
      type(nameInput(), 'mine');

      const other = document.createElement('button');
      other.className = 'dt-col-extract-btn';
      root.appendChild(other);
      panel.toggle('tags', other);
      expect(panel.getCurrentColumn()).toBe('tags');
      expect(onOpenChange.mock.calls).toEqual([['point'], [null], ['tags']]);
      expect(anchor.getAttribute('aria-expanded')).toBe('false');
      expect(other.getAttribute('aria-expanded')).toBe('true');
      expect(nameInput().value).toBe('tags_length');

      panel.toggle('tags', other);
      expect(panel.getIsOpen()).toBe(false);
      expect(onOpenChange).toHaveBeenLastCalledWith(null);
      expect(panel.getCurrentColumn()).toBeNull();
    });

    it('is a dialog named by its title, with a Tab stop for each control', () => {
      mount().open('people', anchor);
      expect(el().getAttribute('role')).toBe('dialog');
      expect(document.getElementById(el().getAttribute('aria-labelledby')!)!.textContent).toBe(
        'Extract from people',
      );
      expect(q('.dt-extract-panel__type').textContent).toBe('[struct(3)]');
      expect(q('.dt-extract-panel__type').title).toBe(
        'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
      );
      expect(q('.dt-extract-panel__close').getAttribute('aria-label')).toBe('Close extract panel');
      // One tree item is in the tab order: the active one.
      expect(el().querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    });
  });

  it('opens in the configured language', () => {
    const messages = mergeStrings(defaultStrings, {
      common: { cancel: 'Annuler' },
      values: {
        extractTitle: (column: string) => `Extraire de ${column}`,
        positionLabel: (container: string) => `Position dans ${container}`,
        elementNode: 'élément',
        lengthNode: 'longueur',
        columnNameLabel: 'Nom de colonne',
        addColumn: 'Ajouter',
      },
    });
    mount({ messages }).open('tags', anchor);
    expect(q('.dt-extract-panel__title').textContent).toBe('Extraire de tags');
    expect(labels()).toEqual(['longueur', 'élément: varchar']);
    pick('élément: varchar');
    expect(steps()[0]!.label).toBe('Position dans tags');
    expect(nameInput().labels![0]!.textContent).toBe('Nom de colonne');
    expect(addButton().textContent).toBe('Ajouter');
    expect(
      [...el().querySelectorAll('.dt-extract-panel__button')].map((b) => b.textContent),
    ).toEqual(['Annuler', 'Ajouter']);
  });

  it('is removed from the DOM on destroy, and opens no more', () => {
    mount().open('point', anchor);
    panel.destroy();
    expect(el().isConnected).toBe(false);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    panel.open('point', anchor);
    expect(panel.getIsOpen()).toBe(false);
  });
});

describe('ExtractColumnPanel — its ids and the name rule', () => {
  it('mints its ids from the table instance id it is given', () => {
    mount({ instanceId: 't7-ab12' }).open('point', anchor);
    expect(el().getAttribute('aria-labelledby')).toBe('dt-t7-ab12-extract-panel-title');
    expect(nameInput().id).toBe('dt-t7-ab12-extract-panel-name');
    expect(errorEl().id).toBe('dt-t7-ab12-extract-panel-error');
  });

  it('mints ids that two copies of the module on one page do not share', async () => {
    vi.resetModules();
    const one = await import('@/table/ExtractColumnPanel');
    vi.resetModules();
    const two = await import('@/table/ExtractColumnPanel');
    expect(two.ExtractColumnPanel).not.toBe(one.ExtractColumnPanel);
    const a = new one.ExtractColumnPanel(state, { onSubmit });
    const b = new two.ExtractColumnPanel(state, { onSubmit });
    expect(a.getElement().getAttribute('aria-labelledby')).not.toBe(
      b.getElement().getAttribute('aria-labelledby'),
    );
    a.destroy();
    b.destroy();
  });

  it('takes a name by the rule a new column is checked by', () => {
    expect(takenColumnName('__RowId__', ['id'])).toBe('__rowid__');
    expect(takenColumnName('point_x', ['id', 'point_x'])).toBe('point_x');
    expect(takenColumnName('POINT_X', ['id', 'point_x'])).toBe('point_x');
    expect(takenColumnName('x_coord', ['id', 'point_x'])).toBeUndefined();
    // The row id's name is taken where the schema does not list it, too.
    state.schema.set(SCHEMA.filter((c) => c.name !== '__rowid__'));
    mount().open('point', anchor);
    type(nameInput(), '__RowId__');
    expect(error()).toBe('Column name "__RowId__" is reserved for the synthetic row id');
    expect(addButton().disabled).toBe(true);
  });
});
