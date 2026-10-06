/**
 * The value inspector's tree model: how one nested value becomes nodes —
 * keys, types, values, counts, previews, buckets, paths and ids — for every
 * kind of DuckDB type and for JSON, and how it copes with values that are
 * huge, deep, odd or cut short.
 */
import { describe, expect, it } from 'vitest';

import { parseDuckDBType } from '@/core/duckdbType';
import { parseJsonTree, prettyJson } from '@/core/jsonTree';
import {
  VALUE_TREE_BUCKET_SIZE,
  VALUE_TREE_EXPANDED_ROWS,
  VALUE_TREE_PREVIEW_CHARS,
  VALUE_TREE_STRING_CAP,
  buildValueTree,
  defaultExpansion,
  formatFloat32,
  nodeJsonText,
  type ValueTreeMessages,
  type ValueTreeNode,
  type ValueTreeOptions,
} from '@/nested/valueTreeModel';

const en = (n: number) => n.toLocaleString('en-US');

const messages: ValueTreeMessages = {
  itemCount: (n) => `${en(n)} ${n === 1 ? 'item' : 'items'}`,
  entryCount: (n) => `${en(n)} ${n === 1 ? 'entry' : 'entries'}`,
  fieldCount: (n) => `${en(n)} ${n === 1 ? 'field' : 'fields'}`,
  keyCount: (n) => `${en(n)} ${n === 1 ? 'key' : 'keys'}`,
  bucketLabel: (first, last) => `[${first} … ${last}]`,
  moreCharacters: (n) => `${en(n)} more ${n === 1 ? 'character' : 'characters'}`,
};

/** The tree of `json` text read as DuckDB type `type` (none: the JSON alone). */
function tree(json: string, type?: string, options?: ValueTreeOptions): ValueTreeNode {
  const typeNode = type === undefined ? undefined : parseDuckDBType(type);
  return buildValueTree(parseJsonTree(json).root, typeNode, messages, options);
}

/** A node's children; none for a leaf. */
function kids(node: ValueTreeNode): readonly ValueTreeNode[] {
  return node.children?.() ?? [];
}

/** A node's children through its buckets, in order. */
function items(node: ValueTreeNode): ValueTreeNode[] {
  const out: ValueTreeNode[] = [];
  const stack = [...kids(node)].reverse();
  for (let next = stack.pop(); next; next = stack.pop()) {
    if (next.bucket) stack.push(...[...kids(next)].reverse());
    else out.push(next);
  }
  return out;
}

/** Every node, depth first, with everything expanded. */
function allNodes(root: ValueTreeNode): ValueTreeNode[] {
  const out: ValueTreeNode[] = [];
  const stack = [root];
  for (let next = stack.pop(); next; next = stack.pop()) {
    out.push(next);
    stack.push(...[...kids(next)].reverse());
  }
  return out;
}

/** The child under key text `key`. */
function child(node: ValueTreeNode, key: string): ValueTreeNode {
  const found = items(node).find((c) => c.key?.text === key);
  if (!found) throw new Error(`no child ${key} under ${node.label}`);
  return found;
}

/** What a row shows, in short: key, type, value or count and preview. */
function summary(node: ValueTreeNode) {
  return {
    key: node.key?.text,
    type: node.typeLabel,
    ...(node.value ? { value: node.value.text, style: node.value.style } : {}),
    ...(node.count !== undefined ? { count: node.count } : {}),
    ...(node.preview !== undefined ? { preview: node.preview } : {}),
  };
}

