import { describe, it, expect } from 'vitest';
import {
  MAX_TYPE_DEPTH,
  childTypes,
  containsKind,
  dataTypeOf,
  holdsVariant,
  isTimeWithTimeZone,
  needsTextMatch,
  parseDuckDBType,
  type DuckDBTypeNode,
} from '@/core/duckdbType';

import { MANIFEST } from '../helpers/nestedFixture';
import { SQL_ONLY_COLUMNS } from '../helpers/nestedSql';

/** A compact rendering of a tree, to compare whole shapes at once. */
function shape(node: DuckDBTypeNode): string {
  switch (node.kind) {
    case 'scalar':
      return node.args.length > 0 ? `${node.name}(${node.args.join('|')})` : node.name;
    case 'json':
      return 'JSON';
    case 'variant':
      return 'VARIANT';
    case 'list':
      return `list<${shape(node.element)}>`;
    case 'array':
      return `array${node.size}<${shape(node.element)}>`;
    case 'struct':
      return `struct{${node.fields
        .map((f) => (f.name === null ? shape(f.type) : `${f.name}: ${shape(f.type)}`))
        .join(', ')}}`;
    case 'map':
      return `map<${shape(node.key)}, ${shape(node.value)}>`;
    case 'union':
      return `union{${node.members.map((m) => `${m.tag}: ${shape(m.type)}`).join(', ')}}`;
    case 'unknown':
      return `unknown(${node.sqlType})`;
  }
}

