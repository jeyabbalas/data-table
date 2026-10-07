import { describe, expect, it } from 'vitest';
import { parseDuckDBType } from '@/core/duckdbType';
import {
  jsonNumberToJs,
  materialize,
  parseJsonTree,
  prettyJson,
  toStandardJson,
  type JsonEntry,
  type JsonNode,
} from '@/core/jsonTree';
import { formatValueForJSON } from '@/export/JSONExport';

// ---------------------------------------------------------------------------
// Text DuckDB wrote
// ---------------------------------------------------------------------------

interface Vector {
  readonly name: string;
  /**
   * How the text was read from `x`:
   * - `to_json`: `CAST(to_json(x) AS VARCHAR)`, how the table reads nested values;
   * - `variant`: `CAST(CAST(CAST(x AS VARIANT) AS JSON) AS VARCHAR)`, for types holding a VARIANT;
   * - `raw`: `CAST(x AS VARCHAR)` of a JSON value, the text as it was written.
   */
  readonly reader: 'to_json' | 'variant' | 'raw';
  /** `typeof(x)`. */
  readonly type: string;
  readonly text: string;
}

/**
 * Captured from DuckDB v1.5.4 (duckdb-wasm 1.33.1-dev57) with
 * `SELECT typeof(x), <reader>(x) FROM (SELECT <expression> AS x)`, one row per
 * expression, and kept as written (invisible characters as `\u` escapes). As
 * fixed text they need no engine here; the `*.duckdb.test.ts` suites are the
 * ones that read DuckDB itself.
 */
const TO_JSON: readonly Vector[] = [
  {
    name: 'double specials',
    reader: 'to_json',
    type: 'DOUBLE[]',
    text: '[1.0,NaN,Infinity,-Infinity,-0.0,5e-324]',
  },
  { name: 'decimal list', reader: 'to_json', type: 'DECIMAL(10,2)[]', text: '[1.25,2.5]' },
  {
    name: 'hugeint extremes',
    reader: 'to_json',
    type: 'HUGEINT[]',
    text: '[170141183460469231731687303715884105727,-170141183460469231731687303715884105728]',
  },
  { name: 'ubigint max', reader: 'to_json', type: 'UBIGINT[]', text: '[18446744073709551615]' },
  {
    name: 'decimal(38,0) max',
    reader: 'to_json',
    type: 'DECIMAL(38,0)[]',
    text: '[99999999999999999999999999999999999999]',
  },
  {
    name: 'float widened',
    reader: 'to_json',
    type: 'FLOAT[]',
    text: '[0.10000000149011612,NaN,-Infinity,-0.0,1.401298464324817e-45]',
  },
  {
    name: 'bigint extremes',
    reader: 'to_json',
    type: 'BIGINT[]',
    text: '[9223372036854775807,-9223372036854775808,9007199254740993,9007199254740991,-9007199254740993]',
  },
  {
    name: 'double formats',
    reader: 'to_json',
    type: 'DOUBLE[]',
    text: '[1e-7,1e21,1e300,123456789.125,0.1,1.0,100.0,100000000000000000000.0,2500000000000000.0]',
  },
  {
    name: 'map integer keys',
    reader: 'to_json',
    type: 'MAP(INTEGER, VARCHAR)',
    text: '{"2":"a","1":"b","10":"c"}',
  },
  {
    name: 'map struct keys',
    reader: 'to_json',
    type: 'MAP(STRUCT(k INTEGER), VARCHAR)',
    text: '{"{\'k\': 1}":"a","{\'k\': 2}":"b"}',
  },
  {
    name: 'map list keys',
    reader: 'to_json',
    type: 'MAP(INTEGER[], VARCHAR)',
    text: '{"[1, 2]":"a","[3]":"b"}',
  },
  {
    name: 'map double keys',
    reader: 'to_json',
    type: 'MAP(DOUBLE, VARCHAR)',
    text: '{"nan":"a","inf":"b","-inf":"c","-0.0":"d","1e+300":"e","0.10000000149011612":"f"}',
  },
  {
    name: 'map decimal keys',
    reader: 'to_json',
    type: 'MAP(DECIMAL(3,2), VARCHAR)',
    text: '{"1.50":"a","2.25":"b"}',
  },
  {
    name: 'map boolean keys',
    reader: 'to_json',
    type: 'MAP(BOOLEAN, VARCHAR)',
    text: '{"true":"a","false":"b"}',
  },
  {
    name: 'map ubigint keys',
    reader: 'to_json',
    type: 'MAP(UBIGINT, VARCHAR)',
    text: '{"18446744073709551615":"a","1":"b"}',
  },
  {
    name: 'map hugeint keys',
    reader: 'to_json',
    type: 'MAP(HUGEINT, VARCHAR)',
    text: '{"170141183460469231731687303715884105727":"h","-5":"n"}',
  },
  {
    name: 'map date keys',
    reader: 'to_json',
    type: 'MAP(DATE, INTEGER[])',
    text: '{"2024-01-01":[1,2],"2024-01-02":[]}',
  },
  {
    name: 'map struct values',
    reader: 'to_json',
    type: 'MAP(VARCHAR, STRUCT(x INTEGER, y VARCHAR))',
    text: '{"a":{"x":1,"y":"p"},"b":null}',
  },
  {
    name: 'map odd keys',
    reader: 'to_json',
    type: 'MAP(VARCHAR, INTEGER)',
    text: '{"__proto__":1,"constructor":2,"toJSON":3,"size":4,"hasOwnProperty":5,"2":6,"1":7,"k=v":8,"\\"q\\"":9,"a\\\\b":10}',
  },
  { name: 'map empty', reader: 'to_json', type: 'MAP(VARCHAR, INTEGER)', text: '{}' },
  {
    name: 'unnamed struct',
    reader: 'to_json',
    type: 'STRUCT(INTEGER, VARCHAR)',
    text: '{"":1,"":"a"}',
  },
  {
    name: 'unnamed struct huge',
    reader: 'to_json',
    type: 'STRUCT(HUGEINT, UHUGEINT)',
    text: '{"":170141183460469231731687303715884105727,"":340282366920938463463374607431768211455}',
  },
  {
    name: 'struct empty name',
    reader: 'to_json',
    type: 'STRUCT(b BIGINT,  BIGINT)',
    text: '{"b":2,"":1}',
  },
  {
    name: 'struct empty name through variant',
    reader: 'variant',
    type: 'STRUCT(b BIGINT,  BIGINT, v VARIANT)',
    text: '{"b":2,"":1,"v":7}',
  },
  {
    name: 'struct proto keys',
    reader: 'to_json',
    type: 'STRUCT(__proto__ INTEGER, constructor INTEGER, toJSON INTEGER, hasOwnProperty INTEGER)',
    text: '{"__proto__":1,"constructor":2,"toJSON":3,"hasOwnProperty":4}',
  },
  {
    name: 'struct odd names',
    reader: 'to_json',
    type: 'STRUCT("my field" INTEGER, "x,y" INTEGER, "quote""d" INTEGER, "it\'s" INTEGER, "ünï" INTEGER, "emoji😀" INTEGER, "SELECT" INTEGER, "null" INTEGER, "2" INTEGER, "1" INTEGER, "10" INTEGER)',
    text: '{"my field":1,"x,y":2,"quote\\"d":3,"it\'s":4,"ünï":5,"emoji😀":6,"SELECT":7,"null":8,"2":9,"1":10,"10":11}',
  },
  {
    name: 'struct temporal leaves',
    reader: 'to_json',
    type: "STRUCT(d DATE, ts TIMESTAMP, tstz TIMESTAMP WITH TIME ZONE, t TIME, tns TIMESTAMP_NS, u UUID, i INTERVAL, b BLOB, e ENUM('x', 'y,z'), \"bit\" BIT)",
    text: '{"d":"2024-02-29","ts":"2024-01-02 03:04:05.123456","tstz":"2024-01-02 03:04:05+00","t":"12:34:56","tns":"2024-01-02 03:04:05.123456789","u":"123e4567-e89b-12d3-a456-426614174000","i":"1 year 2 months 3 days 04:05:06","b":"\\\\xAA\\\\x00ab","e":"y,z","bit":"0101"}',
  },
  {
    name: 'struct point',
    reader: 'to_json',
    type: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    text: '{"x":1.25,"y":0.58,"tier":"bronze"}',
  },
  {
    name: 'struct nested',
    reader: 'to_json',
    type: 'STRUCT("owner" STRUCT(contact STRUCT(email VARCHAR, phones VARCHAR[])), n INTEGER)',
    text: '{"owner":{"contact":{"email":"a@b.c","phones":["1","2"]}},"n":3}',
  },
  {
    name: 'struct all null',
    reader: 'to_json',
    type: 'STRUCT(x DOUBLE, y VARCHAR)',
    text: '{"x":null,"y":null}',
  },
  {
    name: 'struct json',
    reader: 'to_json',
    type: 'STRUCT(j JSON, k INTEGER)',
    text: '{"j":{"a":1,"b":[1,2],"a":3},"k":2}',
  },
  {
    name: 'struct json lenient',
    reader: 'to_json',
    type: 'STRUCT(a JSON, b JSON, c JSON)',
    text: '{"a":-NaN,"b":INF,"c":[nan,inf,Infinity,1e400]}',
  },
  {
    name: 'list of structs',
    reader: 'to_json',
    type: 'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]',
    text: '[{"name":"ann","age":3,"langs":["en","fr"]},null,{"name":null,"age":null,"langs":[]}]',
  },
  { name: 'list with nulls', reader: 'to_json', type: 'INTEGER[]', text: '[4,null,17]' },
  {
    name: 'list nan text',
    reader: 'to_json',
    type: 'VARCHAR[][]',
    text: '[["NaN","Infinity","-Infinity"],["nan","inf"]]',
  },
  {
    name: 'list double nested',
    reader: 'to_json',
    type: 'DOUBLE[][]',
    text: '[[1.5,NaN],[Infinity,-Infinity],[]]',
  },
  {
    name: 'list string escapes',
    reader: 'to_json',
    type: 'VARCHAR[]',
    text: '["it\'s","\\"dq\\"","a, b","[x]","k=v","NULL","","\\\\","\\n","\\t","\\r","\\b","\\f","\\u0001","\\u001F","\\u0000","/","שלום","e\u0301","😀","\u2028","\u007f","NaN","{\\"a\\": NaN}"]',
  },
  {
    name: 'interval list',
    reader: 'to_json',
    type: 'INTERVAL[]',
    text: '["1 day","2 months 03:00:00","-1 year"]',
  },
  { name: 'bit list', reader: 'to_json', type: 'BIT[]', text: '["0101","1"]' },
  { name: 'blob list', reader: 'to_json', type: 'BLOB[]', text: '["\\\\xAA\\\\x00ab","plain"]' },
  {
    name: 'uuid list',
    reader: 'to_json',
    type: 'UUID[]',
    text: '["123e4567-e89b-12d3-a456-426614174000"]',
  },
  { name: 'enum list', reader: 'to_json', type: "ENUM('x', 'y,z')[]", text: '["y,z","x"]' },
  { name: 'fixed array', reader: 'to_json', type: 'INTEGER[3]', text: '[1,2,3]' },
  { name: 'list of arrays', reader: 'to_json', type: 'INTEGER[2][]', text: '[[1,2],[3,4]]' },
  {
    name: 'union int',
    reader: 'to_json',
    type: 'UNION(num INTEGER, str VARCHAR)',
    text: '{"num":42}',
  },
  {
    name: 'union str',
    reader: 'to_json',
    type: 'UNION(num INTEGER, str VARCHAR)',
    text: '{"str":"hi"}',
  },
  {
    name: 'union null member',
    reader: 'to_json',
    type: 'UNION(num INTEGER, str VARCHAR)',
    text: '{"num":null}',
  },
  {
    name: 'union list member',
    reader: 'to_json',
    type: 'UNION(l INTEGER[], s STRUCT(a INTEGER))',
    text: '{"l":[1,2]}',
  },
  {
    name: 'union struct member',
    reader: 'to_json',
    type: 'UNION(l INTEGER[], s STRUCT(a INTEGER))',
    text: '{"s":{"a":7}}',
  },
  {
    name: 'union huge member',
    reader: 'to_json',
    type: 'UNION(h HUGEINT, d DOUBLE)',
    text: '{"h":170141183460469231731687303715884105727}',
  },
  {
    name: 'union double member',
    reader: 'to_json',
    type: 'UNION(h HUGEINT, d DOUBLE)',
    text: '{"d":NaN}',
  },
  {
    name: 'list of unions',
    reader: 'to_json',
    type: 'UNION(num INTEGER, str VARCHAR)[]',
    text: '[{"num":1},null,{"str":"0"}]',
  },
  {
    name: 'bignum list',
    reader: 'to_json',
    type: 'BIGNUM[]',
    text: '[12345678901234566660398341115085767575755770822656,-1]',
  },
  { name: 'json list', reader: 'to_json', type: 'JSON[]', text: '[{"a":1},[1,2],null,"s",[1,2]]' },
  {
    name: 'variant map varchar',
    reader: 'variant',
    type: 'MAP(VARCHAR, VARIANT)',
    text: '[{"key":"a","value":1},{"key":"b","value":"x"}]',
  },
  {
    name: 'variant map integer',
    reader: 'variant',
    type: 'MAP(INTEGER, VARIANT)',
    text: '[{"key":2,"value":1},{"key":1,"value":2}]',
  },
  {
    name: 'variant struct with union',
    reader: 'variant',
    type: 'STRUCT(k VARIANT, u UNION(num INTEGER, str VARCHAR))',
    text: '{"k":1,"u":4}',
  },
  {
    name: 'variant union struct member named like a tag',
    reader: 'variant',
    type: 'STRUCT(u UNION(a STRUCT(b BIGINT), b DOUBLE), v VARIANT)',
    text: '{"u":{"b":9007199254740993},"v":1}',
  },
  {
    name: 'variant union struct member named like a text tag',
    reader: 'variant',
    type: 'STRUCT(u UNION(s STRUCT(n INTEGER), n VARCHAR), v VARIANT)',
    text: '{"u":{"n":5},"v":1}',
  },
  {
    name: 'variant union double member',
    reader: 'variant',
    type: 'STRUCT(u UNION(a STRUCT(b BIGINT), b DOUBLE), v VARIANT)',
    text: '{"u":2.5,"v":"x"}',
  },
  {
    name: 'variant list of leaves',
    reader: 'variant',
    type: 'VARIANT[]',
    text: '["2024-01-01","\\\\xAA",170141183460469231731687303715884105727,"123e4567-e89b-12d3-a456-426614174000","1 day",0.10000000149011612,NaN,"01:02:03",true,null]',
  },
  { name: 'variant scalar struct', reader: 'variant', type: 'VARIANT', text: '{"a":1.50,"b":NaN}' },
  { name: 'variant scalar', reader: 'variant', type: 'VARIANT', text: '42' },
  { name: 'variant null', reader: 'variant', type: 'VARIANT', text: 'null' },
  {
    name: 'json text duplicates',
    reader: 'raw',
    type: 'JSON',
    text: '{"a":1,"a":2, "2": 3, "1": 4}',
  },
  {
    name: 'json text trailing commas',
    reader: 'raw',
    type: 'JSON',
    text: '{"a":[1,2,],"b":{"c":1,},}',
  },
  { name: 'json text whitespace', reader: 'raw', type: 'JSON', text: '  [ 1 ,\t2 ,\r\n 3 ]  ' },
  {
    name: 'json text lenient numbers',
    reader: 'raw',
    type: 'JSON',
    text: '[nan, inf, -inf, Infinity, -Infinity, NAN, INF, -NaN, 1e400, -0, 1E5]',
  },
  {
    name: 'json text escapes',
    reader: 'raw',
    type: 'JSON',
    text: '["\\u00e9\\ud83d\\ude00", "\\/", "a\\"b"]',
  },
];