/** The invariants every tree keeps, checked over every node. */
function expectWellFormed(root: ValueTreeNode): ValueTreeNode[] {
  const nodes = allNodes(root);
  const ids = new Set<string>();
  for (const node of nodes) {
    expect(ids.has(node.id), `duplicate id ${node.id}`).toBe(false);
    ids.add(node.id);
    if (node.key) expect(node.label.startsWith(node.key.text), node.label).toBe(true);
    // Exactly one of: a leaf's value, a container's preview, a bucket.
    expect([node.value, node.preview, node.bucket].filter((x) => x !== undefined)).toHaveLength(1);
    if (node.preview !== undefined) {
      expect(node.preview.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
    }
    if (node.bucket) {
      expect(node.path).toBeNull();
      expect(node.key?.kind).toBe('bucket');
      expect(node.label).toBe(node.key!.text);
      expect(node.count).toBe(node.bucket.end - node.bucket.start);
      expect(items(node)).toHaveLength(node.count!);
    }
    if (node.children) {
      const children = node.children();
      expect(node.children()).toBe(children);
      expect(children.length).toBeGreaterThan(0);
      expect(children.length).toBeLessThanOrEqual(VALUE_TREE_BUCKET_SIZE);
      if (node.count !== undefined && !node.bucket) expect(items(node)).toHaveLength(node.count);
    } else {
      expect(node.count ?? 0).toBe(0);
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------

describe('lists and arrays', () => {
  it('shows a list with its type, count, preview and 1-based positions', () => {
    const root = tree('[56,3,91]', 'INTEGER[]', { rootKey: 'scores' });
    expect(summary(root)).toEqual({
      key: 'scores',
      type: '[integer]',
      count: 3,
      preview: '[56, 3, 91]',
    });
    expect(root.key).toEqual({ text: 'scores', kind: 'column' });
    expect(root.countText).toBe('3 items');
    expect(root.label).toBe('scores: [integer], 3 items');
    expect(root.path).toEqual([]);
    expect(root.id).toBe('$');
    expect(kids(root).map(summary)).toEqual([
      { key: '1', type: 'integer', value: '56', style: 'number' },
      { key: '2', type: 'integer', value: '3', style: 'number' },
      { key: '3', type: 'integer', value: '91', style: 'number' },
    ]);
    expect(kids(root).map((c) => c.key?.kind)).toEqual(['position', 'position', 'position']);
    expect(kids(root).map((c) => c.path)).toEqual([[1], [2], [3]]);
    expect(kids(root).map((c) => c.label)).toEqual(['1: 56', '2: 3', '3: 91']);
    expect(kids(root).map((c) => c.id)).toEqual(['$/0', '$/1', '$/2']);
  });

  it('shows a fixed-size array the same way', () => {
    const root = tree('[1,2,null]', 'INTEGER[3]');
    expect(summary(root)).toEqual({
      key: undefined,
      type: 'integer[3]',
      count: 3,
      preview: '[1, 2, null]',
    });
    expect(root.label).toBe('integer[3], 3 items');
    expect(summary(kids(root)[2]!)).toEqual({
      key: '3',
      type: 'integer',
      value: 'null',
      style: 'null',
    });
  });

  it('nests lists, and shows empty and NULL inner lists as leaves of their type', () => {
    const root = tree('[[1,2],[],null,[4,null,17]]', 'SMALLINT[][]');
    expect(root.preview).toBe('[[1, 2], [], null, [4, null, 17]]');
    const [first, empty, nil, withNull] = kids(root);
    expect(summary(first!)).toEqual({ key: '1', type: '[smallint]', count: 2, preview: '[1, 2]' });
    expect(first!.label).toBe('1: [smallint], 2 items');
    expect(kids(first!).map((c) => c.path)).toEqual([
      [1, 1],
      [1, 2],
    ]);
    expect(summary(empty!)).toEqual({ key: '2', type: '[smallint]', count: 0, preview: '[]' });
    expect(empty!.children).toBeUndefined();
    expect(empty!.label).toBe('2: [smallint], 0 items');
    expect(summary(nil!)).toEqual({ key: '3', type: '[smallint]', value: 'null', style: 'null' });
    expect(nil!.children).toBeUndefined();
    expect(kids(withNull!).map((c) => c.value?.style)).toEqual(['number', 'null', 'number']);
  });

  it('shows an empty or NULL root without children', () => {
    expect(summary(tree('[]', 'VARCHAR[]', { rootKey: 'tags' }))).toEqual({
      key: 'tags',
      type: '[varchar]',
      count: 0,
      preview: '[]',
    });
    const nil = tree('null', 'VARCHAR[]', { rootKey: 'tags' });
    expect(summary(nil)).toEqual({ key: 'tags', type: '[varchar]', value: 'null', style: 'null' });
    expect(nil.label).toBe('tags: null');
    expect(nil.children).toBeUndefined();
  });

  it('cuts a long preview at an item, within 60 characters', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i + 1);
    const root = tree(JSON.stringify(values), 'INTEGER[]');
    expect(root.preview).toBe('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, …]');
    expect(root.preview!.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
    expect(root.countText).toBe('1,000 items');
  });
});

describe('structs', () => {
  const POINT = 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)';

  it('keys fields by name, with their types, values and paths', () => {
    const root = tree('{"x":1.25,"y":0.58,"tier":"bronze"}', POINT, { rootKey: 'point' });
    expect(summary(root)).toEqual({
      key: 'point',
      type: 'struct(3)',
      count: 3,
      preview: '{x: 1.25, y: 0.58, tier: "bronze"}',
    });
    expect(root.label).toBe('point: struct(3), 3 fields');
    expect(kids(root).map(summary)).toEqual([
      { key: 'x', type: 'double', value: '1.25', style: 'number' },
      { key: 'y', type: 'double', value: '0.58', style: 'number' },
      { key: 'tier', type: 'varchar', value: '"bronze"', style: 'string' },
    ]);
    expect(kids(root).map((c) => c.key?.kind)).toEqual(['field', 'field', 'field']);
    expect(kids(root).map((c) => c.path)).toEqual([['x'], ['y'], ['tier']]);
    expect(kids(root).map((c) => c.label)).toEqual(['x: 1.25', 'y: 0.58', 'tier: "bronze"']);
  });

  it('shows a struct of NULL fields, and a NULL struct', () => {
    expect(tree('{"x":null,"y":null,"tier":null}', POINT).preview).toBe(
      '{x: null, y: null, tier: null}',
    );
    expect(summary(tree('null', POINT))).toEqual({
      key: undefined,
      type: 'struct(3)',
      value: 'null',
      style: 'null',
    });
  });

  it('keys unnamed fields by 1-based position, matched by position to the "" keys', () => {
    const root = tree('{"":1,"":"a"}', 'STRUCT(INTEGER, VARCHAR)');
    expect(summary(root)).toEqual({
      key: undefined,
      type: 'struct(2)',
      count: 2,
      preview: '(1, "a")',
    });
    expect(kids(root).map(summary)).toEqual([
      { key: '1', type: 'integer', value: '1', style: 'number' },
      { key: '2', type: 'varchar', value: '"a"', style: 'string' },
    ]);
    expect(kids(root).map((c) => [c.key?.kind, c.path, c.id])).toEqual([
      ['position', [1], '$/0'],
      ['position', [2], '$/1'],
    ]);
  });

  it('keys a field named "" as "", and gives it the path [""]', () => {
    // The JSON {"b": 2, "": 1} loads as STRUCT(b BIGINT,  BIGINT).
    const root = tree('{"b":2,"":1}', 'STRUCT(b BIGINT,  BIGINT)');
    expect(root.preview).toBe('{b: 2, "": 1}');
    expect(kids(root).map((c) => [c.key, c.label, c.path])).toEqual([
      [{ text: 'b', kind: 'field' }, 'b: 2', ['b']],
      [{ text: '""', kind: 'field' }, '"": 1', ['']],
    ]);
  });

  it('matches fields by position whatever the JSON keys say', () => {
    // Through VARIANT, unnamed fields are keyed "1", "2"; key_order's JSON is {"2":…,"1":…}.
    const root = tree('[{"1":1,"2":"x"}]', 'STRUCT(VARIANT, VARCHAR)[]');
    const struct = kids(root)[0]!;
    expect(kids(struct).map((c) => [c.key?.text, c.typeLabel, c.path])).toEqual([
      ['1', 'variant', [1, 1]],
      ['2', 'varchar', [1, 2]],
    ]);
    const swapped = tree('{"2":20,"1":10}', 'STRUCT("2" BIGINT, "1" BIGINT)');
    expect(kids(swapped).map((c) => [c.key?.text, c.value?.text, c.path])).toEqual([
      ['2', '20', ['2']],
      ['1', '10', ['1']],
    ]);
  });

  it('keeps odd field names as they are in paths, and escapes them for display', () => {
    const type =
      'STRUCT("my field" INTEGER, "x,y" INTEGER, "quote""d" INTEGER, "it\'s" INTEGER, ' +
      'toJSON INTEGER, __proto__ INTEGER, "a\nb" INTEGER, "ünï" INTEGER)';
    const json =
      '{"my field":1,"x,y":2,"quote\\"d":3,"it\'s":4,"toJSON":5,"__proto__":6,"a\\nb":7,"ünï":8}';
    const root = tree(json, type);
    expect(kids(root).map((c) => c.key?.text)).toEqual([
      'my field',
      'x,y',
      'quote"d',
      "it's",
      'toJSON',
      '__proto__',
      'a\\nb',
      'ünï',
    ]);
    expect(kids(root).map((c) => c.path![0])).toEqual([
      'my field',
      'x,y',
      'quote"d',
      "it's",
      'toJSON',
      '__proto__',
      'a\nb',
      'ünï',
    ]);
    expect(root.preview).toBe('{my field: 1, x,y: 2, quote"d: 3, it\'s: 4, toJSON: 5, …}');
  });

  it('shows JSON entries beyond the type by their own key, without a path', () => {
    const root = tree('{"a":1,"b":[2]}', 'STRUCT(a INTEGER)');
    const [a, extra] = kids(root);
    expect(a!.path).toEqual(['a']);
    expect(summary(extra!)).toEqual({ key: 'b', type: 'array', count: 1, preview: '[2]' });
    expect(extra!.key?.kind).toBe('jsonKey');
    expect(extra!.path).toBeNull();
    expect(kids(extra!)[0]!.path).toBeNull();
  });

  it('reaches fields through lists and structs: people[2].langs[1], owner.contact.email', () => {
    const people = tree(
      '[{"name":"Ann","age":30,"langs":["en","fr"]},{"name":"Bo","age":null,"langs":["de"]}]',
      'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
      { rootKey: 'people' },
    );
    expect(people.typeLabel).toBe('[struct(3)]');
    // The second struct has 13 characters left: not enough for its first field.
    expect(people.preview).toBe('[{name: "Ann", age: 30, langs: ["en", "fr"]}, {…}]');
    const bo = kids(people)[1]!;
    expect(bo.label).toBe('2: struct(3), 3 fields');
    const de = kids(child(bo, 'langs'))[0]!;
    expect(de.path).toEqual([2, 'langs', 1]);
    expect(de.label).toBe('1: "de"');

    const nested = tree(
      '{"owner":{"name":"Cy","contact":{"email":"cy@example.com","phones":[],"address":null}},"version":2}',
      'STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR, phones VARCHAR[], ' +
        'address STRUCT(city VARCHAR, zip VARCHAR))), "version" INTEGER)',
    );
    const email = child(child(child(nested, 'owner'), 'contact'), 'email');
    expect(email.path).toEqual(['owner', 'contact', 'email']);
    expect(email.value).toEqual({ text: '"cy@example.com"', style: 'string' });
    expect(child(child(child(nested, 'owner'), 'contact'), 'address').typeLabel).toBe('struct(2)');
  });
});

describe('maps', () => {
  it('keys entries by the key text, shows the value, and paths by the key', () => {
    const root = tree('{"k1":1,"k2":2}', 'MAP(VARCHAR, INTEGER)', { rootKey: 'attrs' });
    expect(summary(root)).toEqual({
      key: 'attrs',
      type: '{varchar → integer}',
      count: 2,
      preview: '{k1 → 1, k2 → 2}',
    });
    expect(root.label).toBe('attrs: {varchar → integer}, 2 entries');
    expect(kids(root).map(summary)).toEqual([
      { key: 'k1', type: 'integer', value: '1', style: 'number' },
      { key: 'k2', type: 'integer', value: '2', style: 'number' },
    ]);
    expect(kids(root).map((c) => [c.key?.kind, c.path, c.json])).toEqual([
      ['mapKey', ['k1'], { kind: 'number', raw: '1' }],
      ['mapKey', ['k2'], { kind: 'number', raw: '2' }],
    ]);
  });

  it('keeps key order, and paths whole-number keys as numbers while exact', () => {
    const root = tree('{"2":"a","1":"b","10":"c"}', 'MAP(INTEGER, VARCHAR)');
    expect(kids(root).map((c) => [c.key?.text, c.path])).toEqual([
      ['2', [2]],
      ['1', [1]],
      ['10', [10]],
    ]);
    const big = tree('{"9007199254740993":"x","-5":"y"}', 'MAP(BIGINT, VARCHAR)');
    expect(kids(big).map((c) => c.path)).toEqual([['9007199254740993'], [-5]]);
  });

  it('paths keys of other types by their text: dates, struct and list keys', () => {
    const dates = tree('{"2024-01-31":[1,2],"2023-01-01":[]}', 'MAP(DATE, INTEGER[])');
    expect(kids(dates).map(summary)).toEqual([
      { key: '2024-01-31', type: '[integer]', count: 2, preview: '[1, 2]' },
      { key: '2023-01-01', type: '[integer]', count: 0, preview: '[]' },
    ]);
    expect(kids(dates).map((c) => c.path)).toEqual([['2024-01-31'], ['2023-01-01']]);
    expect(items(kids(dates)[0]!).map((c) => c.path)).toEqual([
      ['2024-01-31', 1],
      ['2024-01-31', 2],
    ]);

    const structKeys = tree(`{"{'k': 1}":"a1","{'k': 2}":"b1"}`, 'MAP(STRUCT(k INTEGER), VARCHAR)');
    expect(kids(structKeys).map((c) => [c.key?.text, c.path])).toEqual([
      ["{'k': 1}", ["{'k': 1}"]],
      ["{'k': 2}", ["{'k': 2}"]],
    ]);
    const listKeys = tree('{"[1]":1,"[1, 0]":2}', 'MAP(INTEGER[], BIGINT)');
    expect(listKeys.preview).toBe('{[1] → 1, [1, 0] → 2}');
  });

  it('reads a map that went through VARIANT as a list of key/value entries', () => {
    const type = 'STRUCT(m MAP(INTEGER, VARCHAR), d MAP(DATE, INTEGER), v VARIANT)';
    const root = tree(
      '{"m":[{"key":2,"value":"a"},{"key":1,"value":"b"}],"d":[{"key":"2024-01-31","value":1}],"v":1}',
      type,
    );
    const m = child(root, 'm');
    expect(summary(m)).toEqual({
      key: 'm',
      type: '{integer → varchar}',
      count: 2,
      preview: '{2 → "a", 1 → "b"}',
    });
    expect(m.countText).toBe('2 entries');
    expect(kids(m).map((c) => [c.key?.text, c.key?.kind, c.path, c.value?.text])).toEqual([
      ['2', 'mapKey', ['m', 2], '"a"'],
      ['1', 'mapKey', ['m', 1], '"b"'],
    ]);
    expect(kids(child(root, 'd')).map((c) => c.path)).toEqual([['d', '2024-01-31']]);
  });

  it('shows struct keys read through VARIANT as their JSON, and float keys at float32 precision', () => {
    const root = tree(
      '{"m":[{"key":{"k":1},"value":"a"}],"f":[{"key":0.10000000149011612,"value":1}],"v":null}',
      'STRUCT(m MAP(STRUCT(k INTEGER), VARCHAR), f MAP(FLOAT, INTEGER), v VARIANT)',
    );
    expect(kids(child(root, 'm')).map((c) => [c.key?.text, c.path])).toEqual([
      ['{"k":1}', ['m', '{"k":1}']],
    ]);
    expect(kids(child(root, 'f')).map((c) => [c.key?.text, c.path])).toEqual([
      ['0.1', ['f', '0.10000000149011612']],
    ]);
    expect(child(root, 'f').preview).toBe('{0.1 → 1}');
  });

  it('shows an item that is not an entry by position, without a path', () => {
    // A value cut short: the second entry lost its value.
    const { root: json, truncated } = parseJsonTree('{"m":[{"key":"a","value":1},{"key":"b"');
    expect(truncated).toBe(true);
    const root = buildValueTree(
      json,
      parseDuckDBType('STRUCT(m MAP(VARCHAR, INTEGER), v VARIANT)'),
      messages,
    );
    const [a, cut] = kids(child(root, 'm'));
    expect([a!.key, a!.path]).toEqual([{ text: 'a', kind: 'mapKey' }, ['m', 'a']]);
    expect([cut!.key, cut!.path, cut!.typeLabel]).toEqual([
      { text: '2', kind: 'position' },
      null,
      'object',
    ]);
  });
});

describe('unions', () => {
  const PAIR = 'UNION(i INTEGER, s VARCHAR)';

  it('shows the member it holds under its tag', () => {
    const root = tree('{"i":0}', PAIR, { rootKey: 'u' });
    expect(summary(root)).toEqual({ key: 'u', type: 'union(2)', preview: '{i: 0}' });
    expect(root.count).toBeUndefined();
    expect(root.countText).toBeUndefined();
    expect(root.label).toBe('u: union(2), {i: 0}');
    expect(kids(root).map(summary)).toEqual([
      { key: 'i', type: 'integer', value: '0', style: 'number' },
    ]);
    expect(kids(root)[0]!.key?.kind).toBe('tag');
    expect(kids(root)[0]!.path).toEqual(['i']);

    const text = tree('{"s":"0"}', PAIR);
    expect(text.preview).toBe('{s: "0"}');
    expect(kids(text).map(summary)).toEqual([
      { key: 's', type: 'varchar', value: '"0"', style: 'string' },
    ]);
  });

  it('reaches inside a member: lists and structs', () => {
    const type = 'UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR))';
    const list = tree('{"l":[1,null]}', type);
    expect(list.preview).toBe('{l: [1, null]}');
    expect(items(kids(list)[0]!).map((c) => c.path)).toEqual([
      ['l', 1],
      ['l', 2],
    ]);
    const struct = tree('{"st":{"a":3,"b":"x3"}}', type);
    expect(kids(kids(struct)[0]!).map((c) => [c.path, c.typeLabel])).toEqual([
      [['st', 'a'], 'integer'],
      [['st', 'b'], 'varchar'],
    ]);
  });

  it('matches the tag in any case, keeping the type’s spelling', () => {
    const root = tree('{"my tag":7}', 'UNION("My Tag" INTEGER, other VARCHAR)');
    expect(kids(root).map((c) => [c.key?.text, c.path])).toEqual([['My Tag', ['My Tag']]]);
  });

  it('shows a union read through VARIANT as its bare value, typed by the JSON', () => {
    const type =
      'STRUCT(u UNION(i INTEGER, s VARCHAR), w UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR)), v VARIANT)';
    const root = tree('{"u":42,"w":{"a":1,"b":"x"},"v":1}', type);
    const u = child(root, 'u');
    expect(summary(u)).toEqual({ key: 'u', type: 'number', value: '42', style: 'number' });
    expect(u.type).toBeUndefined();
    expect(u.path).toEqual(['u']);
    // Even a single-key object that names a tag is the bare value: the tag is lost.
    const w = child(root, 'w');
    expect(summary(w)).toEqual({ key: 'w', type: 'object', count: 2, preview: '{a: 1, b: "x"}' });
    expect(w.path).toEqual(['w']);
    expect(kids(w).map((c) => [c.key?.kind, c.path, c.typeLabel])).toEqual([
      ['jsonKey', null, 'number'],
      ['jsonKey', null, 'string'],
    ]);
    const tagLike = tree(
      '{"u":{"i":1},"v":null}',
      'STRUCT(u UNION(i STRUCT(i INTEGER)), v VARIANT)',
    );
    expect(child(tagLike, 'u').typeLabel).toBe('object');
  });

  it('reads JSON that names no member from the JSON alone', () => {
    const root = tree('{"zzz":1}', PAIR);
    expect(summary(root)).toEqual({
      key: undefined,
      type: 'object',
      count: 1,
      preview: '{zzz: 1}',
    });
    expect(root.type).toBeUndefined();
    expect(kids(root)[0]!.path).toBeNull();
  });
});

describe('JSON and VARIANT values', () => {
  it('types a JSON document by JSON kind below its root, with JSON keys and 0-based indexes', () => {
    const root = tree('{"k":"v","score":1.5,"a.b":[1,{"c":null}],"":true}', 'JSON', {
      rootKey: 'doc',
    });
    expect(summary(root)).toEqual({
      key: 'doc',
      type: 'json',
      count: 4,
      preview: '{k: "v", score: 1.5, a.b: [1, {c: null}], "": true}',
    });
    expect(root.label).toBe('doc: json, 4 keys');
    expect(kids(root).map((c) => [c.key, c.typeLabel, c.path])).toEqual([
      [{ text: 'k', kind: 'jsonKey' }, 'string', ['k']],
      [{ text: 'score', kind: 'jsonKey' }, 'number', ['score']],
      [{ text: 'a.b', kind: 'jsonKey' }, 'array', ['a.b']],
      [{ text: '""', kind: 'jsonKey' }, 'boolean', ['']],
    ]);
    const ab = child(root, 'a.b');
    expect(ab.countText).toBe('2 items');
    expect(kids(ab).map((c) => [c.key, c.path])).toEqual([
      [{ text: '0', kind: 'jsonIndex' }, ['a.b', 0]],
      [{ text: '1', kind: 'jsonIndex' }, ['a.b', 1]],
    ]);
    const c = kids(kids(ab)[1]!)[0]!;
    expect([c.path, c.typeLabel, c.value]).toEqual([
      ['a.b', 1, 'c'],
      'null',
      { text: 'null', style: 'null' },
    ]);
    expect(kids(root).every((n) => n.type === undefined)).toBe(true);
  });

  it('keeps duplicate keys apart', () => {
    const root = tree('{"a":1,"a":2}', 'JSON');
    expect(kids(root).map((c) => [c.id, c.key?.text, c.path, c.value?.text])).toEqual([
      ['$/0', 'a', ['a'], '1'],
      ['$/1', 'a', ['a'], '2'],
    ]);
  });

  it('shows JSON scalars, including what DuckDB’s JSON type accepts', () => {
    expect(summary(tree('42', 'JSON'))).toEqual({
      key: undefined,
      type: 'json',
      value: '42',
      style: 'number',
    });
    expect(summary(tree('"text"', 'JSON'))).toEqual({
      key: undefined,
      type: 'json',
      value: '"text"',
      style: 'string',
    });
    expect(summary(tree('null', 'JSON'))).toEqual({
      key: undefined,
      type: 'json',
      value: 'null',
      style: 'null',
    });
    expect(tree('[nan, -inf, INF]', 'JSON').preview).toBe('[NaN, -Infinity, Infinity]');
    expect(tree('[1.50, 1e300, -0.0]', 'JSON').preview).toBe('[1.50, 1e300, -0.0]');
  });

  it('starts JSON steps after a JSON element of a list, a struct field or a map value', () => {
    const list = tree('[{"a":[1,2]},null,42]', 'JSON[]');
    expect(list.typeLabel).toBe('[json]');
    const first = kids(list)[0]!;
    expect([first.typeLabel, first.path]).toEqual(['json', [1]]);
    const a = kids(first)[0]!;
    expect([a.typeLabel, a.path]).toEqual(['array', [1, 'a']]);
    expect(kids(a).map((c) => c.path)).toEqual([
      [1, 'a', 0],
      [1, 'a', 1],
    ]);

    const field = tree(
      '{"k":"x","my field":{"deep":[true]}}',
      'STRUCT(k VARCHAR, "my field" JSON)',
    );
    expect(kids(kids(child(field, 'my field'))[0]!)[0]!.path).toEqual(['my field', 'deep', 0]);

    const map = tree('{"x":{"y":1}}', 'MAP(VARCHAR, JSON)');
    expect(kids(kids(map)[0]!)[0]!.path).toEqual(['x', 'y']);
  });

  it('types a VARIANT by JSON kind below it, at the root and inside other types', () => {
    const root = tree('{"k":1,"s":"v","l":[3,null]}', 'VARIANT');
    expect(root.typeLabel).toBe('variant');
    expect(kids(root).map((c) => [c.typeLabel, c.path])).toEqual([
      ['number', ['k']],
      ['string', ['s']],
      ['array', ['l']],
    ]);
    expect(kids(kids(root)[2]!).map((c) => c.path)).toEqual([
      ['l', 0],
      ['l', 1],
    ]);

    const list = tree('[42,"x",null]', 'VARIANT[]');
    expect(kids(list).map(summary)).toEqual([
      { key: '1', type: 'variant', value: '42', style: 'number' },
      { key: '2', type: 'variant', value: '"x"', style: 'string' },
      { key: '3', type: 'variant', value: 'null', style: 'null' },
    ]);
    const struct = tree('{"k":1.25}', 'STRUCT(k VARIANT)');
    expect([kids(struct)[0]!.typeLabel, kids(struct)[0]!.path]).toEqual(['variant', ['k']]);
  });

  it('gives nothing below the root a path when there is no type', () => {
    const root = tree('{"a":[1]}');
    expect(root.typeLabel).toBe('object');
    expect(root.path).toEqual([]);
    expect(kids(root)[0]!.path).toBeNull();
    expect(kids(kids(root)[0]!)[0]!.path).toBeNull();
  });

  it('reads a type the parser could not read from the JSON, without paths below it', () => {
    const root = tree('{"a":1}', 'NOT A TYPE((');
    expect(root.type?.kind).toBe('unknown');
    expect(kids(root)[0]!.path).toBeNull();
  });
});

describe('typed leaves', () => {
  it('shows numbers exactly as written: DECIMAL zeros, HUGEINT and UBIGINT digits', () => {
    const root = tree(
      '{"d":1.50,"d4":1.5000,"h":170141183460469231731687303715884105727,"u":18446744073709551615,"n":-9223372036854775808}',
      'STRUCT(d DECIMAL(10,2), d4 DECIMAL(18,4), h HUGEINT, u UBIGINT, n BIGINT)',
    );
    expect(kids(root).map((c) => [c.typeLabel, c.value?.text, c.value?.style])).toEqual([
      ['decimal(10,2)', '1.50', 'number'],
      ['decimal(18,4)', '1.5000', 'number'],
      ['hugeint', '170141183460469231731687303715884105727', 'number'],
      ['ubigint', '18446744073709551615', 'number'],
      ['bigint', '-9223372036854775808', 'number'],
    ]);
  });

  it('shows FLOAT at float32 precision, as DuckDB writes it', () => {
    const root = tree(
      '[1.0,0.10000000149011612,100000002004087730000.0,1.0000000116860974e-7,3.4028234663852886e38,1.401298464324817e-45,-0.0,NaN,-Infinity]',
      'FLOAT[]',
    );
    expect(kids(root).map((c) => [c.value?.text, c.value?.style])).toEqual([
      ['1.0', 'number'],
      ['0.1', 'number'],
      ['1e+20', 'number'],
      ['1e-07', 'number'],
      ['3.4028235e+38', 'number'],
      ['1e-45', 'number'],
      ['-0.0', 'number'],
      ['NaN', 'keyword'],
      ['-Infinity', 'keyword'],
    ]);
    expect(root.preview).toBe('[1.0, 0.1, 1e+20, 1e-07, 3.4028235e+38, 1e-45, -0.0, NaN, …]');
    expect(tree('{"f":0.10000000149011612}', 'STRUCT(f REAL)').preview).toBe('{f: 0.1}');
  });

  it('keeps DOUBLE lexemes, and shows NaN, ±Infinity and booleans as keywords', () => {
    const root = tree('[1.5,NaN,Infinity,-Infinity,-0.0,5e-324,0.10000000149011612]', 'DOUBLE[]');
    expect(kids(root).map((c) => [c.value?.text, c.value?.style])).toEqual([
      ['1.5', 'number'],
      ['NaN', 'keyword'],
      ['Infinity', 'keyword'],
      ['-Infinity', 'keyword'],
      ['-0.0', 'number'],
      ['5e-324', 'number'],
      ['0.10000000149011612', 'number'],
    ]);
    expect(
      kids(tree('[true,false,null]', 'BOOLEAN[]')).map((c) => [c.value?.text, c.value?.style]),
    ).toEqual([
      ['true', 'keyword'],
      ['false', 'keyword'],
      ['null', 'null'],
    ]);
  });

  it('shows dates, times, UUIDs, BLOBs, intervals, ENUMs and BITs as unquoted DuckDB text', () => {
    const type =
      "STRUCT(d DATE, t TIME, ts TIMESTAMP, tz TIMESTAMP WITH TIME ZONE, u UUID, b BLOB, i INTERVAL, e ENUM('x', 'y,z'), bit BIT, s VARCHAR)";
    const json =
      '{"d":"2024-01-31","t":"12:34:56","ts":"2024-01-01 00:00:00","tz":"2024-01-01 00:00:00+00",' +
      '"u":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","b":"\\\\xAA\\\\x00a","i":"3 days","e":"y,z","bit":"1010","s":"2024-01-31"}';
    const root = tree(json, type);
    expect(
      kids(root).map((c) => [c.key?.text, c.typeLabel, c.value?.text, c.value?.style]),
    ).toEqual([
      ['d', 'date', '2024-01-31', 'text'],
      ['t', 'time', '12:34:56', 'text'],
      ['ts', 'timestamp', '2024-01-01 00:00:00', 'text'],
      ['tz', 'timestamptz', '2024-01-01 00:00:00+00', 'text'],
      ['u', 'uuid', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'text'],
      ['b', 'blob', '\\xAA\\x00a', 'text'],
      ['i', 'interval', '3 days', 'text'],
      ['e', 'enum', 'y,z', 'text'],
      ['bit', 'bit', '1010', 'text'],
      ['s', 'varchar', '"2024-01-31"', 'string'],
    ]);
    expect(tree('["2024-01-31","2023-12-31"]', 'DATE[]').preview).toBe('[2024-01-31, 2023-12-31]');
  });

  it('escapes control characters in unquoted text too', () => {
    const root = tree('["a\\nb\\u0001"]', "ENUM('a\nb')[]");
    expect(kids(root)[0]!.value).toEqual({ text: 'a\\nb\\u0001', style: 'text' });
  });

  it('shows a number where the type says text, and text where it says number, as written', () => {
    const root = tree('{"b":12345678901234567890123,"n":"x"}', 'STRUCT(b BIGNUM, n INTEGER)');
    expect(kids(root).map((c) => [c.value?.text, c.value?.style])).toEqual([
      ['12345678901234567890123', 'number'],
      ['"x"', 'string'],
    ]);
  });
});

describe('strings', () => {
  it('quotes and escapes as JSON does, control characters and lone surrogates included', () => {
    const value = `it's "dq" a, b [x] k=v NULL '' \\ \n \t \u0001 \u007f \u0085 \ud800 é ‏עברית‏ 😀`;
    const root = tree(JSON.stringify([value]), 'VARCHAR[]');
    const shown = kids(root)[0]!.value!;
    expect(shown.style).toBe('string');
    expect(shown.more).toBeUndefined();
    expect(shown.text).toBe(
      `"it's \\"dq\\" a, b [x] k=v NULL '' \\\\ \\n \\t \\u0001 \\u007f \\u0085 \\ud800 é ‏עברית‏ 😀"`,
    );
    // The same as JSON.stringify for everything it escapes.
    expect(shown.text.replace('\\u007f', '\u007f').replace('\\u0085', '\u0085')).toBe(
      JSON.stringify(value),
    );
  });

  it('shows the empty string and the text NULL', () => {
    expect(kids(tree('["","NULL",null]', 'VARCHAR[]')).map((c) => c.value)).toEqual([
      { text: '""', style: 'string' },
      { text: '"NULL"', style: 'string' },
      { text: 'null', style: 'null' },
    ]);
  });

  it(`cuts text after ${en(VALUE_TREE_STRING_CAP)} characters and says how many more there are`, () => {
    const long = 'a'.repeat(20_000);
    const leaf = kids(tree(JSON.stringify([long]), 'VARCHAR[]'))[0]!;
    expect(leaf.value).toEqual({
      text: `"${'a'.repeat(VALUE_TREE_STRING_CAP)}…"`,
      style: 'string',
      more: '18,000 more characters',
    });
    expect(leaf.label).toBe(`1: "${'a'.repeat(VALUE_TREE_STRING_CAP)}…", 18,000 more characters`);

    const exact = kids(tree(JSON.stringify(['b'.repeat(VALUE_TREE_STRING_CAP)]), 'VARCHAR[]'))[0]!;
    expect(exact.value?.more).toBeUndefined();
    const oneMore = kids(
      tree(JSON.stringify(['b'.repeat(VALUE_TREE_STRING_CAP + 1)]), 'VARCHAR[]'),
    )[0]!;
    expect(oneMore.value?.more).toBe('1 more character');
  });

  it('counts code points, never splits a surrogate pair, and keeps an emoji cluster whole', () => {
    const smileys = '😀'.repeat(3000);
    const leaf = kids(tree(JSON.stringify([smileys]), 'VARCHAR[]'))[0]!;
    expect(leaf.value!.text).toBe(`"${'😀'.repeat(VALUE_TREE_STRING_CAP)}…"`);
    expect(leaf.value!.more).toBe('1,000 more characters');

    // The family emoji is seven code points; place it across the cut.
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
    const text = 'x'.repeat(VALUE_TREE_STRING_CAP - 3) + family + 'y'.repeat(10);
    const cut = kids(tree(JSON.stringify([text]), 'VARCHAR[]'))[0]!.value!;
    expect(cut.text).toBe(`"${'x'.repeat(VALUE_TREE_STRING_CAP - 3)}…"`);
    expect(cut.more).toBe('17 more characters');
  });

  it('cuts DuckDB text, numbers and keys at the cap too', () => {
    const root = tree(JSON.stringify({ ['k'.repeat(10)]: 'b'.repeat(30) }), 'MAP(VARCHAR, BLOB)', {
      stringCap: 5,
    });
    const entry = kids(root)[0]!;
    expect(entry.key?.text).toBe('kkkkk…');
    expect(entry.value).toEqual({ text: 'bbbbb…', style: 'text', more: '25 more characters' });
    const number = kids(tree('[123456789]', 'INTEGER[]', { stringCap: 4 }))[0]!;
    expect(number.value).toEqual({ text: '1234…', style: 'number', more: '5 more characters' });
  });

  it('cuts a string in a preview inside its quotes, never inside an escape', () => {
    const root = tree(
      JSON.stringify(['Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do', 'b']),
      'VARCHAR[]',
    );
    expect(root.preview).toBe('["Lorem ipsum dolor sit amet, consectetur adipiscing e…", …]');
    expect(root.preview).toHaveLength(VALUE_TREE_PREVIEW_CHARS);
    const escapes = tree(JSON.stringify(['\n'.repeat(40)]), 'VARCHAR[]');
    expect(escapes.preview).toMatch(/^\["(\\n)+…"\]$/);
    expect(escapes.preview!.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
  });
});

describe('previews', () => {
  it('stay within 60 characters, ending in … where items are left out', () => {
    const cases: [json: string, type: string, preview: string][] = [
      ['[[1,2],[3,4]]', 'INTEGER[][]', '[[1, 2], [3, 4]]'],
      ['{}', 'MAP(VARCHAR, INTEGER)', '{}'],
      ['{"a":{}}', 'JSON', '{a: {}}'],
      ['{"k1":1,"k2":null}', 'MAP(VARCHAR, INTEGER)', '{k1 → 1, k2 → null}'],
      [
        JSON.stringify(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i]))),
        `STRUCT(${Array.from({ length: 40 }, (_, i) => `f${i} INTEGER`).join(', ')})`,
        '{f0: 0, f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, f6: 6, f7: 7, …}',
      ],
      [`["${'z'.repeat(100)}"]`, 'VARCHAR[]', `["${'z'.repeat(55)}…"]`],
      [`[[["${'z'.repeat(100)}"]]]`, 'VARCHAR[][][]', `[[["${'z'.repeat(51)}…"]]]`],
      [`{"${'k'.repeat(70)}":1}`, 'JSON', '{…}'],
    ];
    for (const [json, type, preview] of cases) {
      const root = tree(json, type);
      expect(root.preview, json).toBe(preview);
      expect(root.preview!.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
    }
  });

  it('follow the previewChars option', () => {
    expect(tree('[1,2,3,4,5]', 'INTEGER[]', { previewChars: 10 }).preview).toBe('[1, 2, …]');
    expect(tree('[123456]', 'INTEGER[]', { previewChars: 5 }).preview).toBe('[…]');
  });
});

describe('buckets', () => {
  const list = (n: number, start = 1) =>
    tree(JSON.stringify(Array.from({ length: n }, (_, i) => i + start)), 'INTEGER[]');

  it('lists 100 children as they are', () => {
    const root = list(100);
    expect(kids(root)).toHaveLength(100);
    expect(kids(root).every((c) => !c.bucket)).toBe(true);
  });

  it('splits 101 children into [1 … 100] and [101 … 101]', () => {
    const root = list(101);
    const buckets = kids(root);
    expect(buckets.map((b) => [b.label, b.bucket, b.count, b.id])).toEqual([
      ['[1 … 100]', { start: 0, end: 100 }, 100, '$/0-99'],
      ['[101 … 101]', { start: 100, end: 101 }, 1, '$/100-100'],
    ]);
    expect(buckets[0]!.typeLabel).toBe('');
    expect(buckets[0]!.type).toBe(root.type);
    expect(buckets[0]!.json).toBe(root.json);
    const last = kids(buckets[1]!)[0]!;
    expect([last.key?.text, last.path, last.id, last.value?.text]).toEqual([
      '101',
      [101],
      '$/100',
      '101',
    ]);
  });

  it('splits 250 children into three buckets, the last one short', () => {
    expect(kids(list(250)).map((b) => [b.label, kids(b).length])).toEqual([
      ['[1 … 100]', 100],
      ['[101 … 200]', 100],
      ['[201 … 250]', 50],
    ]);
  });

  it('splits 10,000 children into 100 buckets of 100', () => {
    const root = list(10_000);
    const buckets = kids(root);
    expect(buckets).toHaveLength(100);
    expect(buckets[99]!.label).toBe('[9901 … 10000]');
    expect(buckets.every((b) => kids(b).length === 100 && !kids(b)[0]!.bucket)).toBe(true);
    const all = items(root);
    expect(all).toHaveLength(10_000);
    expect(all.map((c) => c.key?.text)).toEqual(all.map((_, i) => String(i + 1)));
    expect(new Set(allNodes(root).map((n) => n.id)).size).toBe(10_000 + 100 + 1);
  });

  it('nests buckets past 10,000: 10,001 children are a bucket of 10,000 and a bucket of one', () => {
    const root = list(10_001);
    const [big, one] = kids(root);
    expect([big!.label, one!.label]).toEqual(['[1 … 10000]', '[10001 … 10001]']);
    expect(kids(big!)).toHaveLength(100);
    expect(
      kids(big!)
        .map((b) => b.label)
        .slice(0, 2),
    ).toEqual(['[1 … 100]', '[101 … 200]']);
    expect(kids(big!).every((b) => b.bucket && kids(b).length === 100)).toBe(true);
    expect(kids(one!).map((c) => [c.key?.text, c.path, c.id])).toEqual([
      ['10001', [10001], '$/10000'],
    ]);
    expect(items(root)).toHaveLength(10_001);
  });

  it('splits 100,000 children into 10 buckets of 10,000, each 100 of 100', () => {
    const root = list(100_000);
    const buckets = kids(root);
    expect(buckets.map((b) => b.label)).toEqual(
      Array.from({ length: 10 }, (_, i) => `[${i * 10_000 + 1} … ${(i + 1) * 10_000}]`),
    );
    const inner = kids(buckets[3]!);
    expect(inner).toHaveLength(100);
    expect(inner[0]!.label).toBe('[30001 … 30100]');
    expect(kids(inner[0]!)[0]!.path).toEqual([30_001]);
    expect(kids(inner[0]!)[0]!.id).toBe('$/30000');
    // Ids stay unique across bucket levels.
    const ids = new Set<string>();
    for (const node of [root, ...buckets, ...inner, ...kids(inner[0]!)]) {
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);
    }
  });

  it('numbers JSON arrays and objects from 0, DuckDB maps and structs from 1', () => {
    const array = tree(JSON.stringify(Array.from({ length: 250 }, (_, i) => i)), 'JSON');
    expect(kids(array).map((b) => b.label)).toEqual(['[0 … 99]', '[100 … 199]', '[200 … 249]']);
    expect(kids(kids(array)[2]!)[0]!.path).toEqual([200]);
    expect(kids(kids(array)[2]!)[0]!.key).toEqual({ text: '200', kind: 'jsonIndex' });

    const object = tree(
      JSON.stringify(Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i]))),
      'JSON',
    );
    expect(kids(object).map((b) => b.label)).toEqual(['[0 … 99]', '[100 … 149]']);
    expect(kids(kids(object)[1]!)[0]!.path).toEqual(['k100']);

    const map = tree(
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 600 }, (_, i) => [String(i * 7), `v${i}`])),
      ),
      'MAP(INTEGER, VARCHAR)',
    );
    expect(map.countText).toBe('600 entries');
    expect(kids(map).map((b) => b.label)).toEqual([
      '[1 … 100]',
      '[101 … 200]',
      '[201 … 300]',
      '[301 … 400]',
      '[401 … 500]',
      '[501 … 600]',
    ]);
    expect(kids(kids(map)[5]!)[99]!.path).toEqual([599 * 7]);

    const struct = tree(
      JSON.stringify(Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`f${i}`, i]))),
      `STRUCT(${Array.from({ length: 150 }, (_, i) => `f${i} INTEGER`).join(', ')})`,
    );
    expect(kids(struct).map((b) => b.label)).toEqual(['[1 … 100]', '[101 … 150]']);
    expect(kids(kids(struct)[1]!)[49]!.path).toEqual(['f149']);
  });

  it('follows the bucketSize option', () => {
    const root = tree(JSON.stringify(Array.from({ length: 25 }, (_, i) => i)), 'INTEGER[]', {
      bucketSize: 10,
    });
    expect(kids(root).map((b) => b.label)).toEqual(['[1 … 10]', '[11 … 20]', '[21 … 25]']);
    const deep = tree(JSON.stringify(Array.from({ length: 101 }, (_, i) => i)), 'INTEGER[]', {
      bucketSize: 10,
    });
    expect(kids(deep).map((b) => b.label)).toEqual(['[1 … 100]', '[101 … 101]']);
    expect(kids(kids(deep)[0]!).map((b) => b.label)[9]).toBe('[91 … 100]');
  });
});