describe('parseDuckDBType', () => {
  it.each([
    ['INTEGER', 'INTEGER'],
    ['DECIMAL(18,4)', 'DECIMAL(18|4)'],
    ['VARCHAR', 'VARCHAR'],
    ['TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH TIME ZONE'],
    ['TIME WITH TIME ZONE', 'TIME WITH TIME ZONE'],
    ['JSON', 'JSON'],
    ['VARIANT', 'VARIANT'],
    ['BLOB', 'BLOB'],
    ['GEOMETRY', 'GEOMETRY'],
    ['INTEGER[]', 'list<INTEGER>'],
    ['INTEGER[3]', 'array3<INTEGER>'],
    ['FLOAT[768]', 'array768<FLOAT>'],
    // Each suffix wraps the type before it: a list of 2-integer arrays, and
    // a 2-array of integer lists.
    ['INTEGER[2][]', 'list<array2<INTEGER>>'],
    ['INTEGER[][2]', 'array2<list<INTEGER>>'],
    ['TINYINT[][][]', 'list<list<list<TINYINT>>>'],
    ['TIMESTAMP WITH TIME ZONE[]', 'list<TIMESTAMP WITH TIME ZONE>'],
    ['DECIMAL(18,4)[]', 'list<DECIMAL(18|4)>'],
    ['JSON[]', 'list<JSON>'],
    ['VARIANT[]', 'list<VARIANT>'],
    ['LIST(INTEGER)', 'list<INTEGER>'],
    ['STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)', 'struct{x: DOUBLE, y: DOUBLE, tier: VARCHAR}'],
    ['STRUCT(INTEGER, VARCHAR)', 'struct{INTEGER, VARCHAR}'],
    ['STRUCT(TIMESTAMP WITH TIME ZONE)', 'struct{TIMESTAMP WITH TIME ZONE}'],
    ['STRUCT(ts TIMESTAMP WITH TIME ZONE)', 'struct{ts: TIMESTAMP WITH TIME ZONE}'],
    ['STRUCT("time" TIME, "json" JSON)', 'struct{time: TIME, json: JSON}'],
    ['STRUCT(map MAP(VARCHAR, INTEGER))', 'struct{map: map<VARCHAR, INTEGER>}'],
    ['STRUCT(struct STRUCT(a INTEGER))', 'struct{struct: struct{a: INTEGER}}'],
    ['STRUCT(v VARIANT)', 'struct{v: VARIANT}'],
    ['MAP(VARCHAR, INTEGER)', 'map<VARCHAR, INTEGER>'],
    ['MAP(DATE, INTEGER[])', 'map<DATE, list<INTEGER>>'],
    ['MAP(STRUCT(k INTEGER), VARCHAR)', 'map<struct{k: INTEGER}, VARCHAR>'],
    ['MAP(INTEGER[], VARCHAR)', 'map<list<INTEGER>, VARCHAR>'],
    ['UNION(num INTEGER, str VARCHAR)', 'union{num: INTEGER, str: VARCHAR}'],
    [
      'UNION("my tag" INTEGER, b STRUCT(c INTEGER)[])',
      'union{my tag: INTEGER, b: list<struct{c: INTEGER}>}',
    ],
    [
      'STRUCT(name VARCHAR, age INTEGER, langs VARCHAR[])[]',
      'list<struct{name: VARCHAR, age: INTEGER, langs: list<VARCHAR>}>',
    ],
    ['STRUCT(h HUGEINT, u UHUGEINT)', 'struct{h: HUGEINT, u: UHUGEINT}'],
    ['INTERVAL[]', 'list<INTERVAL>'],
    ['BIT[]', 'list<BIT>'],
  ])('%s', (text, expected) => {
    expect(shape(parseDuckDBType(text))).toBe(expected);
  });

  it('reads quoted field names: doubled quotes, commas, parentheses, brackets, newlines', () => {
    const node = parseDuckDBType(
      'STRUCT("quote""d" INTEGER, "it\'s" INTEGER, "x,y" INTEGER, "a)b" INTEGER, "c[d" VARCHAR[], "new\nline" INTEGER, "my field" VARCHAR, "ünï" INTEGER, "emoji😀" INTEGER, "2" INTEGER, "SELECT" INTEGER, "null" INTEGER, ID INTEGER, __proto__ INTEGER, toJSON INTEGER)',
    );
    expect(node.kind).toBe('struct');
    if (node.kind !== 'struct') return;
    expect(node.fields.map((f) => f.name)).toEqual([
      'quote"d',
      "it's",
      'x,y',
      'a)b',
      'c[d',
      'new\nline',
      'my field',
      'ünï',
      'emoji😀',
      '2',
      'SELECT',
      'null',
      'ID',
      '__proto__',
      'toJSON',
    ]);
    expect(node.fields[4]!.type.kind).toBe('list');
  });

  it("reads ENUM literals, '' escapes and commas included", () => {
    const node = parseDuckDBType("ENUM('it''s', 'y,z', 'a)b')[]");
    expect(node.kind).toBe('list');
    if (node.kind !== 'list' || node.element.kind !== 'scalar') throw new Error('shape');
    expect(node.element.name).toBe('ENUM');
    expect(node.element.args).toEqual(["'it''s'", "'y,z'", "'a)b'"]);
    expect(node.element.dataType).toBe('string');
  });

  it('keeps the text of every node in sqlType', () => {
    const node = parseDuckDBType('MAP(VARCHAR, STRUCT(a DECIMAL(10,2)[], "b c" INTEGER))[]');
    expect(node.sqlType).toBe('MAP(VARCHAR, STRUCT(a DECIMAL(10,2)[], "b c" INTEGER))[]');
    if (node.kind !== 'list' || node.element.kind !== 'map') throw new Error('shape');
    const map = node.element;
    expect(map.sqlType).toBe('MAP(VARCHAR, STRUCT(a DECIMAL(10,2)[], "b c" INTEGER))');
    expect(map.key.sqlType).toBe('VARCHAR');
    expect(map.value.sqlType).toBe('STRUCT(a DECIMAL(10,2)[], "b c" INTEGER)');
    if (map.value.kind !== 'struct') throw new Error('shape');
    expect(map.value.fields[0]!.type.sqlType).toBe('DECIMAL(10,2)[]');
    expect(map.value.fields[1]!.type.sqlType).toBe('INTEGER');
  });

  it('matches keywords in any case', () => {
    expect(shape(parseDuckDBType('struct(a integer, b varchar[])'))).toBe(
      'struct{a: INTEGER, b: list<VARCHAR>}',
    );
    expect(shape(parseDuckDBType('map(varchar, integer)'))).toBe('map<VARCHAR, INTEGER>');
    expect(shape(parseDuckDBType('  Union(n Integer)  '))).toBe('union{n: INTEGER}');
  });

  it('reads a 40-field struct', () => {
    const fields = Array.from({ length: 40 }, (_, i) => `f${i} ${i % 2 ? 'DOUBLE' : 'VARCHAR'}`);
    const node = parseDuckDBType(`STRUCT(${fields.join(', ')})`);
    expect(node.kind === 'struct' && node.fields.length).toBe(40);
  });

  it('names a field DuckDB writes without a name, after a named first field, with ""', () => {
    const names = (text: string) => {
      const node = parseDuckDBType(text);
      return node.kind === 'struct' ? node.fields.map((f) => f.name) : node.kind;
    };
    // The JSON {"b": 2, "": 1} loads as this: the empty name is written as nothing.
    expect(names('STRUCT(b BIGINT,  BIGINT)')).toEqual(['b', '']);
    expect(names('STRUCT(b BIGINT,  BIGINT, c INTEGER,  VARCHAR[])')).toEqual(['b', '', 'c', '']);
    expect(names('STRUCT(b BIGINT,  TIMESTAMP WITH TIME ZONE)')).toEqual(['b', '']);
    expect(names('STRUCT(b BIGINT,  STRUCT(x INTEGER))')).toEqual(['b', '']);
    expect(names('STRUCT("" INTEGER, b BIGINT)')).toEqual(['', 'b']);
    // DuckDB takes a struct whose first field's name is empty for unnamed,
    // and writes it with types only: {"": 1, "b": 2} loads as STRUCT(BIGINT, BIGINT).
    expect(names('STRUCT(BIGINT, BIGINT)')).toEqual([null, null]);
    expect(names('STRUCT(INTEGER, VARCHAR)')).toEqual([null, null]);
  });

  it('reads empty STRUCT() and UNION()', () => {
    expect(shape(parseDuckDBType('STRUCT()'))).toBe('struct{}');
    expect(shape(parseDuckDBType('UNION()[]'))).toBe('list<union{}>');
  });

  it.each([
    '',
    '   ',
    'STRUCT(',
    'STRUCT(a INTEGER',
    'MAP(VARCHAR)',
    'MAP(VARCHAR, INTEGER, DATE)',
    'INTEGER[',
    'INTEGER[x]',
    'INTEGER]',
    'STRUCT("unterminated INTEGER)',
    "ENUM('a)",
    'LIST(INTEGER, VARCHAR)',
    ')(',
    'INTEGER VARCHAR',
    ',',
  ])('gives an unknown node, never throws, for %j', (text) => {
    expect(() => parseDuckDBType(text)).not.toThrow();
    expect(parseDuckDBType(text).kind).toBe('unknown');
  });

  it('gives up past MAX_TYPE_DEPTH without overflowing the stack', () => {
    const ok = 'INTEGER' + '[]'.repeat(MAX_TYPE_DEPTH - 1);
    expect(parseDuckDBType(ok).kind).toBe('list');
    expect(parseDuckDBType('INTEGER' + '[]'.repeat(MAX_TYPE_DEPTH)).kind).toBe('unknown');
    const deepStruct = 'STRUCT(a '.repeat(10_000) + 'INTEGER' + ')'.repeat(10_000);
    expect(parseDuckDBType(deepStruct).kind).toBe('unknown');
    expect(dataTypeOf(parseDuckDBType(deepStruct))).toBe('nested');
  });

  it('memoizes: the same text gives the same frozen node', () => {
    const a = parseDuckDBType('STRUCT(x DOUBLE)[]');
    const b = parseDuckDBType('STRUCT(x DOUBLE)[]');
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    if (a.kind !== 'list' || a.element.kind !== 'struct') throw new Error('shape');
    expect(Object.isFrozen(a.element.fields)).toBe(true);
    expect(Object.isFrozen(a.element.fields[0])).toBe(true);
  });
});