function vector(name: string): Vector {
  const found = TO_JSON.find((v) => v.name === name);
  if (!found) throw new Error(`no vector named ${name}`);
  return found;
}

/** The vector's tree, read in full. */
function treeOf(name: string): JsonNode {
  const { root, truncated } = parseJsonTree(vector(name).text);
  expect(truncated).toBe(false);
  return root;
}

/** The vector materialized as its own DuckDB type. */
function read(name: string, mode: 'value' | 'export' = 'value'): any {
  return materialize(treeOf(name), parseDuckDBType(vector(name).type), mode);
}

/** `text` read in full and materialized with no type. */
function generic(text: string, mode: 'value' | 'export' = 'value'): any {
  const { root, truncated } = parseJsonTree(text);
  expect(truncated).toBe(false);
  return materialize(root, undefined, mode);
}

/** One line of standard JSON for a tree. */
function compact(node: JsonNode): string {
  return prettyJson(node, 0);
}

/**
 * Whether `value` holds only what `JSON.stringify` writes as it is: no
 * bigint, no Map, no NaN or ±Infinity. Walks with a stack (values may be
 * 10,000 deep).
 */
function assertJsonSafe(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const v = pending.pop();
    expect(typeof v).not.toBe('bigint');
    expect(v).not.toBeInstanceOf(Map);
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    if (v !== null && typeof v === 'object') pending.push(...Object.values(v));
  }
}

/** The depth of a chain of single-child arrays or objects, with a stack. */
function chainDepth(value: unknown): { depth: number; bottom: unknown } {
  let depth = 0;
  let current = value;
  for (;;) {
    if (Array.isArray(current) && current.length === 1) current = current[0];
    else if (
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.keys(current).length === 1
    )
      current = Object.values(current)[0];
    else return { depth, bottom: current };
    depth++;
  }
}

/** The same for a tree. */
function treeDepth(node: JsonNode): { depth: number; bottom: JsonNode } {
  let depth = 0;
  let current = node;
  for (;;) {
    if (current.kind === 'array' && current.items.length === 1) current = current.items[0]!;
    else if (current.kind === 'object' && current.entries.length === 1)
      current = current.entries[0]!.value;
    else return { depth, bottom: current };
    depth++;
  }
}