describe('ids, labels and paths over whole trees', () => {
  const TYPE =
    'STRUCT(id BIGINT, tags VARCHAR[], point STRUCT(x DOUBLE, y DOUBLE), attrs MAP(VARCHAR, INTEGER), ' +
    'u UNION(i INTEGER, s VARCHAR), doc JSON, pair STRUCT(INTEGER, VARCHAR), big INTEGER[], empty INTEGER[])';
  const VALUE = JSON.stringify({
    id: 1,
    tags: ['a', 'b'],
    point: { x: 1.5, y: -0.5 },
    attrs: { k: 1, 'k=v': 2 },
    u: { s: 'x' },
    doc: { a: [1, { b: null }], '': 'empty key' },
    pair: { '': 1, ' ': 'a' },
    big: Array.from({ length: 1234 }, (_, i) => i),
    empty: [],
  }).replace('" "', '""');

  it('gives every node of a fully expanded tree a unique id, and labels starting with the key', () => {
    const root = tree(VALUE, TYPE, { rootKey: 'row' });
    const nodes = expectWellFormed(root);
    expect(nodes.length).toBeGreaterThan(1234);
    const paths = nodes.filter((n) => !n.bucket).map((n) => JSON.stringify(n.path));
    expect(paths).toContain(JSON.stringify(['doc', 'a', 1, 'b']));
    expect(paths).toContain(JSON.stringify(['attrs', 'k=v']));
    expect(paths).toContain(JSON.stringify(['u', 's']));
    expect(paths).toContain(JSON.stringify(['pair', 2]));
    expect(paths).toContain(JSON.stringify(['big', 1234]));
  });

  it('holds the invariants for random JSON values', () => {
    let seed = 20261005;
    const random = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    const KEYS = ['a', 'a', '', 'my field', 'x\ny', '__proto__', 'toJSON', '😀', 'k=v', '"q"'];
    const STRINGS = ['', 'text', '\u0000\u001f', '\ud800', 'é', '😀'.repeat(40), 'x'.repeat(3000)];
    const NUMBERS = [
      '0',
      '-0.0',
      '1.50',
      '1e300',
      'NaN',
      '-Infinity',
      '170141183460469231731687303715884105727',
    ];
    const MAX_DEPTH = 6;

    const value = (depth: number): string => {
      const roll = random();
      if (depth > MAX_DEPTH || roll < 0.35) {
        return pick([
          () => pick(NUMBERS),
          () => JSON.stringify(pick(STRINGS)),
          () => pick(['true', 'false', 'null']),
        ])();
      }
      // Now and then a container big enough for buckets, holding scalars only.
      const big = depth < 2 && random() < 0.15;
      const length = big ? 101 + Math.floor(random() * 150) : Math.floor(random() * 5);
      const inner = big ? MAX_DEPTH + 1 : depth + 1;
      if (roll < 0.7) return `[${Array.from({ length }, () => value(inner)).join(',')}]`;
      return `{${Array.from({ length }, () => `${JSON.stringify(pick(KEYS))}:${value(inner)}`).join(',')}}`;
    };

    for (let round = 0; round < 40; round++) {
      const text = value(0);
      const { root: json, truncated } = parseJsonTree(text);
      expect(truncated).toBe(false);
      const root = buildValueTree(json, parseDuckDBType('JSON'), messages, { rootKey: 'doc' });
      const nodes = expectWellFormed(root);
      for (const node of nodes) {
        if (!node.bucket) expect(node.path).not.toBeNull();
        // A copy of any node is standard JSON.
        expect(() => JSON.parse(nodeJsonText(node, 0))).not.toThrow();
      }
    }
  });
});