describe('dataTypeOf', () => {
  it.each([
    ['BIGINT', 'integer'],
    ['UHUGEINT', 'integer'],
    ['DOUBLE', 'float'],
    ['DECIMAL(10,2)', 'decimal'],
    ['BOOLEAN', 'boolean'],
    ['DATE', 'date'],
    ['TIMESTAMP_NS', 'timestamp'],
    ['TIMESTAMP WITH TIME ZONE', 'timestamp'],
    ['TIME WITH TIME ZONE', 'time'],
    ['INTERVAL', 'interval'],
    ['UUID', 'uuid'],
    ['VARCHAR(10)', 'string'],
    ['BLOB', 'string'],
    ['BIT', 'string'],
    ["ENUM('a', 'b')", 'string'],
    ['BIGNUM', 'string'],
    ['JSON', 'string'],
    ['SOME_FUTURE_TYPE', 'string'],
    ['INTEGER[]', 'nested'],
    ['FLOAT[768]', 'nested'],
    ['JSON[]', 'nested'],
    ['STRUCT(x DOUBLE)', 'nested'],
    ['MAP(VARCHAR, INTEGER)', 'nested'],
    ['UNION(a INTEGER)', 'nested'],
    ['VARIANT', 'nested'],
  ] as const)('%s → %s', (text, expected) => {
    expect(dataTypeOf(parseDuckDBType(text))).toBe(expected);
  });
});