/** A seeded generator (mulberry32), so a failing fuzz case reproduces. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, from: readonly T[]): T {
  return from[Math.floor(rnd() * from.length)]!;
}

const DEEP = 10_000;

// ---------------------------------------------------------------------------
// parseJsonTree
// ---------------------------------------------------------------------------

describe('parseJsonTree', () => {
  it('reads every kind of value', () => {
    expect(parseJsonTree('{"a":[1,"x",true,false,null,{}]}')).toEqual({
      root: {
        kind: 'object',
        entries: [
          {
            key: 'a',
            value: {
              kind: 'array',
              items: [
                { kind: 'number', raw: '1' },
                { kind: 'string', value: 'x' },
                { kind: 'boolean', value: true },
                { kind: 'boolean', value: false },
                { kind: 'null' },
                { kind: 'object', entries: [] },
              ],
            },
          },
        ],
      },
      truncated: false,
    });
  });

  it('reads a scalar document', () => {
    expect(parseJsonTree('42')).toEqual({ root: { kind: 'number', raw: '42' }, truncated: false });
    expect(parseJsonTree(' "s" ')).toEqual({
      root: { kind: 'string', value: 's' },
      truncated: false,
    });
    expect(parseJsonTree('null')).toEqual({ root: { kind: 'null' }, truncated: false });
    expect(parseJsonTree('[]')).toEqual({ root: { kind: 'array', items: [] }, truncated: false });
  });

  it('keeps number lexemes exactly as written', () => {
    const lexemes = ['0', '-0', '1.50', '-0.0', '1e-7', '1E5', '0.1e-2', '-2.5E+10', '5e-324'];
    const root = treeOf('double formats');
    expect(compact(root)).toBe(vector('double formats').text);
    const { root: list } = parseJsonTree(`[${lexemes.join(',')}]`);
    expect(list.kind === 'array' && list.items.map((n) => n.kind === 'number' && n.raw)).toEqual(
      lexemes,
    );
  });

  it('keeps every digit of HUGEINT, UBIGINT and DECIMAL(38,0)', () => {
    const raws = (name: string) => {
      const root = treeOf(name);
      return root.kind === 'array' ? root.items.map((n) => n.kind === 'number' && n.raw) : [];
    };
    expect(raws('hugeint extremes')).toEqual([
      '170141183460469231731687303715884105727',
      '-170141183460469231731687303715884105728',
    ]);
    expect(raws('ubigint max')).toEqual(['18446744073709551615']);
    expect(raws('decimal(38,0) max')).toEqual(['99999999999999999999999999999999999999']);
  });

  it('reads NaN, Infinity and -Infinity as numbers, keeping the word', () => {
    expect(treeOf('double specials')).toEqual({
      kind: 'array',
      items: ['1.0', 'NaN', 'Infinity', '-Infinity', '-0.0', '5e-324'].map((raw) => ({
        kind: 'number',
        raw,
      })),
    });
  });

  it("reads the spellings DuckDB's JSON type also accepts, in any case", () => {
    const root = treeOf('json text lenient numbers');
    expect(root.kind === 'array' && root.items.map((n) => n.kind === 'number' && n.raw)).toEqual([
      'nan',
      'inf',
      '-inf',
      'Infinity',
      '-Infinity',
      'NAN',
      'INF',
      '-NaN',
      '1e400',
      '-0',
      '1E5',
    ]);
  });

  it('keeps integer-like keys in the order written', () => {
    const { root } = parseJsonTree('{"2":1,"1":2,"10":3}');
    expect(root.kind === 'object' && root.entries.map((e) => e.key)).toEqual(['2', '1', '10']);
    const odd = treeOf('struct odd names');
    expect(odd.kind === 'object' && odd.entries.map((e) => e.key)).toEqual([
      'my field',
      'x,y',
      'quote"d',
      "it's",
      'ünï',
      'emoji😀',
      'SELECT',
      'null',
      '2',
      '1',
      '10',
    ]);
  });

  it('keeps duplicate keys and the "" keys of unnamed structs', () => {
    expect(treeOf('unnamed struct')).toEqual({
      kind: 'object',
      entries: [
        { key: '', value: { kind: 'number', raw: '1' } },
        { key: '', value: { kind: 'string', value: 'a' } },
      ],
    });
    const root = treeOf('json text duplicates');
    expect(root.kind === 'object' && root.entries.map((e) => [e.key, compact(e.value)])).toEqual([
      ['a', '1'],
      ['a', '2'],
      ['2', '3'],
      ['1', '4'],
    ]);
  });

  it('decodes every escape DuckDB writes', () => {
    const root = treeOf('list string escapes');
    expect(root.kind === 'array' && root.items.map((n) => n.kind === 'string' && n.value)).toEqual([
      "it's",
      '"dq"',
      'a, b',
      '[x]',
      'k=v',
      'NULL',
      '',
      '\\',
      '\n',
      '\t',
      '\r',
      '\b',
      '\f',
      '\u0001',
      '\u001f',
      '\u0000',
      '/',
      'שלום',
      'é',
      '😀',
      ' ',
      '\u007f',
      'NaN',
      '{"a": NaN}',
    ]);
    expect(treeOf('json text escapes')).toEqual({
      kind: 'array',
      items: ['é😀', '/', 'a"b'].map((value) => ({ kind: 'string', value })),
    });
  });

  it('decodes \\u escapes: surrogate pairs join, lone surrogates stay one code unit', () => {
    const strings = (text: string) => {
      const { root, truncated } = parseJsonTree(text);
      expect(truncated).toBe(false);
      return root.kind === 'array' ? root.items.map((n) => n.kind === 'string' && n.value) : [];
    };
    expect(
      strings(
        '["\\ud83d\\ude00", "\\uD83D\\uDE00", "\\ud800", "\\udc00x", "\\ude00\\ud83d", "\\u00e9\\u00C9", "a\\u0000b"]',
      ),
    ).toEqual(['😀', '😀', '\ud800', '\udc00x', '\ude00\ud83d', 'éÉ', 'a\u0000b']);
    expect(strings('["😀 raw", "\\\\u00e9"]')).toEqual(['😀 raw', '\\u00e9']);
  });

  it('reads whitespace anywhere JSON allows it', () => {
    expect(compact(treeOf('json text whitespace'))).toBe('[1,2,3]');
    expect(compact(parseJsonTree(' \t\r\n{ "a" :\n[ 1 , { } ] }\n').root)).toBe('{"a":[1,{}]}');
  });

  it('accepts the trailing commas DuckDB accepts, without calling the text truncated', () => {
    expect(compact(treeOf('json text trailing commas'))).toBe('{"a":[1,2],"b":{"c":1}}');
  });

  it('reads every DuckDB vector in full', () => {
    for (const v of TO_JSON) {
      expect(parseJsonTree(v.text).truncated, v.name).toBe(false);
    }
  });

  it('reads empty text, or only whitespace, as null, truncated', () => {
    expect(parseJsonTree('')).toEqual({ root: { kind: 'null' }, truncated: true });
    expect(parseJsonTree(' \n\t')).toEqual({ root: { kind: 'null' }, truncated: true });
  });

  it('closes what is open when the text ends early, keeping what was read', () => {
    const cases: [string, string][] = [
      ['[', '[]'],
      ['[[[', '[[[]]]'],
      ['[1', '[1]'],
      ['[1.5', '[1.5]'],
      ['[12', '[12]'],
      ['[1.', '[]'],
      ['[1e', '[]'],
      ['[1e+', '[]'],
      ['[-', '[]'],
      ['[1,', '[1]'],
      ['{', '{}'],
      ['{"a', '{}'],
      ['{"a"', '{}'],
      ['{"a":', '{}'],
      ['{"a":tr', '{}'],
      ['{"a":1', '{"a":1}'],
      ['{"a":1,', '{"a":1}'],
      ['{"a":1,"b', '{"a":1}'],
      ['{"a":"xy', '{"a":"xy"}'],
      ['{"a":["x",{"b":"y', '{"a":["x",{"b":"y"}]}'],
      ['"ab', '"ab"'],
      ['"ab\\', '"ab"'],
      ['"ab\\u00', '"ab"'],
      ['"ab\\ud83d', '"ab\\ud83d"'],
      ['[NaN', '[null]'],
      ['[-Infinity', '[null]'],
      ['[Infin', '[]'],
      ['[nul', '[]'],
      ['[true', '[true]'],
      ['tru', 'null'],
    ];
    for (const [text, expected] of cases) {
      const result = parseJsonTree(text);
      expect(result.truncated, text).toBe(true);
      expect(compact(result.root), text).toBe(expected);
    }
  });

  it('stops at malformed text, keeping what was read', () => {
    const cases: [string, string][] = [
      ['[1 2]', '[1]'],
      ['[1,,2]', '[1]'],
      ['[,1]', '[]'],
      ['{1:2}', '{}'],
      ['{"a" 1}', '{}'],
      ['{"a":1 "b":2}', '{"a":1}'],
      ['[01]', '[0]'],
      ['[.5]', '[]'],
      ['[+1]', '[]'],
      ['["\\x41"]', '[""]'],
      ['["a\\qb"]', '["a"]'],
      ['["\\u12G4"]', '[""]'],
      ['[1] [2]', '[1]'],
      ['[1]]', '[1]'],
      ['[}', '[]'],
      ['{]', '{}'],
      ['[True]', '[]'],
      ['[nulls]', '[]'],
      ['[-true]', '[]'],
      ['[infinityx]', '[]'],
      ['x', 'null'],
      ['/* c */ [1]', 'null'],
      ['﻿[1]', 'null'],
    ];
    for (const [text, expected] of cases) {
      const result = parseJsonTree(text);
      expect(result.truncated, text).toBe(true);
      expect(compact(result.root), text).toBe(expected);
    }
  });

  it('never throws and reports truncated at every cut point of a document', () => {
    const doc =
      '{"a":[1.50,-0.0,NaN,-Infinity,170141183460469231731687303715884105727,-12.5e-3],' +
      '"b":{"":true,"":false,"x":null},"s":"q\\"\\\\\\u00e9\\ud83d\\ude00\\ud800 end",' +
      '"e":[],"o":{},"n":[[1,[2,[3]]]],"m":[{"key":1,"value":"v"}],"u":{"tag":"x"}}';
    expect(parseJsonTree(doc).truncated).toBe(false);
    const type = parseDuckDBType('STRUCT(a DOUBLE[], b JSON, s VARCHAR, e INTEGER[], o JSON)');
    for (let cut = 0; cut < doc.length; cut++) {
      const prefix = doc.slice(0, cut);
      const result = parseJsonTree(prefix);
      expect(result.truncated, prefix).toBe(true);
      // What was open got closed: the tree is always whole JSON.
      expect(() => JSON.parse(prettyJson(result.root)), prefix).not.toThrow();
      expect(() => materialize(result.root, undefined, 'value')).not.toThrow();
      expect(() => materialize(result.root, type, 'export')).not.toThrow();
      expect(() => toStandardJson(prefix)).not.toThrow();
    }
  });

  it('never throws on garbage', () => {
    const rnd = prng(20261005);
    const alphabet = [...'[]{}",:-+.0123456789eE truefalsnNaIiy\\u/\t\n'];
    const doc = vector('struct temporal leaves').text;
    for (let round = 0; round < 2000; round++) {
      let text: string;
      if (round % 2 === 0) {
        text = Array.from({ length: Math.floor(rnd() * 40) }, () => pick(rnd, alphabet)).join('');
      } else {
        // A real document with a few characters changed.
        const chars = [...doc];
        for (let k = 0; k < 3; k++) chars[Math.floor(rnd() * chars.length)] = pick(rnd, alphabet);
        text = chars.join('');
      }
      const result = parseJsonTree(text);
      expect(() => JSON.parse(prettyJson(result.root)), text).not.toThrow();
      expect(() => materialize(result.root, undefined, 'export')).not.toThrow();
      expect(() => toStandardJson(text)).not.toThrow();
    }
  });

  it(`reads ${DEEP.toLocaleString('en-US')}-deep nesting`, () => {
    const arrays = parseJsonTree('['.repeat(DEEP) + '1' + ']'.repeat(DEEP));
    expect(arrays.truncated).toBe(false);
    expect(treeDepth(arrays.root)).toEqual({ depth: DEEP, bottom: { kind: 'number', raw: '1' } });

    const objects = parseJsonTree('{"a":'.repeat(DEEP) + 'null' + '}'.repeat(DEEP));
    expect(objects.truncated).toBe(false);
    expect(treeDepth(objects.root)).toEqual({ depth: DEEP, bottom: { kind: 'null' } });

    // Cut after the last key: every container is closed, the key without a value left out.
    const half = DEEP / 2;
    const cut = parseJsonTree('[{"a":'.repeat(half));
    expect(cut.truncated).toBe(true);
    expect(treeDepth(cut.root)).toEqual({
      depth: DEEP - 1,
      bottom: { kind: 'object', entries: [] },
    });
    expect(compact(cut.root)).toBe('[{"a":'.repeat(half - 1) + '[{}]' + '}]'.repeat(half - 1));
  });

  it('reads multi-megabyte text in well under a second', () => {
    const rnd = prng(7);
    const rows: string[] = [];
    let size = 0;
    for (let k = 0; size < 2_100_000; k++) {
      const row =
        `{"id":${k},"x":${(rnd() * 1000).toPrecision(17)},"big":170141183460469231731687303715884105727,` +
        `"s":"word \\"q\\" \\n \\u00e9 ${k}","f":[1.5,NaN,-0.0,${-k}],"m":{"2":"a","1":"b"}}`;
      rows.push(row);
      size += row.length + 1;
    }
    const text = `[${rows.join(',')}]`;
    expect(text.length).toBeGreaterThan(2_000_000);

    // The fastest of up to three runs, stopping at the first under the
    // limit: on a CI runner, with coverage on and other test files' DuckDB
    // work beside it, a single run can pass a second. A parse that is not
    // linear is slow every time.
    const fastestMs = (run: () => void, limit: number): number => {
      let best = Infinity;
      for (let attempt = 0; attempt < 3 && best >= limit; attempt++) {
        const start = performance.now();
        run();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };

    let parsed: ReturnType<typeof parseJsonTree> | undefined;
    const parseMs = fastestMs(() => {
      parsed = parseJsonTree(text);
    }, 1000);
    const { root, truncated } = parsed!;
    expect(truncated).toBe(false);
    expect(root.kind === 'array' && root.items.length).toBe(rows.length);
    expect(parseMs).toBeLessThan(1000);

    const readMs = fastestMs(() => {
      materialize(root, undefined, 'value');
      prettyJson(root);
      toStandardJson(text);
    }, 1000);
    expect(readMs).toBeLessThan(1000);
  });

  it('stays linear on text that would make a naive scan quadratic', () => {
    // Many strings before the one backslash in the text; one long string full
    // of escapes; one full of escaped quotes.
    const manyStrings = `[${'"word",'.repeat(200_000)}"\\n"]`;
    const escapes = `"${'a\\n'.repeat(300_000)}"`;
    const quotes = `["${'\\"'.repeat(300_000)}",NaN]`;

    const start = performance.now();
    const many = parseJsonTree(manyStrings).root;
    const escaped = parseJsonTree(escapes).root;
    const quoted = parseJsonTree(quotes).root;
    const standard = toStandardJson(quotes);
    expect(performance.now() - start).toBeLessThan(1000);

    expect(many.kind === 'array' && many.items.length).toBe(200_001);
    expect(escaped).toEqual({ kind: 'string', value: 'a\n'.repeat(300_000) });
    expect(quoted.kind === 'array' && quoted.items[0]).toEqual({
      kind: 'string',
      value: '"'.repeat(300_000),
    });
    expect(standard.endsWith('",null]')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// jsonNumberToJs
// ---------------------------------------------------------------------------

describe('jsonNumberToJs', () => {
  it('reads integers as numbers while exact, bigints beyond', () => {
    expect(jsonNumberToJs('42')).toBe(42);
    expect(jsonNumberToJs('-12')).toBe(-12);
    expect(jsonNumberToJs('9007199254740991')).toBe(9007199254740991);
    expect(jsonNumberToJs('-9007199254740991')).toBe(-9007199254740991);
    expect(jsonNumberToJs('9007199254740992')).toBe(9007199254740992n);
    expect(jsonNumberToJs('9007199254740993')).toBe(9007199254740993n);
    expect(jsonNumberToJs('-9007199254740993')).toBe(-9007199254740993n);
    expect(jsonNumberToJs('170141183460469231731687303715884105727')).toBe(
      170141183460469231731687303715884105727n,
    );
  });

  it('reads a fraction or an exponent as a double', () => {
    expect(jsonNumberToJs('1.25')).toBe(1.25);
    expect(jsonNumberToJs('100000000000000000000.0')).toBe(1e20);
    expect(jsonNumberToJs('1e21')).toBe(1e21);
    expect(jsonNumberToJs('0.10000000149011612')).toBe(Math.fround(0.1));
    expect(jsonNumberToJs('1e400')).toBe(Infinity);
    expect(Object.is(jsonNumberToJs('-0.0'), -0)).toBe(true);
    expect(Object.is(jsonNumberToJs('-0'), -0)).toBe(true);
  });

  it('reads the words for numbers that are not finite', () => {
    for (const word of ['NaN', 'nan', 'NAN', '-NaN']) expect(jsonNumberToJs(word)).toBeNaN();
    for (const word of ['Infinity', 'inf', 'INF', 'infinity']) {
      expect(jsonNumberToJs(word)).toBe(Infinity);
    }
    for (const word of ['-Infinity', '-inf', '-INF']) expect(jsonNumberToJs(word)).toBe(-Infinity);
  });
});

// ---------------------------------------------------------------------------
// materialize: 'value'
// ---------------------------------------------------------------------------

describe("materialize, 'value' mode", () => {
  it('reads lists of DECIMAL, DOUBLE and FLOAT as numbers', () => {
    expect(read('decimal list')).toEqual([1.25, 2.5]);
    expect(read('double specials')).toEqual([1, NaN, Infinity, -Infinity, -0, 5e-324]);
    expect(Object.is(read('double specials')[4], -0)).toBe(true);
    expect(read('double formats')).toEqual([
      1e-7, 1e21, 1e300, 123456789.125, 0.1, 1, 100, 1e20, 2.5e15,
    ]);
    // FLOAT arrives widened to the double that holds it exactly.
    expect(read('float widened')).toEqual([
      Math.fround(0.1),
      NaN,
      -Infinity,
      -0,
      Math.fround(1e-45),
    ]);
    // DECIMAL is a number even when its digits are an integer past 2^53.
    expect(read('decimal(38,0) max')).toEqual([1e38]);
  });

  it('reads integers as numbers while exact, bigints beyond', () => {
    expect(read('hugeint extremes')).toEqual([
      170141183460469231731687303715884105727n,
      -170141183460469231731687303715884105728n,
    ]);
    expect(read('ubigint max')).toEqual([18446744073709551615n]);
    expect(read('bigint extremes')).toEqual([
      9223372036854775807n,
      -9223372036854775808n,
      9007199254740993n,
      9007199254740991,
      -9007199254740993n,
    ]);
    expect(read('list with nulls')).toEqual([4, null, 17]);
    expect(read('fixed array')).toEqual([1, 2, 3]);
    expect(read('list of arrays')).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('reads MAP as a Map in key order, keys typed by the key type', () => {
    const integerKeys = read('map integer keys') as Map<unknown, unknown>;
    expect(integerKeys).toBeInstanceOf(Map);
    expect([...integerKeys]).toEqual([
      [2, 'a'],
      [1, 'b'],
      [10, 'c'],
    ]);
    expect([...read('map decimal keys')]).toEqual([
      [1.5, 'a'],
      [2.25, 'b'],
    ]);
    expect([...read('map boolean keys')]).toEqual([
      [true, 'a'],
      [false, 'b'],
    ]);
    expect([...read('map ubigint keys')]).toEqual([
      [18446744073709551615n, 'a'],
      [1, 'b'],
    ]);
    expect([...read('map hugeint keys')]).toEqual([
      [170141183460469231731687303715884105727n, 'h'],
      [-5, 'n'],
    ]);
    // DuckDB's text for doubles: nan, inf, -inf, -0.0, 1e+300. (A Map keeps -0 as 0.)
    expect([...read('map double keys').keys()]).toEqual([
      NaN,
      Infinity,
      -Infinity,
      0,
      1e300,
      Math.fround(0.1),
    ]);
    expect(read('map empty')).toEqual(new Map());
  });

  it('keeps MAP keys of other types as their text: dates, STRUCT and LIST keys', () => {
    expect([...read('map date keys')]).toEqual([
      ['2024-01-01', [1, 2]],
      ['2024-01-02', []],
    ]);
    expect([...read('map struct keys')]).toEqual([
      ["{'k': 1}", 'a'],
      ["{'k': 2}", 'b'],
    ]);
    expect([...read('map list keys')]).toEqual([
      ['[1, 2]', 'a'],
      ['[3]', 'b'],
    ]);
    expect([...read('map struct values')]).toEqual([
      ['a', { x: 1, y: 'p' }],
      ['b', null],
    ]);
  });

  it('keeps MAP keys that are names of Object.prototype members or of Map members', () => {
    const map = read('map odd keys') as Map<string, number>;
    expect([...map.keys()]).toEqual([
      '__proto__',
      'constructor',
      'toJSON',
      'size',
      'hasOwnProperty',
      '2',
      '1',
      'k=v',
      '"q"',
      'a\\b',
    ]);
    expect(map.size).toBe(10);
    expect(map.get('size')).toBe(4);
    expect(map.get('__proto__')).toBe(1);
    expect(structuredClone(map)).toEqual(map);
  });

  it('reads UNION as { tag: value }', () => {
    expect(read('union int')).toEqual({ num: 42 });
    expect(read('union str')).toEqual({ str: 'hi' });
    expect(read('union null member')).toEqual({ num: null });
    expect(read('union list member')).toEqual({ l: [1, 2] });
    expect(read('union struct member')).toEqual({ s: { a: 7 } });
    expect(read('union huge member')).toEqual({ h: 170141183460469231731687303715884105727n });
    expect(read('union double member')).toEqual({ d: NaN });
    expect(read('list of unions')).toEqual([{ num: 1 }, null, { str: '0' }]);
  });

  it('reads a STRUCT with a field named "" as an object, the field under ""', () => {
    expect(read('struct empty name')).toEqual({ b: 2, '': 1 });
    expect(read('struct empty name through variant')).toEqual({ b: 2, '': 1, v: 7 });
    expect(read('struct empty name', 'export')).toEqual({ b: 2, '': 1 });
  });

  it('reads a STRUCT with unnamed fields as an array', () => {
    expect(read('unnamed struct')).toEqual([1, 'a']);
    expect(read('unnamed struct huge')).toEqual([
      170141183460469231731687303715884105727n,
      340282366920938463463374607431768211455n,
    ]);
  });

  it('reads a STRUCT as an object keyed by field name', () => {
    expect(read('struct point')).toEqual({ x: 1.25, y: 0.58, tier: 'bronze' });
    expect(read('struct nested')).toEqual({
      owner: { contact: { email: 'a@b.c', phones: ['1', '2'] } },
      n: 3,
    });
    expect(read('struct all null')).toEqual({ x: null, y: null });
    expect(read('list of structs')).toEqual([
      { name: 'ann', age: 3, langs: ['en', 'fr'] },
      null,
      { name: null, age: null, langs: [] },
    ]);
    const odd = read('struct odd names');
    expect(odd).toEqual({
      'my field': 1,
      'x,y': 2,
      'quote"d': 3,
      "it's": 4,
      ünï: 5,
      'emoji😀': 6,
      SELECT: 7,
      null: 8,
      '2': 9,
      '1': 10,
      '10': 11,
    });
    // A JS object lists integer-like keys first; the tree keeps the struct's order.
    expect(Object.keys(odd).slice(0, 4)).toEqual(['1', '2', '10', 'my field']);
  });

  it('keeps DuckDB text for dates, times, UUIDs, INTERVALs, BLOBs, ENUMs and BITs', () => {
    expect(read('struct temporal leaves')).toEqual({
      d: '2024-02-29',
      ts: '2024-01-02 03:04:05.123456',
      tstz: '2024-01-02 03:04:05+00',
      t: '12:34:56',
      tns: '2024-01-02 03:04:05.123456789',
      u: '123e4567-e89b-12d3-a456-426614174000',
      i: '1 year 2 months 3 days 04:05:06',
      b: '\\xAA\\x00ab',
      e: 'y,z',
      bit: '0101',
    });
    expect(read('interval list')).toEqual(['1 day', '2 months 03:00:00', '-1 year']);
    expect(read('bit list')).toEqual(['0101', '1']);
    expect(read('blob list')).toEqual(['\\xAA\\x00ab', 'plain']);
    expect(read('uuid list')).toEqual(['123e4567-e89b-12d3-a456-426614174000']);
    expect(read('enum list')).toEqual(['y,z', 'x']);
  });

  it('keeps a number where the type says text as its digits', () => {
    expect(read('bignum list')).toEqual([
      '12345678901234566660398341115085767575755770822656',
      '-1',
    ]);
    expect(
      materialize(parseJsonTree('[123,1.50,NaN]').root, parseDuckDBType('VARCHAR[]'), 'value'),
    ).toEqual(['123', '1.50', 'NaN']);
  });

  it('keeps strings as they are, "NaN" and escapes included', () => {
    expect(read('list nan text')).toEqual([
      ['NaN', 'Infinity', '-Infinity'],
      ['nan', 'inf'],
    ]);
    const strings = read('list string escapes') as string[];
    expect(strings[0]).toBe("it's");
    expect(strings.at(-1)).toBe('{"a": NaN}');
    expect(strings).toContain('\u0000');
  });

  it('reads JSON values from the JSON alone, the last of two equal keys winning', () => {
    expect(read('struct json')).toEqual({ j: { a: 3, b: [1, 2] }, k: 2 });
    expect(read('struct json lenient')).toEqual({
      a: NaN,
      b: Infinity,
      c: [NaN, Infinity, Infinity, Infinity],
    });
    expect(read('json list')).toEqual([{ a: 1 }, [1, 2], null, 's', [1, 2]]);
    expect(read('json text duplicates')).toEqual({ a: 2, '2': 3, '1': 4 });
    expect(read('json text lenient numbers')).toEqual([
      NaN,
      Infinity,
      -Infinity,
      Infinity,
      -Infinity,
      NaN,
      Infinity,
      NaN,
      Infinity,
      -0,
      100000,
    ]);
    // The first of two equal keys sets the key's place, as JSON.parse does.
    expect(Object.keys(generic('{"a":1,"b":2,"a":3}'))).toEqual(['a', 'b']);
  });

  it('reads values that went through VARIANT', () => {
    // A MAP cast to VARIANT arrives as a list of {key, value}.
    expect([...read('variant map varchar')]).toEqual([
      ['a', 1],
      ['b', 'x'],
    ]);
    expect([...read('variant map integer')]).toEqual([
      [2, 1],
      [1, 2],
    ]);
    // A UNION cast to VARIANT has lost its tag: its bare value.
    expect(read('variant struct with union')).toEqual({ k: 1, u: 4 });
    // A struct member whose one field is named like a member is still the
    // struct, read from its JSON: not that member, which would read
    // 9007199254740993 as a DOUBLE, or 5 as text.
    expect(read('variant union struct member named like a tag')).toEqual({
      u: { b: 9007199254740993n },
      v: 1,
    });
    expect(read('variant union struct member named like a text tag')).toEqual({
      u: { n: 5 },
      v: 1,
    });
    expect(read('variant union struct member named like a tag', 'export')).toEqual({
      u: { b: '9007199254740993' },
      v: 1,
    });
    expect(read('variant union double member')).toEqual({ u: 2.5, v: 'x' });
    expect(read('variant list of leaves')).toEqual([
      '2024-01-01',
      '\\xAA',
      170141183460469231731687303715884105727n,
      '123e4567-e89b-12d3-a456-426614174000',
      '1 day',
      Math.fround(0.1),
      NaN,
      '01:02:03',
      true,
      null,
    ]);
    expect(read('variant scalar struct')).toEqual({ a: 1.5, b: NaN });
    expect(read('variant scalar')).toBe(42);
    expect(read('variant null')).toBeNull();
  });

  it('reads any key of a MAP that went through VARIANT', () => {
    const as = (text: string, type: string, mode: 'value' | 'export' = 'value') =>
      materialize(parseJsonTree(text).root, parseDuckDBType(type), mode) as Map<unknown, unknown>;
    // A STRUCT key is its JSON text; `value` may come before `key`.
    const structKeys = '[{"value":true,"key":{"k":1}},{"key":{"k":2},"value":false}]';
    expect([...as(structKeys, 'MAP(STRUCT(k INTEGER), BOOLEAN)')]).toEqual([
      ['{"k":1}', true],
      ['{"k":2}', false],
    ]);
    expect(as(structKeys, 'MAP(STRUCT(k INTEGER), BOOLEAN)', 'export')).toEqual({
      '{"k":1}': true,
      '{"k":2}': false,
    });
    expect([
      ...as('[{"key":true,"value":1},{"key":null,"value":2}]', 'MAP(BOOLEAN, INTEGER)'),
    ]).toEqual([
      [true, 1],
      ['null', 2],
    ]);
  });

  it('reads null as null at any level', () => {
    for (const type of ['INTEGER[]', 'STRUCT(a INTEGER)', 'MAP(VARCHAR, INTEGER)', 'JSON']) {
      expect(materialize({ kind: 'null' }, parseDuckDBType(type), 'value')).toBeNull();
    }
    expect(
      materialize(parseJsonTree('[null,[null]]').root, parseDuckDBType('INTEGER[][]'), 'value'),
    ).toEqual([null, [null]]);
  });

  it('reads from the JSON alone with no type, JSON, VARIANT or an unreadable type', () => {
    const text = '{"a":[1,9007199254740993,1.5,NaN],"b":{"c":null},"d":"2024-01-01","e":true}';
    const expected = {
      a: [1, 9007199254740993n, 1.5, NaN],
      b: { c: null },
      d: '2024-01-01',
      e: true,
    };
    const { root } = parseJsonTree(text);
    for (const type of [undefined, 'JSON', 'VARIANT', 'NOT A TYPE(']) {
      const node = type === undefined ? undefined : parseDuckDBType(type);
      expect(materialize(root, node, 'value'), String(type)).toEqual(expected);
    }
  });

  it('reads a value whose shape does not fit its type from the JSON alone', () => {
    const as = (text: string, type: string) =>
      materialize(parseJsonTree(text).root, parseDuckDBType(type), 'value');
    expect(as('{"a":1}', 'INTEGER[]')).toEqual({ a: 1 });
    expect(as('[1,2]', 'STRUCT(a INTEGER)')).toEqual([1, 2]);
    expect(as('"text"', 'MAP(VARCHAR, INTEGER)')).toBe('text');
    expect(as('[1,2]', 'MAP(VARCHAR, INTEGER)')).toEqual([1, 2]);
    expect(as('[{"a":1,"b":2}]', 'MAP(VARCHAR, INTEGER)')).toEqual([{ a: 1, b: 2 }]);
    expect(as('{"num":1,"str":"x"}', 'UNION(num INTEGER, str VARCHAR)')).toEqual({
      num: 1,
      str: 'x',
    });
    expect(as('{"other":1}', 'UNION(num INTEGER, str VARCHAR)')).toEqual({ other: 1 });
    expect(as('"12"', 'INTEGER')).toBe('12');
    expect(as('1', 'BOOLEAN')).toBe(1);
  });

  it('matches a UNION tag regardless of case', () => {
    expect(
      materialize(
        parseJsonTree('{"NUM":"7"}').root,
        parseDuckDBType('UNION(num VARCHAR)'),
        'value',
      ),
    ).toEqual({ NUM: '7' });
  });

  it('keeps STRUCT entries beyond the type, and reads a STRUCT cut short', () => {
    const type = parseDuckDBType('STRUCT(a INTEGER, b DOUBLE)');
    expect(
      materialize(parseJsonTree('{"a":1,"b":2,"c":9007199254740993}').root, type, 'value'),
    ).toEqual({ a: 1, b: 2, c: 9007199254740993n });
    const cut = parseJsonTree('{"a":1,"b":2.');
    expect(cut.truncated).toBe(true);
    expect(materialize(cut.root, type, 'value')).toEqual({ a: 1 });
  });

  it('never touches a prototype, and keeps such keys as own data properties', () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    const struct = read('struct proto keys');
    const generic1 = generic(
      '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}}}',
    );
    const union = materialize(
      parseJsonTree('{"__proto__":{"polluted":3}}').root,
      parseDuckDBType('UNION(__proto__ STRUCT(polluted INTEGER), b VARCHAR)'),
      'value',
    );
    const nested = materialize(
      parseJsonTree('{"__proto__":{"polluted":4}}').root,
      parseDuckDBType('STRUCT(__proto__ STRUCT(polluted INTEGER))'),
      'value',
    );

    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
    for (const value of [struct, generic1, union, nested]) {
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(Object.hasOwn(value, '__proto__')).toBe(true);
      expect(value.polluted).toBeUndefined();
    }

    expect(Object.keys(struct)).toEqual(['__proto__', 'constructor', 'toJSON', 'hasOwnProperty']);
    expect(struct.__proto__).toBe(1);
    expect(struct.constructor).toBe(2);
    expect(JSON.stringify(struct)).toBe(
      '{"__proto__":1,"constructor":2,"toJSON":3,"hasOwnProperty":4}',
    );
    const clone = structuredClone(struct);
    expect(Object.keys(clone)).toEqual(['__proto__', 'constructor', 'toJSON', 'hasOwnProperty']);
    expect(Object.hasOwn(clone, '__proto__')).toBe(true);
    expect(clone.__proto__).toBe(1);

    expect(generic1.__proto__).toEqual({ polluted: 1 });
    expect(union.__proto__).toEqual({ polluted: 3 });
    expect(nested.__proto__).toEqual({ polluted: 4 });
    expect(JSON.stringify(nested)).toBe('{"__proto__":{"polluted":4}}');
  });

  it('defines a key over any inherited accessor instead of calling it', () => {
    let called = false;
    Object.defineProperty(Object.prototype, 'zzTrap', {
      set() {
        called = true;
      },
      configurable: true,
    });
    try {
      const value = generic('{"zzTrap":1}');
      expect(called).toBe(false);
      expect(Object.hasOwn(value, 'zzTrap')).toBe(true);
      expect(value.zzTrap).toBe(1);
    } finally {
      delete (Object.prototype as any).zzTrap;
    }
  });

  it(`materializes ${DEEP.toLocaleString('en-US')}-deep JSON and VARIANT values`, () => {
    const arrays = parseJsonTree('['.repeat(DEEP) + '1' + ']'.repeat(DEEP)).root;
    const objects = parseJsonTree('{"a":'.repeat(DEEP) + '"x"' + '}'.repeat(DEEP)).root;
    for (const type of [undefined, parseDuckDBType('JSON'), parseDuckDBType('VARIANT')]) {
      expect(chainDepth(materialize(arrays, type, 'value'))).toEqual({ depth: DEEP, bottom: 1 });
      expect(chainDepth(materialize(objects, type, 'export'))).toEqual({
        depth: DEEP,
        bottom: 'x',
      });
    }
    // Deep JSON inside typed containers.
    const inList = parseJsonTree(`[${'['.repeat(DEEP)}null${']'.repeat(DEEP)}]`).root;
    expect(chainDepth(materialize(inList, parseDuckDBType('VARIANT[]'), 'value'))).toEqual({
      depth: DEEP + 1,
      bottom: null,
    });
  });
});

// ---------------------------------------------------------------------------
// materialize: 'export'
// ---------------------------------------------------------------------------

describe("materialize, 'export' mode", () => {
  it('writes MAP as an object keyed by the key text', () => {
    const integerKeys = read('map integer keys', 'export');
    expect(integerKeys).not.toBeInstanceOf(Map);
    expect(Object.getPrototypeOf(integerKeys)).toBe(Object.prototype);
    expect(integerKeys).toEqual({ '2': 'a', '1': 'b', '10': 'c' });
    expect(read('map double keys', 'export')).toEqual({
      nan: 'a',
      inf: 'b',
      '-inf': 'c',
      '-0.0': 'd',
      '1e+300': 'e',
      '0.10000000149011612': 'f',
    });
    expect(read('map struct keys', 'export')).toEqual({ "{'k': 1}": 'a', "{'k': 2}": 'b' });
    expect(read('map ubigint keys', 'export')).toEqual({ '18446744073709551615': 'a', '1': 'b' });
    expect(read('variant map integer', 'export')).toEqual({ '2': 1, '1': 2 });
    expect(read('map empty', 'export')).toEqual({});

    const odd = read('map odd keys', 'export');
    expect(Object.hasOwn(odd, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(odd)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(odd))).toEqual({
      ['__proto__']: 1,
      constructor: 2,
      toJSON: 3,
      size: 4,
      hasOwnProperty: 5,
      '2': 6,
      '1': 7,
      'k=v': 8,
      '"q"': 9,
      'a\\b': 10,
    });
  });

  it('writes integers beyond ±(2^53−1) as decimal strings', () => {
    expect(read('hugeint extremes', 'export')).toEqual([
      '170141183460469231731687303715884105727',
      '-170141183460469231731687303715884105728',
    ]);
    expect(read('bigint extremes', 'export')).toEqual([
      '9223372036854775807',
      '-9223372036854775808',
      '9007199254740993',
      9007199254740991,
      '-9007199254740993',
    ]);
    expect(read('unnamed struct huge', 'export')).toEqual([
      '170141183460469231731687303715884105727',
      '340282366920938463463374607431768211455',
    ]);
    expect(read('union huge member', 'export')).toEqual({
      h: '170141183460469231731687303715884105727',
    });
  });

  it('writes NaN and ±Infinity as null', () => {
    expect(read('double specials', 'export')).toEqual([1, null, null, null, -0, 5e-324]);
    expect(read('struct json lenient', 'export')).toEqual({
      a: null,
      b: null,
      c: [null, null, null, null],
    });
    expect(read('union double member', 'export')).toEqual({ d: null });
  });

  it('writes everything else as value mode does', () => {
    expect(read('struct temporal leaves', 'export')).toEqual(read('struct temporal leaves'));
    expect(read('list of structs', 'export')).toEqual(read('list of structs'));
    expect(read('unnamed struct', 'export')).toEqual([1, 'a']);
    expect(read('union struct member', 'export')).toEqual({ s: { a: 7 } });
    expect(read('variant list of leaves', 'export')).toEqual([
      '2024-01-01',
      '\\xAA',
      '170141183460469231731687303715884105727',
      '123e4567-e89b-12d3-a456-426614174000',
      '1 day',
      Math.fround(0.1),
      null,
      '01:02:03',
      true,
      null,
    ]);
  });

  it('gives only what JSON.stringify writes as it is, for every vector', () => {
    for (const v of TO_JSON) {
      const value = read(v.name, 'export');
      assertJsonSafe(value);
      expect(() => JSON.stringify(value), v.name).not.toThrow();
    }
  });

  it("follows formatValueForJSON's rules for numbers", () => {
    for (const name of [
      'bigint extremes',
      'hugeint extremes',
      'double specials',
      'float widened',
    ]) {
      const values = read(name) as unknown[];
      expect(read(name, 'export'), name).toEqual(values.map((v) => formatValueForJSON(v)));
    }
  });
});

// ---------------------------------------------------------------------------
// prettyJson
// ---------------------------------------------------------------------------

describe('prettyJson', () => {
  it('lays text out as JSON.stringify(value, null, 2) does', () => {
    const text = '{"a":[1,{"b":null,"c":[]},{}],"d":"x","e":{"f":[true,false]}}';
    expect(prettyJson(parseJsonTree(text).root)).toBe(JSON.stringify(JSON.parse(text), null, 2));
    expect(prettyJson(parseJsonTree('[]').root)).toBe('[]');
    expect(prettyJson(parseJsonTree('{}').root)).toBe('{}');
    expect(prettyJson(parseJsonTree('"s"').root)).toBe('"s"');
  });

  it('keeps key order and duplicate keys', () => {
    expect(prettyJson(parseJsonTree('{"2":1,"1":2,"10":3}').root)).toBe(
      '{\n  "2": 1,\n  "1": 2,\n  "10": 3\n}',
    );
    expect(compact(treeOf('unnamed struct'))).toBe('{"":1,"":"a"}');
    expect(compact(treeOf('json text duplicates'))).toBe('{"a":1,"a":2,"2":3,"1":4}');
    expect(compact(treeOf('struct odd names'))).toBe(vector('struct odd names').text);
  });

  it('keeps number lexemes, writing those that are not finite as null', () => {
    expect(compact(treeOf('hugeint extremes'))).toBe(vector('hugeint extremes').text);
    expect(compact(treeOf('decimal(38,0) max'))).toBe(vector('decimal(38,0) max').text);
    expect(compact(treeOf('double formats'))).toBe(vector('double formats').text);
    expect(compact(treeOf('double specials'))).toBe('[1.0,null,null,null,-0.0,5e-324]');
    expect(compact(treeOf('json text lenient numbers'))).toBe(
      '[null,null,null,null,null,null,null,null,1e400,-0,1E5]',
    );
    expect(compact(parseJsonTree('{"v":1.50}').root)).toBe('{"v":1.50}');
    // A node not made by the parser whose text is not a JSON number.
    expect(compact({ kind: 'number', raw: '1.' })).toBe('null');
  });

  it('escapes strings as JSON.stringify does', () => {
    const strings = [
      'plain',
      'q"uote',
      'back\\slash',
      '/',
      '\b\f\n\r\t',
      '\u0000\u0001\u001f',
      '\u007f  ',
      'é é שלום 😀',
      '\ud800',
      '\udc00',
      'a\ude00\ud83db',
      '',
    ];
    for (const s of strings) {
      expect(prettyJson({ kind: 'string', value: s })).toBe(JSON.stringify(s));
      expect(compact({ kind: 'object', entries: [{ key: s, value: { kind: 'null' } }] })).toBe(
        `{${JSON.stringify(s)}:null}`,
      );
    }
  });

  it('takes an indent as JSON.stringify does', () => {
    const value = { a: [1, { b: 2 }], c: {} };
    const root = parseJsonTree(JSON.stringify(value)).root;
    expect(prettyJson(root, 0)).toBe(JSON.stringify(value));
    expect(prettyJson(root, 4)).toBe(JSON.stringify(value, null, 4));
    expect(prettyJson(root, 10)).toBe(JSON.stringify(value, null, 10));
    expect(prettyJson(root, 12)).toBe(JSON.stringify(value, null, 12));
    expect(prettyJson(root, 2.7)).toBe(JSON.stringify(value, null, 2.7));
    expect(prettyJson(root, -1)).toBe(JSON.stringify(value, null, -1));
    expect(prettyJson(root, NaN)).toBe(JSON.stringify(value, null, NaN));
  });

  it('writes standard JSON for every vector', () => {
    for (const v of TO_JSON) {
      const root = treeOf(v.name);
      expect(() => JSON.parse(prettyJson(root)), v.name).not.toThrow();
      expect(() => JSON.parse(compact(root)), v.name).not.toThrow();
    }
  });

  it(`writes ${DEEP.toLocaleString('en-US')}-deep nesting`, () => {
    const arrays = '['.repeat(DEEP) + '1' + ']'.repeat(DEEP);
    const objects = '{"a":'.repeat(DEEP) + '{}' + '}'.repeat(DEEP);
    expect(compact(parseJsonTree(arrays).root)).toBe(arrays);
    expect(compact(parseJsonTree(objects).root)).toBe(objects);
    expect(compact(parseJsonTree('['.repeat(DEEP)).root)).toBe('['.repeat(DEEP) + ']'.repeat(DEEP));
    // Indented, the text grows with the square of the depth; 1,000 levels make 2 MB.
    const shallower = '[{"a":'.repeat(500) + 'NaN' + '}]'.repeat(500);
    expect(prettyJson(parseJsonTree(shallower).root)).toBe(
      JSON.stringify(JSON.parse(shallower.replace('NaN', 'null')), null, 2),
    );
  });
});

// ---------------------------------------------------------------------------
// toStandardJson
// ---------------------------------------------------------------------------

describe('toStandardJson', () => {
  it('makes every vector standard JSON that reads as the tree does', () => {
    for (const v of TO_JSON) {
      const standard = toStandardJson(v.text);
      expect(() => JSON.parse(standard), v.name).not.toThrow();
      expect(compact(parseJsonTree(standard).root), v.name).toBe(compact(treeOf(v.name)));
    }
  });

  it('replaces the words for numbers that are not finite with null', () => {
    expect(toStandardJson(vector('double specials').text)).toBe('[1.0,null,null,null,-0.0,5e-324]');
    expect(toStandardJson(vector('list double nested').text)).toBe('[[1.5,null],[null,null],[]]');
    expect(toStandardJson(vector('struct json lenient').text)).toBe(
      '{"a":null,"b":null,"c":[null,null,null,1e400]}',
    );
    expect(toStandardJson(vector('json text lenient numbers').text)).toBe(
      '[null, null, null, null, null, null, null, null, 1e400, -0, 1E5]',
    );
    expect(toStandardJson('NaN')).toBe('null');
    expect(toStandardJson('-Infinity')).toBe('null');
  });

  it('keeps every digit, so big integers stay exact', () => {
    expect(toStandardJson(vector('hugeint extremes').text)).toBe(vector('hugeint extremes').text);
    expect(toStandardJson(vector('variant list of leaves').text)).toBe(
      vector('variant list of leaves').text.replace(',NaN,', ',null,'),
    );
  });

  it('never touches strings, even when they read NaN or Infinity', () => {
    for (const name of ['list nan text', 'list string escapes', 'map double keys']) {
      expect(toStandardJson(vector(name).text), name).toBe(vector(name).text);
    }
    // Escaped quotes and backslashes do not end a string early.
    expect(toStandardJson('["a\\\\",NaN,"b\\"NaN",{"Infinity":inf}]')).toBe(
      '["a\\\\",null,"b\\"NaN",{"Infinity":null}]',
    );
    expect(toStandardJson('["info, financial, banana"]')).toBe('["info, financial, banana"]');
  });

  it('drops a trailing comma before ] or }', () => {
    expect(toStandardJson(vector('json text trailing commas').text)).toBe(
      '{"a":[1,2],"b":{"c":1}}',
    );
    expect(toStandardJson('[1, NaN ,\n]')).toBe('[1, null \n]');
    expect(toStandardJson('[",]"]')).toBe('[",]"]');
  });

  it('leaves text it has nothing to change alone', () => {
    for (const name of ['struct point', 'map odd keys', 'list of structs', 'json list']) {
      expect(toStandardJson(vector(name).text), name).toBe(vector(name).text);
    }
  });

  it(`handles ${DEEP.toLocaleString('en-US')}-deep text`, () => {
    expect(toStandardJson('['.repeat(DEEP) + '-NaN' + ']'.repeat(DEEP))).toBe(
      '['.repeat(DEEP) + 'null' + ']'.repeat(DEEP),
    );
  });
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

const NUMBER_LEXEMES = [
  '0',
  '-0',
  '1',
  '-12',
  '1.50',
  '-0.0',
  '0.1',
  '1e-7',
  '5E+3',
  '-2.5e10',
  '1e400',
  '9007199254740991',
  '9007199254740993',
  '-9223372036854775808',
  '170141183460469231731687303715884105727',
  '99999999999999999999999999999999999999',
  'NaN',
  'Infinity',
  '-Infinity',
  'nan',
  'inf',
  '-inf',
  'INF',
  '-NaN',
];

const CHARACTERS = [
  'a',
  'Z',
  '0',
  ' ',
  '"',
  '\\',
  '/',
  '\n',
  '\t',
  '\u0000',
  '\u001f',
  '\u007f',
  'é',
  'é',
  '😀',
  '\ud800',
  '\udc00',
  ' ',
  'NaN',
  'Infinity',
  ',',
  ']',
  '}',
  ':',
  'שלום',
];

const KEYS = [
  '',
  'a',
  'b',
  '2',
  '1',
  '10',
  '__proto__',
  'constructor',
  'toJSON',
  'hasOwnProperty',
  'my field',
  'quote"d',
  'emoji😀',
  'NaN',
];

function randomString(rnd: () => number): string {
  return Array.from({ length: Math.floor(rnd() * 8) }, () => pick(rnd, CHARACTERS)).join('');
}

function randomNumber(rnd: () => number): string {
  if (rnd() < 0.5) return pick(rnd, NUMBER_LEXEMES);
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');
  const leading = String(1 + Math.floor(rnd() * 9));
  let raw =
    (rnd() < 0.3 ? '-' : '') + (rnd() < 0.2 ? '0' : leading + digits(Math.floor(rnd() * 25)));
  if (rnd() < 0.4) raw += '.' + digits(1 + Math.floor(rnd() * 6));
  if (rnd() < 0.3)
    raw += pick(rnd, ['e', 'E']) + pick(rnd, ['', '+', '-']) + digits(1 + Math.floor(rnd() * 3));
  return raw;
}

function randomTree(rnd: () => number, depth: number): JsonNode {
  const r = rnd();
  if (depth <= 0 || r < 0.45) {
    const leaf = rnd();
    if (leaf < 0.35) return { kind: 'number', raw: randomNumber(rnd) };
    if (leaf < 0.75) return { kind: 'string', value: randomString(rnd) };
    if (leaf < 0.9) return { kind: 'boolean', value: rnd() < 0.5 };
    return { kind: 'null' };
  }
  const count = Math.floor(rnd() * 5);
  if (r < 0.72) {
    return {
      kind: 'array',
      items: Array.from({ length: count }, () => randomTree(rnd, depth - 1)),
    };
  }
  const entries: JsonEntry[] = Array.from({ length: count }, () => ({
    key: rnd() < 0.5 ? pick(rnd, KEYS) : randomString(rnd),
    value: randomTree(rnd, depth - 1),
  }));
  return { kind: 'object', entries };
}

/** The tree with numbers that are not finite as null, as standard JSON has them. */
function standardTree(node: JsonNode): JsonNode {
  switch (node.kind) {
    case 'number':
      // Every JSON number starts with a digit or a minus and a digit; the words do not.
      return /^-?\d/.test(node.raw) ? node : { kind: 'null' };
    case 'array':
      return { kind: 'array', items: node.items.map(standardTree) };
    case 'object':
      return {
        kind: 'object',
        entries: node.entries.map((e) => ({ key: e.key, value: standardTree(e.value) })),
      };
    default:
      return node;
  }
}

/**
 * The tree written the way DuckDB writes and accepts JSON: words for numbers
 * that are not finite kept, and (with `loose`) whitespace and trailing commas.
 */
function duckText(node: JsonNode, rnd: () => number, loose: boolean): string {
  const space = () => (loose && rnd() < 0.3 ? pick(rnd, [' ', '\n', '\t', '\r\n', '  ']) : '');
  const trailing = (count: number) => (loose && count > 0 && rnd() < 0.3 ? ',' + space() : '');
  switch (node.kind) {
    case 'number':
      return node.raw;
    case 'string':
      return JSON.stringify(node.value);
    case 'boolean':
      return String(node.value);
    case 'null':
      return 'null';
    case 'array':
      return (
        '[' +
        space() +
        node.items.map((item) => duckText(item, rnd, loose) + space()).join(',' + space()) +
        trailing(node.items.length) +
        ']'
      );
    case 'object':
      return (
        '{' +
        space() +
        node.entries
          .map(
            (e) =>
              JSON.stringify(e.key) +
              space() +
              ':' +
              space() +
              duckText(e.value, rnd, loose) +
              space(),
          )
          .join(',' + space()) +
        trailing(node.entries.length) +
        '}'
      );
  }
}

/** A JSON-safe JS value with no integer-like keys, so JSON.parse keeps its key order. */
function randomValue(rnd: () => number, depth: number): unknown {
  const r = rnd();
  if (depth <= 0 || r < 0.5) {
    const leaf = rnd();
    if (leaf < 0.3) return randomString(rnd);
    if (leaf < 0.6) {
      // Integers stay within 2^53 or are written with an exponent (≥ 1e21),
      // so JSON.parse reads every one exactly as the tree does.
      const kind = rnd();
      if (kind < 0.3) return Math.floor((rnd() - 0.5) * 2e6);
      if (kind < 0.8) return (rnd() - 0.5) * 10 ** Math.floor(rnd() * 22 - 10);
      if (kind < 0.9) return Number(`${1 + Math.floor(rnd() * 9)}e${21 + Math.floor(rnd() * 280)}`);
      return pick(rnd, [-0, 5e-324, 1.7976931348623157e308, -1e-7, 0.1]);
    }
    if (leaf < 0.8) return rnd() < 0.5;
    return null;
  }
  const count = Math.floor(rnd() * 5);
  if (r < 0.75) return Array.from({ length: count }, () => randomValue(rnd, depth - 1));
  const out: Record<string, unknown> = {};
  for (let k = 0; k < count; k++) {
    let key = randomString(rnd);
    if (/^(0|[1-9]\d*)$/.test(key) || key === '__proto__') key = `k${key}`;
    out[key] = randomValue(rnd, depth - 1);
  }
  return out;
}

describe('round trips (seeded)', () => {
  it('tree → prettyJson → parseJsonTree → prettyJson is stable', () => {
    const rnd = prng(1);
    for (let round = 0; round < 400; round++) {
      const tree = randomTree(rnd, 6);
      for (const indent of [0, 2]) {
        const first = prettyJson(tree, indent);
        const parsed = parseJsonTree(first);
        expect(parsed.truncated).toBe(false);
        expect(parsed.root).toEqual(standardTree(tree));
        expect(prettyJson(parsed.root, indent)).toBe(first);
        expect(() => JSON.parse(first)).not.toThrow();
      }
    }
  });

  it('DuckDB-style text → parseJsonTree gives the tree back; toStandardJson agrees', () => {
    const rnd = prng(2);
    for (let round = 0; round < 400; round++) {
      const tree = randomTree(rnd, 6);
      const loose = round % 2 === 1;
      const text = duckText(tree, rnd, loose);
      const parsed = parseJsonTree(text);
      expect(parsed.truncated, text).toBe(false);
      expect(parsed.root).toEqual(tree);
      const standard = toStandardJson(text);
      expect(JSON.parse(standard)).toEqual(JSON.parse(prettyJson(tree)));
      if (!loose) expect(standard).toBe(compact(standardTree(tree)));
    }
  });

  it('JSON.stringify output → parseJsonTree → prettyJson equals JSON.stringify', () => {
    const rnd = prng(3);
    for (let round = 0; round < 400; round++) {
      const text = JSON.stringify(randomValue(rnd, 6));
      const { root, truncated } = parseJsonTree(text);
      expect(truncated).toBe(false);
      expect(prettyJson(root, 2)).toBe(JSON.stringify(JSON.parse(text), null, 2));
      expect(prettyJson(root, 0)).toBe(text);
      expect(materialize(root, undefined, 'value')).toEqual(JSON.parse(text));
      expect(materialize(root, undefined, 'export')).toEqual(JSON.parse(text));
    }
  });
});