describe('defaultExpansion', () => {
  /** The nodes a tree view would open with: asked parents before children, as TreeView asks. */
  function opened(root: ValueTreeNode): ValueTreeNode[] {
    const expand = defaultExpansion(root);
    const out: ValueTreeNode[] = [];
    const stack: [ValueTreeNode, number][] = [[root, 1]];
    for (let next = stack.pop(); next; next = stack.pop()) {
      const [node, level] = next;
      if (!node.children || !expand(node, level)) continue;
      out.push(node);
      for (const c of [...node.children()].reverse()) stack.push([c, level + 1]);
    }
    return out;
  }

  it('opens the root, and its children when everything comes to 50 rows or fewer', () => {
    const point = tree('{"x":1,"y":2}', 'STRUCT(x INTEGER, y INTEGER)');
    expect(opened(point)).toEqual([point]);

    const people = tree(
      '[{"name":"Ann","age":30,"langs":["en"]},{"name":"Bo","age":null,"langs":[]}]',
      'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
    );
    // 1 + 2 + 3 + 3 rows; langs (level 3) stays closed.
    expect(opened(people).map((n) => n.id)).toEqual(['$', '$/0', '$/1']);

    const union = tree(
      '{"st":{"a":1,"b":"x"}}',
      'UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR))',
    );
    expect(opened(union).map((n) => n.id)).toEqual(['$', '$/0']);
  });

  it('counts the rows exactly: 50 opens the second level, 51 does not', () => {
    const fits = JSON.stringify(Array.from({ length: 7 }, () => [1, 2, 3, 4, 5, 6]));
    const fitsRoot = tree(fits, 'INTEGER[][]');
    expect(1 + 7 + 7 * 6).toBe(VALUE_TREE_EXPANDED_ROWS);
    expect(opened(fitsRoot)).toHaveLength(8);
    const over = JSON.stringify([
      ...Array.from({ length: 6 }, () => [1, 2, 3, 4, 5, 6]),
      [1, 2, 3, 4, 5, 6, 7],
    ]);
    expect(opened(tree(over, 'INTEGER[][]')).map((n) => n.id)).toEqual(['$']);

    const wide = `STRUCT(${Array.from({ length: 26 }, (_, i) => `f${i} INTEGER`).join(', ')})`;
    const rows = JSON.stringify(
      Array.from({ length: 3 }, () =>
        Object.fromEntries(Array.from({ length: 26 }, (_, i) => [`f${i}`, i])),
      ),
    );
    expect(opened(tree(rows, `${wide}[]`)).map((n) => n.id)).toEqual(['$']);
  });

  it('counts buckets, not the items behind them', () => {
    const root = tree(JSON.stringify([Array.from({ length: 4000 }, (_, i) => i)]), 'INTEGER[][]');
    // 1 + 1 + 40 buckets.
    expect(opened(root).map((n) => n.id)).toEqual(['$', '$/0']);
    const big = tree(JSON.stringify(Array.from({ length: 250 }, (_, i) => i)), 'INTEGER[]');
    expect(opened(big).map((n) => n.id)).toEqual(['$']);
  });

  it('opens nothing for a leaf, and nothing it does not know', () => {
    const leaf = tree('42', 'JSON');
    expect(defaultExpansion(leaf)(leaf, 1)).toBe(false);
    const other = tree('[1]', 'INTEGER[]');
    expect(defaultExpansion(tree('[1]', 'INTEGER[]'))(other, 1)).toBe(false);
  });
});