describe('dataTypeOf, from the text DESCRIBE prints', () => {
  /** Whether a column of DuckDB type `text` loads as `'nested'`. */
  const nested = (text: string) => dataTypeOf(parseDuckDBType(text)) === 'nested';

  it.each([
    'INTEGER[]',
    'BIGINT[]',
    'INTEGER[3]',
    'INTEGER[][]',
    'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    'STRUCT("inner" INTEGER[])',
    'MAP(VARCHAR, INTEGER)',
    'UNION(num INTEGER, str VARCHAR)',
    'VARIANT',
    'struct(a integer)',
    ' MAP(VARCHAR, INTEGER) ',
  ])('%s is nested', (type) => {
    expect(nested(type)).toBe(true);
  });

  it.each([
    'INTEGER',
    'VARCHAR',
    'DECIMAL(18,3)',
    'TIMESTAMP WITH TIME ZONE',
    'INTERVAL',
    'JSON',
    'BLOB',
    'MAPPING',
    '',
  ])('%s is not nested', (type) => {
    expect(nested(type)).toBe(false);
  });
});

describe('childTypes / containsKind / holdsVariant / needsTextMatch', () => {
  it('lists child types in order', () => {
    const map = parseDuckDBType('MAP(DATE, INTEGER[])');
    expect(childTypes(map).map((c) => c.sqlType)).toEqual(['DATE', 'INTEGER[]']);
    expect(childTypes(parseDuckDBType('INTEGER'))).toEqual([]);
  });

  it('finds a kind at any depth', () => {
    const node = parseDuckDBType('STRUCT(a MAP(VARCHAR, STRUCT(v VARIANT)[]))');
    expect(containsKind(node, 'variant')).toBe(true);
    expect(containsKind(node, ['union', 'json'])).toBe(false);
    expect(containsKind(node, 'struct')).toBe(true);
  });

  it.each([
    ['VARIANT', true],
    ['VARIANT[]', true],
    ['STRUCT(a MAP(VARCHAR, STRUCT(v VARIANT)[]))', true],
    ['STRUCT(v VARIANT', true],
    ['STRUCT(', false],
    ['JSON', false],
    ['UNION(i INTEGER, s VARCHAR)', false],
    ['INTEGER[]', false],
  ] as const)('holdsVariant(%s) is %s', (text, expected) => {
    expect(holdsVariant(parseDuckDBType(text))).toBe(expected);
  });

  it.each([
    ['UNION(i INTEGER, s VARCHAR)', true],
    ['UNION(i INTEGER, s VARCHAR)[]', true],
    ['STRUCT(k VARIANT)', true],
    ['VARIANT[]', true],
    ['STRUCT(', true],
    ['INTEGER[]', false],
    ['STRUCT(x DOUBLE, tags VARCHAR[])', false],
    ['MAP(VARCHAR, INTEGER)', false],
    ['JSON[]', false],
  ] as const)('needsTextMatch(%s) is %s', (text, expected) => {
    expect(needsTextMatch(parseDuckDBType(text))).toBe(expected);
  });
});

describe('isTimeWithTimeZone', () => {
  it.each([
    ['TIME WITH TIME ZONE', true],
    ['time with time zone', true],
    ['TIMETZ', true],
    ['TIME', false],
    ['TIME_NS', false],
    ['TIME WITHOUT TIME ZONE', false],
    ['TIMESTAMP WITH TIME ZONE', false],
    ['TIME WITH TIME ZONE[]', false],
    ['STRUCT(t TIME WITH TIME ZONE)', false],
    ['', false],
    [undefined, false],
  ] as const)('isTimeWithTimeZone(%s) is %s', (text, expected) => {
    expect(isTimeWithTimeZone(text)).toBe(expected);
  });
});

describe('the types of the nested stress fixture', () => {
  // Every type DuckDB reports for the fixture files and the SQL-only
  // companions: what the parser meets on real data, quoted keyword field
  // names, `"quote""d"`, ENUM literals and VARIANT included.
  const cases = [
    ...MANIFEST.parquet.columns.map((c) => ({
      source: 'parquet',
      name: c.name,
      kind: c.kind,
      type: c.duckdbType,
    })),
    ...MANIFEST.json.columns.map((c) => ({
      source: 'json',
      name: c.name,
      kind: c.kind,
      type: c.duckdbType,
    })),
    ...SQL_ONLY_COLUMNS.map((c) => ({ source: 'sql', name: c.name, kind: null, type: c.type })),
  ];

  it.each(cases)('$source $name parses as a whole: $type', ({ kind, type }) => {
    const node = parseDuckDBType(type);
    expect(containsKind(node, 'unknown')).toBe(false);
    expect(node.sqlType).toBe(type);
    if (kind === 'list' || kind === 'struct' || kind === 'map') {
      expect(node.kind).toBe(kind);
      expect(dataTypeOf(node)).toBe('nested');
    } else if (kind === 'json') {
      expect(node.kind).toBe('json');
      expect(dataTypeOf(node)).toBe('string');
    } else if (kind === 'scalar') {
      expect(node.kind).toBe('scalar');
    } else {
      expect(dataTypeOf(node)).toBe('nested');
    }
  });

  it('reads the 26 odd field names of odd_names, quotes and keywords included', () => {
    const column = MANIFEST.parquet.columns.find((c) => c.name === 'odd_names')!;
    const node = parseDuckDBType(column.duckdbType);
    expect(node.kind === 'struct' && node.fields.map((f) => f.name)).toEqual([
      'label',
      'name',
      'type',
      'data',
      'size',
      'length',
      'toJSON',
      'constructor',
      '__proto__',
      'hasOwnProperty',
      'months',
      'days',
      'nanoseconds',
      'my field',
      'x,y',
      'quote"d',
      "it's",
      '2',
      '1',
      '10',
      'ünï',
      'emoji😀',
      'order',
      'null',
      'SELECT',
      'ID',
    ]);
  });
});