describe('nodeJsonText', () => {
  it('writes standard JSON: digits kept, NaN and ±Infinity as null, keys in order', () => {
    const root = tree(
      '{"2":[1.5,NaN,Infinity,-Infinity,-0.0],"1":170141183460469231731687303715884105727}',
      'JSON',
    );
    expect(nodeJsonText(root, 0)).toBe(
      '{"2":[1.5,null,null,null,-0.0],"1":170141183460469231731687303715884105727}',
    );
    expect(nodeJsonText(root)).toBe(prettyJson(root.json, 2));
    expect(() => JSON.parse(nodeJsonText(root))).not.toThrow();
    expect(nodeJsonText(kids(kids(root)[0]!)[1]!)).toBe('null');
  });

  it('gives a bucket its slice: items of a list, entries of an object', () => {
    const list = tree(JSON.stringify(Array.from({ length: 250 }, (_, i) => i + 1)), 'INTEGER[]');
    expect(JSON.parse(nodeJsonText(kids(list)[1]!))).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 101),
    );
    const object = tree(
      JSON.stringify(Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`k${i}`, i]))),
      'JSON',
    );
    expect(JSON.parse(nodeJsonText(kids(object)[1]!, 0))).toEqual(
      Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i + 100}`, i + 100])),
    );
    const entries = tree(
      JSON.stringify({
        m: Array.from({ length: 120 }, (_, i) => ({ key: i, value: `v${i}` })),
        v: 1,
      }),
      'STRUCT(m MAP(INTEGER, VARCHAR), v VARIANT)',
    );
    expect(JSON.parse(nodeJsonText(kids(child(entries, 'm'))[1]!, 0))).toEqual(
      Array.from({ length: 20 }, (_, i) => ({ key: i + 100, value: `v${i + 100}` })),
    );
  });

  it('gives a map entry its value, a union its tagged object and a member its value', () => {
    const map = tree('{"k":{"a":[1]}}', 'MAP(VARCHAR, STRUCT(a INTEGER[]))');
    expect(nodeJsonText(kids(map)[0]!, 0)).toBe('{"a":[1]}');
    const union = tree('{"i":0}', 'UNION(i INTEGER, s VARCHAR)');
    expect(nodeJsonText(union, 0)).toBe('{"i":0}');
    expect(nodeJsonText(kids(union)[0]!, 0)).toBe('0');
    expect(nodeJsonText(kids(tree('[{"":1,"":"a"}]', 'STRUCT(INTEGER, VARCHAR)[]'))[0]!, 0)).toBe(
      '{"":1,"":"a"}',
    );
  });
});

describe('depth and size', () => {
  const DEEP = 10_000;

  it(`expands a ${en(DEEP)}-deep list level by level`, () => {
    const text = '['.repeat(DEEP) + '1' + ']'.repeat(DEEP);
    const root = tree(text, 'JSON');
    expect(root.preview!.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
    expect(root.preview).toMatch(/^\[+…\]+$/);
    let node = root;
    for (let level = 0; level < DEEP; level++) {
      const children = node.children!();
      expect(children.length === 1).toBe(true);
      node = children[0]!;
    }
    expect(node.value).toEqual({ text: '1', style: 'number' });
    const path = node.path!;
    expect(path).toHaveLength(DEEP);
    expect(path.every((step) => step === 0)).toBe(true);
    expect(nodeJsonText(root, 0)).toBe(text);
  });

  it(`expands a ${en(DEEP)}-deep VARIANT object level by level`, () => {
    const text = '{"a":'.repeat(DEEP) + 'null' + '}'.repeat(DEEP);
    let node = tree(text, 'VARIANT');
    for (let level = 0; level < DEEP; level++) node = node.children!()[0]!;
    expect(node.label).toBe('a: null');
    expect(node.path).toHaveLength(DEEP);
  });

  it('builds what was read from a value cut short', () => {
    const cut = (text: string, type: string) => {
      const { root, truncated } = parseJsonTree(text);
      expect(truncated).toBe(true);
      return buildValueTree(root, parseDuckDBType(type), messages);
    };
    const struct = cut(
      '{"x":1.25,"tags":["a","b","cd',
      'STRUCT(x DOUBLE, tags VARCHAR[], n INTEGER)',
    );
    expect(struct.count).toBe(2);
    expect(kids(child(struct, 'tags')).map((c) => c.value?.text)).toEqual(['"a"', '"b"', '"cd"']);
    expectWellFormed(struct);

    const list = cut(`[${Array.from({ length: 5000 }, (_, i) => i).join(',')}`, 'INTEGER[]');
    expect(list.count).toBe(5000);
    expect(kids(list)).toHaveLength(50);
    expectWellFormed(list);

    const union = cut('{"i"', 'UNION(i INTEGER, s VARCHAR)');
    expect(summary(union)).toEqual({ key: undefined, type: 'object', count: 0, preview: '{}' });
    expect(cut('', 'INTEGER[]').value).toEqual({ text: 'null', style: 'null' });
  });
});

describe('formatFloat32', () => {
  it('writes floats as DuckDB writes a FLOAT', () => {
    const cases: [number, string][] = [
      [1, '1.0'],
      [0.1, '0.1'],
      [0.3, '0.3'],
      [-3.5, '-3.5'],
      [0.001, '0.001'],
      [1e-4, '0.0001'],
      [0.00012345, '0.00012345'],
      [1e-5, '1e-05'],
      [9.5e-5, '9.5e-05'],
      [1.5e-5, '1.5e-05'],
      [1e-7, '1e-07'],
      [1e15, '1000000000000000.0'],
      [9.999999e15, '9999999000000000.0'],
      [-1.2345678e15, '-1234567800000000.0'],
      [1e16, '1e+16'],
      [1.5e16, '1.5e+16'],
      [1e20, '1e+20'],
      [123456789, '123456790.0'],
      [1234567, '1234567.0'],
      [12345678, '12345678.0'],
      [16777217, '16777216.0'],
      [3.4028235e38, '3.4028235e+38'],
      [1e-38, '1e-38'],
      [1.1754944e-38, '1.1754944e-38'],
      [1e-45, '1e-45'],
      [0, '0.0'],
      [-0, '-0.0'],
      [NaN, 'NaN'],
      [Infinity, 'Infinity'],
      [-Infinity, '-Infinity'],
      [1e39, 'Infinity'],
      // Ties DuckDB's formatter cannot decide: the double's own digits.
      [2453185.75, '2453185.75'],
      [-53812808, '-53812808.0'],
    ];
    for (const [value, text] of cases) expect(formatFloat32(value), String(value)).toBe(text);
  });

  it('reads the widened doubles to_json writes back to the float', () => {
    const cases: [number, string][] = [
      [0.10000000149011612, '0.1'],
      [100000002004087730000, '1e+20'],
      [1.0000000116860974e-7, '1e-07'],
      [0.000014999999621068127, '1.5e-05'],
      [0.0010000000474974513, '0.001'],
      [3.4028234663852886e38, '3.4028235e+38'],
      [1.401298464324817e-45, '1e-45'],
      [123456792, '123456790.0'],
    ];
    for (const [value, text] of cases) expect(formatFloat32(value), String(value)).toBe(text);
  });

  it('reads back as the same float32 for random bit patterns', () => {
    const bits = new Uint32Array(1);
    const float = new Float32Array(bits.buffer);
    let seed = 7;
    for (let i = 0; i < 20_000; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      bits[0] = (seed ^ (seed << 13)) >>> 0;
      const value = float[0]!;
      if (!Number.isFinite(value)) continue;
      const text = formatFloat32(value);
      expect(Math.fround(Number(text)), text).toBe(value);
      // Never more significant digits than float32 needs, unless they are
      // the value's own shortest double digits (DuckDB's way out of a tie).
      const significant = (s: string) =>
        s
          .replace(/^-/, '')
          .replace(/e.*$/, '')
          .replace('.', '')
          .replace(/^0+/, '')
          .replace(/0+$/, '');
      const digits = significant(text);
      if (digits.length > 9) expect(digits).toBe(significant(value.toExponential()));
    }
  });
});

describe('options and messages', () => {
  it('passes numbers to the messages and shows what they return', () => {
    const french: ValueTreeMessages = {
      itemCount: (n) => `${n} éléments`,
      entryCount: (n) => `${n} entrées`,
      fieldCount: (n) => `${n} champs`,
      keyCount: (n) => `${n} clés`,
      bucketLabel: (a, b) => `[${a}–${b}]`,
      moreCharacters: (n) => `${n} caractères de plus`,
    };
    const root = buildValueTree(
      parseJsonTree(JSON.stringify(Array.from({ length: 101 }, () => 'z'.repeat(2001)))).root,
      parseDuckDBType('VARCHAR[]'),
      french,
    );
    expect(root.countText).toBe('101 éléments');
    expect(kids(root)[0]!.label).toBe('[1–100]');
    expect(kids(kids(root)[0]!)[0]!.value!.more).toBe('1 caractères de plus');
  });

  it('falls back to the defaults for options that make no sense', () => {
    const root = tree(JSON.stringify(Array.from({ length: 101 }, (_, i) => i)), 'INTEGER[]', {
      bucketSize: 1,
      stringCap: 0,
      previewChars: Number.NaN,
    });
    expect(kids(root)).toHaveLength(2);
    expect(root.preview!.length).toBeLessThanOrEqual(VALUE_TREE_PREVIEW_CHARS);
    expect(tree('{"k":1}', 'JSON', { rootKey: 'a\nb' }).key).toEqual({
      text: 'a\\nb',
      kind: 'column',
    });
    expect(tree('{"k":1}', 'JSON', { rootKey: '' }).label).toBe('"": json, 1 key');
  });
});
