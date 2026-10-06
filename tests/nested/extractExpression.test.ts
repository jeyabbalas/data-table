/**
 * Extract field → column: the expressions and default names
 * `nestedFieldExpression` writes, what `resolveNestedPath` says a path
 * reaches, and the names `uniqueColumnName` picks. The same expressions run
 * on real DuckDB in extractExpression.duckdb.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  columnNameKey,
  nestedFieldExpression,
  resolveNestedPath,
  uniqueColumnName,
  type NestedFieldExpressionOptions,
  type NestedPathColumn,
  type NestedPathErrorCode,
  type NestedPathStep,
} from '@/nested/extractExpression';

/** The nested stress fixture's `odd_names`, as DESCRIBE prints it. */
const ODD_NAMES_TYPE =
  'STRUCT("label" VARCHAR, "name" VARCHAR, "type" VARCHAR, "data" VARCHAR, size INTEGER, ' +
  'length INTEGER, toJSON VARCHAR, constructor VARCHAR, __proto__ VARCHAR, hasOwnProperty BOOLEAN, ' +
  '"months" INTEGER, "days" INTEGER, nanoseconds BIGINT, "my field" VARCHAR, "x,y" DOUBLE, ' +
  '"quote""d" VARCHAR, "it\'s" VARCHAR, "2" INTEGER, "1" INTEGER, "10" INTEGER, "ünï" VARCHAR, ' +
  '"emoji😀" VARCHAR, "order" INTEGER, "null" VARCHAR, "SELECT" VARCHAR, ID BIGINT)';

/** Its fields, in order, with the SQL that reads each and its default name. */
const ODD_NAMES: readonly (readonly [field: string, expression: string, name: string])[] = [
  ['label', `"odd_names"['label']`, 'odd_names_label'],
  ['name', `"odd_names"['name']`, 'odd_names_name'],
  ['type', `"odd_names"['type']`, 'odd_names_type'],
  ['data', `"odd_names"['data']`, 'odd_names_data'],
  ['size', `"odd_names"['size']`, 'odd_names_size'],
  ['length', `"odd_names"['length']`, 'odd_names_length'],
  ['toJSON', `"odd_names"['toJSON']`, 'odd_names_to_json'],
  ['constructor', `"odd_names"['constructor']`, 'odd_names_constructor'],
  ['__proto__', `"odd_names"['__proto__']`, 'odd_names_proto'],
  ['hasOwnProperty', `"odd_names"['hasOwnProperty']`, 'odd_names_has_own_property'],
  ['months', `"odd_names"['months']`, 'odd_names_months'],
  ['days', `"odd_names"['days']`, 'odd_names_days'],
  ['nanoseconds', `"odd_names"['nanoseconds']`, 'odd_names_nanoseconds'],
  ['my field', `"odd_names"['my field']`, 'odd_names_my_field'],
  ['x,y', `"odd_names"['x,y']`, 'odd_names_x_y'],
  ['quote"d', `"odd_names"['quote"d']`, 'odd_names_quote_d'],
  ["it's", `"odd_names"['it''s']`, 'odd_names_it_s'],
  ['2', `"odd_names"['2']`, 'odd_names_2'],
  ['1', `"odd_names"['1']`, 'odd_names_1'],
  ['10', `"odd_names"['10']`, 'odd_names_10'],
  ['ünï', `"odd_names"['ünï']`, 'odd_names_uni'],
  ['emoji😀', `"odd_names"['emoji😀']`, 'odd_names_emoji'],
  ['order', `"odd_names"['order']`, 'odd_names_order'],
  ['null', `"odd_names"['null']`, 'odd_names_null'],
  ['SELECT', `"odd_names"['SELECT']`, 'odd_names_select'],
  ['ID', `"odd_names"['ID']`, 'odd_names_id'],
];

const NESTED_STRUCT_TYPE =
  'STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR, phones VARCHAR[], ' +
  'address STRUCT(city VARCHAR, zip VARCHAR))), "version" INTEGER)';
const PEOPLE_TYPE = 'STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]';
const POINT_TYPE = 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)';
const UNION_TYPE = 'UNION(num INTEGER, str VARCHAR)';

/** Build, expecting success. */
function build(
  name: string,
  originalType: string,
  path: readonly NestedPathStep[],
  options?: NestedFieldExpressionOptions,
) {
  const result = nestedFieldExpression({ name, originalType }, path, options);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}

/** Build, expecting a failure. */
function failure(
  name: string,
  originalType: string,
  path: readonly NestedPathStep[],
  options?: NestedFieldExpressionOptions,
) {
  const result = nestedFieldExpression({ name, originalType }, path, options);
  if (result.ok) throw new Error(`expected an error, got ${result.expression}`);
  return result.error;
}

describe('nestedFieldExpression', () => {
  it.each<
    [
      what: string,
      column: string,
      type: string,
      path: NestedPathStep[],
      options: NestedFieldExpressionOptions,
      expression: string,
      name: string,
    ]
  >([
    [
      'a struct path',
      'point',
      'STRUCT(x DOUBLE, geo STRUCT(lat DOUBLE, lon DOUBLE))',
      ['geo', 'lat'],
      {},
      `"point"['geo']['lat']`,
      'point_geo_lat',
    ],
    [
      'an unnamed field',
      'pair',
      'STRUCT(INTEGER, VARCHAR)',
      [2],
      {},
      'struct_extract("pair", 2)',
      'pair_2',
    ],
    ['a list element', 'tags', 'VARCHAR[]', [3], {}, '"tags"[3]', 'tags_3'],
    ['an array element', 'emb', 'FLOAT[768]', [768], {}, '"emb"[768]', 'emb_768'],
    ['a list length', 'tags', 'VARCHAR[]', [], { extract: 'length' }, 'len("tags")', 'tags_length'],
    ['an array length', 'emb', 'FLOAT[768]', [], { extract: 'length' }, 'len("emb")', 'emb_length'],
    ['a map value', 'm', 'MAP(VARCHAR, INTEGER)', ['k'], {}, `map_extract_value("m", 'k')`, 'm_k'],
    [
      'a map size',
      'm',
      'MAP(VARCHAR, INTEGER)',
      [],
      { extract: 'length' },
      'cardinality("m")',
      'm_size',
    ],
    ['a union member', 'u', UNION_TYPE, ['num'], {}, `union_extract("u", 'num')`, 'u_num'],
    ['a union tag', 'u', UNION_TYPE, [], { extract: 'tag' }, 'union_tag("u")', 'u_tag'],
    [
      'a JSON leaf',
      'doc',
      'JSON',
      ['a.b', 0],
      {},
      `json_extract_string("doc", '$."a.b"[0]')`,
      'doc_a_b_0',
    ],
    [
      'a JSON number',
      'doc',
      'JSON',
      ['score'],
      { jsonLeaf: 'number' },
      `TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)`,
      'doc_score',
    ],
    [
      'a JSON boolean',
      'doc',
      'JSON',
      ['q"k'],
      { jsonLeaf: 'boolean' },
      String.raw`TRY_CAST(json_extract_string("doc", '$."q\"k"') AS BOOLEAN)`,
      'doc_q_k',
    ],
    [
      'a JSON object',
      'doc',
      'JSON',
      ['ünï'],
      { jsonLeaf: 'json' },
      `json_extract("doc", '$."ünï"')`,
      'doc_uni',
    ],
    [
      'a JSON string',
      'doc',
      'JSON',
      ['k'],
      { jsonLeaf: 'string' },
      `json_extract_string("doc", '$.k')`,
      'doc_k',
    ],
    [
      'a JSON array length',
      'doc',
      'JSON',
      ['ünï', 'list'],
      { extract: 'length' },
      `json_array_length("doc", '$."ünï".list')`,
      'doc_uni_list_length',
    ],
    [
      'a JSON document length',
      'doc',
      'JSON',
      [],
      { extract: 'length' },
      'json_array_length("doc")',
      'doc_length',
    ],
    [
      'a VARIANT leaf, read as JSON',
      'v',
      'VARIANT',
      ['k'],
      {},
      `json_extract_string(CAST("v" AS JSON), '$.k')`,
      'v_k',
    ],
    [
      'a VARIANT array element',
      'v',
      'VARIANT',
      [0],
      { jsonLeaf: 'number' },
      `TRY_CAST(json_extract_string(CAST("v" AS JSON), '$[0]') AS DOUBLE)`,
      'v_0',
    ],
  ])('reads %s', (_what, column, type, path, options, expression, name) => {
    const built = build(column, type, path, options);
    expect(built.expression).toBe(expression);
    expect(built.name).toBe(name);
  });

  describe('struct fields', () => {
    it.each(ODD_NAMES)('reads the odd field %j by its name', (field, expression, name) => {
      const built = build('odd_names', ODD_NAMES_TYPE, [field]);
      expect(built).toMatchObject({ ok: true, expression, name, json: false, jsonStart: -1 });
    });

    it('reads every odd field by its position as by its name', () => {
      ODD_NAMES.forEach(([, expression, name], index) => {
        expect(build('odd_names', ODD_NAMES_TYPE, [index + 1])).toMatchObject({ expression, name });
      });
    });

    it('gives the 26 odd fields 26 different names', () => {
      const names = ODD_NAMES.map(([field]) => build('odd_names', ODD_NAMES_TYPE, [field]).name);
      expect(new Set(names).size).toBe(26);
      expect(new Set(names.map(columnNameKey)).size).toBe(26);
      for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    });

    it('reads a field four structs deep', () => {
      expect(
        build('nested_struct', NESTED_STRUCT_TYPE, ['owner', 'contact', 'email']),
      ).toMatchObject({
        expression: `"nested_struct"['owner']['contact']['email']`,
        name: 'nested_struct_owner_contact_email',
      });
      expect(
        build('nested_struct', NESTED_STRUCT_TYPE, ['owner', 'contact', 'address', 'city']),
      ).toMatchObject({
        expression: `"nested_struct"['owner']['contact']['address']['city']`,
        name: 'nested_struct_owner_contact_address_city',
      });
      expect(
        build('nested_struct', NESTED_STRUCT_TYPE, ['owner', 'contact', 'phones', 2]),
      ).toMatchObject({
        expression: `"nested_struct"['owner']['contact']['phones'][2]`,
        name: 'nested_struct_owner_contact_phones_2',
      });
      expect(
        build('nested_struct', NESTED_STRUCT_TYPE, ['owner', 'contact', 'phones'], {
          extract: 'length',
        }),
      ).toMatchObject({
        expression: `len("nested_struct"['owner']['contact']['phones'])`,
        name: 'nested_struct_owner_contact_phones_length',
      });
    });

    it('finds a field by its name in another case, as DuckDB does, and writes its own', () => {
      expect(build('point', POINT_TYPE, ['X'])).toMatchObject({
        expression: `"point"['x']`,
        name: 'point_x',
      });
      // The exact name wins over one in another case.
      expect(build('s', 'STRUCT(a INTEGER, "A_1" INTEGER)', ['A_1']).expression).toBe(`"s"['A_1']`);
    });

    it('reads unnamed fields by position only', () => {
      expect(build('pair', 'STRUCT(INTEGER, VARCHAR)', [1]).expression).toBe(
        'struct_extract("pair", 1)',
      );
      expect(failure('pair', 'STRUCT(INTEGER, VARCHAR)', ['1'])).toMatchObject({
        code: 'NO_SUCH_FIELD',
        step: 0,
      });
    });

    it('reads a field named "" by struct_extract_at, by name or by position', () => {
      // DuckDB refuses '' as a key and, on a struct with names, a position
      // in struct_extract: struct_extract_at reads either.
      const type = 'STRUCT(b BIGINT,  BIGINT)';
      for (const step of ['', 2]) {
        expect(build('s', type, [step])).toMatchObject({
          expression: 'struct_extract_at("s", 2)',
          name: 's_field',
        });
      }
      expect(build('s', type, ['b']).expression).toBe(`"s"['b']`);
      expect(build('s', `STRUCT(b BIGINT,  STRUCT(x INTEGER))`, ['', 'x']).expression).toBe(
        `struct_extract_at("s", 2)['x']`,
      );
    });

    it('chains into the struct of a function result', () => {
      expect(build('u', 'UNION(p STRUCT(x INTEGER), n INTEGER)', ['p', 'x']).expression).toBe(
        `union_extract("u", 'p')['x']`,
      );
      expect(build('pairs', 'STRUCT(INTEGER, STRUCT(z INTEGER))', [2, 'z']).expression).toBe(
        `struct_extract("pairs", 2)['z']`,
      );
    });

    it('quotes the column name and every literal', () => {
      expect(build('my "col"', `STRUCT("it's" INTEGER)`, ["it's"])).toMatchObject({
        expression: `"my ""col"""['it''s']`,
        name: 'my_col_it_s',
      });
    });
  });

  describe('lists and arrays', () => {
    it('reads a field of a list of structs', () => {
      expect(build('people', PEOPLE_TYPE, [2, 'name'])).toMatchObject({
        expression: `"people"[2]['name']`,
        name: 'people_2_name',
      });
      expect(build('people', PEOPLE_TYPE, [1, 'langs', 3])).toMatchObject({
        expression: `"people"[1]['langs'][3]`,
        name: 'people_1_langs_3',
      });
      expect(build('people', PEOPLE_TYPE, [1, 'langs'], { extract: 'length' })).toMatchObject({
        expression: `len("people"[1]['langs'])`,
        name: 'people_1_langs_length',
      });
      expect(build('people', PEOPLE_TYPE, [], { extract: 'length' }).expression).toBe(
        'len("people")',
      );
    });

    it('reads lists of lists and lists of arrays', () => {
      expect(build('matrix', 'SMALLINT[][]', [2, 1]).expression).toBe('"matrix"[2][1]');
      expect(build('pairs', 'INTEGER[2][]', [5, 2]).expression).toBe('"pairs"[5][2]');
      expect(failure('pairs', 'INTEGER[2][]', [5, 3])).toMatchObject({
        code: 'POSITION_OUT_OF_RANGE',
        step: 1,
      });
    });

    it('takes positions from 1 to the size of a fixed array', () => {
      expect(build('a', 'INTEGER[3]', [1]).expression).toBe('"a"[1]');
      expect(build('a', 'INTEGER[3]', [3]).expression).toBe('"a"[3]');
      expect(failure('a', 'INTEGER[3]', [4]).code).toBe('POSITION_OUT_OF_RANGE');
      expect(failure('a', 'INTEGER[3]', [0]).code).toBe('POSITION_OUT_OF_RANGE');
    });
  });

  describe('maps', () => {
    it.each([
      'size',
      'toJSON',
      'constructor',
      '__proto__',
      '2',
      '1',
      'k=v',
      "it's",
      'quote"d',
      '',
      '[x]',
    ])('reads the text key %j as a string literal', (key) => {
      const built = build('attrs', 'MAP(VARCHAR, INTEGER)', [key]);
      expect(built.expression).toBe(`map_extract_value("attrs", '${key.replace(/'/g, "''")}')`);
    });

    it('names map values after their keys, and the size after the map', () => {
      const names = ['size', 'toJSON', 'constructor', '__proto__', '2', '1', 'k=v'].map(
        (key) => build('attrs', 'MAP(VARCHAR, INTEGER)', [key]).name,
      );
      expect(names).toEqual([
        'attrs_size',
        'attrs_to_json',
        'attrs_constructor',
        'attrs_proto',
        'attrs_2',
        'attrs_1',
        'attrs_k_v',
      ]);
      expect(build('attrs', 'MAP(VARCHAR, INTEGER)', [], { extract: 'length' }).name).toBe(
        'attrs_size',
      );
    });

    it('writes a number given for a text key as text', () => {
      // DuckDB cannot match an INTEGER literal against VARCHAR keys.
      expect(build('attrs', 'MAP(VARCHAR, INTEGER)', [2]).expression).toBe(
        `map_extract_value("attrs", '2')`,
      );
    });

    it.each<[string, NestedPathStep, string]>([
      ['INTEGER', 2, '2'],
      ['INTEGER', '2', '2'],
      ['INTEGER', -3, '-3'],
      ['INTEGER', ' -3 ', '-3'],
      ['INTEGER', '+7', '7'],
      // DuckDB reads the literal 007 as matching nothing.
      ['INTEGER', '007', '7'],
      ['TINYINT', 1, '1'],
      ['BIGINT', '9223372036854775807', '9223372036854775807'],
      [
        'HUGEINT',
        '-170141183460469231731687303715884105728',
        '-170141183460469231731687303715884105728',
      ],
      ['UBIGINT', '18446744073709551615', '18446744073709551615'],
    ])('writes a key of a MAP(%s, …) as a bare number', (keyType, key, literal) => {
      expect(build('m', `MAP(${keyType}, VARCHAR)`, [key]).expression).toBe(
        `map_extract_value("m", ${literal})`,
      );
    });

    it.each<[string, NestedPathStep, string]>([
      ['DATE', '2024-02-29', `TRY_CAST('2024-02-29' AS DATE)`],
      ['DOUBLE', 0.1, `TRY_CAST('0.1' AS DOUBLE)`],
      ['DECIMAL(10,2)', '12.34', `TRY_CAST('12.34' AS DECIMAL(10,2))`],
      ['BOOLEAN', 'true', `TRY_CAST('true' AS BOOLEAN)`],
      [
        'TIMESTAMP WITH TIME ZONE',
        '2024-01-01 00:00:00+00',
        `TRY_CAST('2024-01-01 00:00:00+00' AS TIMESTAMP WITH TIME ZONE)`,
      ],
      [
        'UUID',
        '1f3c8e2a-0000-4000-8000-000000000001',
        `TRY_CAST('1f3c8e2a-0000-4000-8000-000000000001' AS UUID)`,
      ],
      ['BLOB', String.raw`\xAA\xBB`, String.raw`TRY_CAST('\xAA\xBB' AS BLOB)`],
      ["ENUM('x', 'y,z', 'it''s')", "it's", `TRY_CAST('it''s' AS ENUM('x', 'y,z', 'it''s'))`],
      ['STRUCT(k INTEGER)', "{'k': 3}", `TRY_CAST('{''k'': 3}' AS STRUCT(k INTEGER))`],
      ['INTEGER[]', '[3, 0]', `TRY_CAST('[3, 0]' AS INTEGER[])`],
      ['JSON', '{"a":1}', `TRY_CAST('{"a":1}' AS JSON)`],
    ])('reads a key of a MAP(%s, …) back from its text', (keyType, key, literal) => {
      expect(build('m', `MAP(${keyType}, VARCHAR)`, [key]).expression).toBe(
        `map_extract_value("m", ${literal})`,
      );
    });

    it('chains into the list and struct values of a map', () => {
      expect(build('date_keys', 'MAP(DATE, INTEGER[])', ['2024-02-29', 1])).toMatchObject({
        expression: `map_extract_value("date_keys", TRY_CAST('2024-02-29' AS DATE))[1]`,
        name: 'date_keys_2024_02_29_1',
      });
      expect(
        build(
          'map_of_structs',
          'MAP(VARCHAR, STRUCT(qty INTEGER, price DECIMAL(10,2), note VARCHAR))',
          ['apple', 'qty'],
        ),
      ).toMatchObject({
        expression: `map_extract_value("map_of_structs", 'apple')['qty']`,
        name: 'map_of_structs_apple_qty',
      });
      expect(build('mm', 'MAP(VARCHAR, MAP(VARCHAR, INTEGER))', ['a', 'b']).expression).toBe(
        `map_extract_value(map_extract_value("mm", 'a'), 'b')`,
      );
    });

    it.each(['UNION(a INTEGER, b VARCHAR)', 'VARIANT', 'STRUCT(v VARIANT)', 'UNION(a INTEGER)[]'])(
      'refuses keys of type %s, which no literal matches reliably',
      (keyType) => {
        expect(failure('m', `MAP(${keyType}, VARCHAR)`, ['x'])).toMatchObject({
          code: 'UNSUPPORTED_MAP_KEY',
          step: 0,
        });
      },
    );

    it.each<[string, NestedPathStep]>([
      ['INTEGER', 1.5],
      ['INTEGER', 'abc'],
      ['INTEGER', ''],
      ['INTEGER', '1.0'],
      ['INTEGER', '0x10'],
      ['BIGINT', 2 ** 60],
    ])('refuses %s key %j', (keyType, key) => {
      expect(failure('m', `MAP(${keyType}, VARCHAR)`, [key])).toMatchObject({
        code: 'INVALID_MAP_KEY',
        step: 0,
      });
    });
  });

  describe('unions', () => {
    it('reads a member, its tag, and into a member', () => {
      expect(build('u', UNION_TYPE, ['str'])).toMatchObject({
        expression: `union_extract("u", 'str')`,
        name: 'u_str',
      });
      expect(
        build('u', 'UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR))', ['l', 1]),
      ).toMatchObject({
        expression: `union_extract("u", 'l')[1]`,
        name: 'u_l_1',
      });
      expect(
        build('u', 'UNION(l INTEGER[], st STRUCT(a INTEGER, b VARCHAR))', ['l'], {
          extract: 'length',
        }).expression,
      ).toBe(`len(union_extract("u", 'l'))`);
      expect(build('u', 'UNION("my tag" INTEGER, b VARCHAR)', ['my tag'])).toMatchObject({
        expression: `union_extract("u", 'my tag')`,
        name: 'u_my_tag',
      });
    });

    it('finds a member by its tag in another case, as DuckDB does', () => {
      expect(build('u', UNION_TYPE, ['NUM']).expression).toBe(`union_extract("u", 'num')`);
    });

    it('reads the tag of a union inside a struct', () => {
      expect(build('s', `STRUCT(u ${UNION_TYPE})`, ['u'], { extract: 'tag' })).toMatchObject({
        expression: `union_tag("s"['u'])`,
        name: 's_u_tag',
      });
    });
  });

  describe('JSON and VARIANT', () => {
    it.each<[NestedPathStep, string]>([
      ['k', '$.k'],
      ['_x9', '$._x9'],
      ['score', '$.score'],
      ['my field', '$."my field"'],
      ['a.b', '$."a.b"'],
      ['q"k', String.raw`$."q\"k"`],
      ["it's", `$."it''s"`],
      ['s/l', '$."s/l"'],
      ['t~l', '$."t~l"'],
      ['b[r', '$."b[r"'],
      ['c]d', '$."c]d"'],
      ['ünï', '$."ünï"'],
      ['emoji😀', '$."emoji😀"'],
      // A key that reads as a number stays a key: a JSON pointer would read
      // index 2 of an array.
      ['2', '$."2"'],
      [2, '$[2]'],
      ['$', '$."$"'],
      ['a*b', '$."a*b"'],
      ['back\\slash', String.raw`$."back\\slash"`],
      ['null', '$.null'],
      // JSONPath reads `*` as a wildcard even quoted, and has no empty key.
      ['*', '/*'],
      ['', '/'],
    ])('writes the key %j as %s', (key, path) => {
      expect(build('doc', 'JSON', [key], { jsonLeaf: 'json' }).expression).toBe(
        `json_extract("doc", '${path}')`,
      );
    });

    it('applies the paths that JSONPath and a JSON pointer split in turn', () => {
      expect(build('doc', 'JSON', ['a', '*', 0], { jsonLeaf: 'json' }).expression).toBe(
        `json_extract(json_extract(json_extract("doc", '$.a'), '/*'), '$[0]')`,
      );
      expect(build('doc', 'JSON', ['*', ''], { jsonLeaf: 'json' }).expression).toBe(
        `json_extract("doc", '/*/')`,
      );
      expect(build('doc', 'JSON', ['', 1], { extract: 'length' }).expression).toBe(
        `json_array_length(json_extract("doc", '/'), '$[1]')`,
      );
    });

    it('names JSON keys and 0-based indexes', () => {
      expect(build('doc', 'JSON', ['a', 'b', 0]).name).toBe('doc_a_b_0');
      expect(build('doc', 'JSON', ['q"k']).name).toBe('doc_q_k');
      expect(build('doc', 'JSON', ['*']).name).toBe('doc_field');
      expect(build('doc', 'JSON', ['']).name).toBe('doc_field');
    });

    it('reads a whole JSON or VARIANT value as a leaf kind', () => {
      expect(build('doc', 'JSON', [])).toMatchObject({
        expression: `json_extract_string("doc", '$')`,
        name: 'doc_string',
      });
      expect(build('doc', 'JSON', [], { jsonLeaf: 'number' })).toMatchObject({
        expression: `TRY_CAST(json_extract_string("doc", '$') AS DOUBLE)`,
        name: 'doc_number',
      });
      expect(build('doc', 'JSON', [], { jsonLeaf: 'json' })).toMatchObject({
        expression: '"doc"',
        name: 'doc_json',
      });
      // A VARIANT's JSON is `null` for NULL: NULLIF keeps it NULL.
      expect(build('v', 'VARIANT', [], { jsonLeaf: 'json' })).toMatchObject({
        expression: `NULLIF(CAST("v" AS JSON), 'null')`,
        name: 'v_json',
      });
      expect(build('v', 'VARIANT', [], { extract: 'length' }).expression).toBe(
        `json_array_length(NULLIF(CAST("v" AS JSON), 'null'))`,
      );
      expect(build('v', 'VARIANT', [], { jsonLeaf: 'boolean' }).expression).toBe(
        `TRY_CAST(json_extract_string(CAST("v" AS JSON), '$') AS BOOLEAN)`,
      );
    });

    it('reads JSON and VARIANT values nested in other types', () => {
      expect(build('s', 'STRUCT(meta JSON)', ['meta', 'a', 0])).toMatchObject({
        expression: `json_extract_string("s"['meta'], '$.a[0]')`,
        name: 's_meta_a_0',
        jsonStart: 1,
      });
      expect(build('s', 'STRUCT(meta JSON)', ['meta'], { jsonLeaf: 'number' }).expression).toBe(
        `TRY_CAST(json_extract_string("s"['meta'], '$') AS DOUBLE)`,
      );
      expect(build('json_list', 'JSON[]', [2, 'k'])).toMatchObject({
        expression: `json_extract_string("json_list"[2], '$.k')`,
        name: 'json_list_2_k',
      });
      expect(build('vl', 'VARIANT[]', [1, 'k'], { jsonLeaf: 'json' }).expression).toBe(
        `json_extract(CAST("vl"[1] AS JSON), '$.k')`,
      );
      expect(build('vs', 'STRUCT(k VARIANT)', ['k'], { jsonLeaf: 'json' }).expression).toBe(
        `NULLIF(CAST("vs"['k'] AS JSON), 'null')`,
      );
      expect(build('e', 'MAP(VARCHAR, JSON)', ['x', 'y']).expression).toBe(
        `json_extract_string(map_extract_value("e", 'x'), '$.y')`,
      );
    });

    it('ignores the leaf kind outside JSON', () => {
      expect(build('point', POINT_TYPE, ['x'], { jsonLeaf: 'number' }).expression).toBe(
        `"point"['x']`,
      );
    });
  });

  describe('default names', () => {
    it.each<[string, string, NestedPathStep[], string]>([
      ['the column’s name kept', 'c0051_struct', ['x'], 'c0051_struct_x'],
      ['accents dropped', 'Café', ['ünï'], 'cafe_uni'],
      ['camelCase split', 'userProfile', ['firstName'], 'user_profile_first_name'],
      ['runs of other characters made one _', 'a -- b', ['x,,  y'], 'a_b_x_y'],
      ['_ trimmed', '__a__', ['__proto__'], 'a_proto'],
      ['compatibility forms', 'ＡＢＣ', ['ﬁeld²'], 'abc_field2'],
      ['nothing left of a step', 'doc', ['😀'], 'doc_field'],
      ['nothing left of the column', '日本', ['k'], 'column_k'],
      ['a leading digit', '2024 Sales', ['total'], 'c_2024_sales_total'],
      ['a DuckDB reserved word', 'pivot', ['longer'], 'pivot_longer_col'],
      ['another', 'pivot', ['wider'], 'pivot_wider_col'],
      ['a keyword that parses as a column', 'try', ['cast'], 'try_cast'],
    ])('%s', (_what, column, path, name) => {
      const keyType = 'MAP(VARCHAR, INTEGER)';
      expect(build(column, keyType, path.slice(0, 1)).name).toBe(name);
    });

    it('cuts each part at 64 characters', () => {
      const built = build('m', 'MAP(VARCHAR, INTEGER)', ['word '.repeat(40)]);
      const [, part] = built.name.split(/^m_/);
      expect(part!.length).toBeLessThanOrEqual(64);
      expect(part).toMatch(/^word(_word)*$/);
    });
  });

  describe('errors', () => {
    it.each<
      [
        code: NestedPathErrorCode,
        step: number,
        column: string,
        type: string,
        path: NestedPathStep[],
        options?: NestedFieldExpressionOptions,
      ]
    >([
      ['INVALID_COLUMN', -1, '', POINT_TYPE, ['x']],
      ['INVALID_COLUMN', -1, 'a\0b', POINT_TYPE, ['x']],
      ['INVALID_STEP', 0, 'point', POINT_TYPE, [Number.NaN]],
      ['INVALID_STEP', 0, 'point', POINT_TYPE, [Number.POSITIVE_INFINITY]],
      ['INVALID_STEP', 0, 'point', POINT_TYPE, [1.5]],
      ['INVALID_STEP', 0, 'point', POINT_TYPE, ['x\0']],
      ['INVALID_STEP', 0, 'tags', 'VARCHAR[]', ['1']],
      ['INVALID_STEP', 0, 'tags', 'VARCHAR[]', [1.5]],
      ['INVALID_STEP', 0, 'u', UNION_TYPE, [1]],
      ['INVALID_STEP', 1, 'doc', 'JSON', ['a', 0.5]],
      ['INVALID_STEP', 1, 'doc', 'JSON', ['a', 'b\0']],
      ['NOT_A_CONTAINER', 1, 'point', POINT_TYPE, ['x', 'y']],
      ['NOT_A_CONTAINER', 1, 'scores', 'INTEGER[]', [1, 1]],
      ['NOT_A_CONTAINER', 0, 'label', 'VARCHAR', [1]],
      ['NO_SUCH_FIELD', 0, 'point', POINT_TYPE, ['z']],
      ['NO_SUCH_FIELD', 1, 'people', PEOPLE_TYPE, [1, 'nme']],
      ['NO_SUCH_FIELD', 0, 'u', UNION_TYPE, ['bogus']],
      ['NO_SUCH_FIELD', 0, 'e', 'STRUCT()', ['x']],
      ['POSITION_OUT_OF_RANGE', 0, 'tags', 'VARCHAR[]', [0]],
      ['POSITION_OUT_OF_RANGE', 0, 'tags', 'VARCHAR[]', [-1]],
      ['POSITION_OUT_OF_RANGE', 0, 'point', POINT_TYPE, [4]],
      ['POSITION_OUT_OF_RANGE', 0, 'point', POINT_TYPE, [0]],
      ['POSITION_OUT_OF_RANGE', 0, 'odd_names', ODD_NAMES_TYPE, [27]],
      ['POSITION_OUT_OF_RANGE', 0, 'doc', 'JSON', [-1]],
      ['UNKNOWN_TYPE', 0, 'g', 'STRUCT(', ['x']],
      ['EMPTY_PATH', -1, 'point', POINT_TYPE, []],
      ['EMPTY_PATH', -1, 'tags', 'VARCHAR[]', []],
      ['NOT_APPLICABLE', -1, 'point', POINT_TYPE, [], { extract: 'length' }],
      ['NOT_APPLICABLE', -1, 'point', POINT_TYPE, ['x'], { extract: 'length' }],
      ['NOT_APPLICABLE', -1, 'tags', 'VARCHAR[]', [], { extract: 'tag' }],
      ['NOT_APPLICABLE', -1, 'doc', 'JSON', ['a'], { extract: 'tag' }],
      ['NOT_APPLICABLE', -1, 'u', UNION_TYPE, [], { extract: 'length' }],
    ])('%s at step %i: %s %j', (code, step, column, type, path, options) => {
      const error = failure(column, type, path, options);
      expect(error).toMatchObject({ code, step });
      expect(error.message).toEqual(expect.any(String));
      expect(error.message.length).toBeGreaterThan(0);
    });

    it('refuses what TypeScript would, without throwing', () => {
      const odd = <T>(value: unknown) => value as T;
      for (const column of [null, undefined, 'point']) {
        expect(nestedFieldExpression(odd<NestedPathColumn>(column), ['x'])).toMatchObject({
          ok: false,
          error: { code: 'INVALID_COLUMN', step: -1 },
        });
        expect(resolveNestedPath(odd<NestedPathColumn>(column), [])).toMatchObject({
          ok: false,
          error: { code: 'INVALID_COLUMN' },
        });
      }
      expect(build('p', POINT_TYPE, ['x'], odd<NestedFieldExpressionOptions>(null))).toMatchObject({
        expression: `"p"['x']`,
      });
      expect(
        nestedFieldExpression({ name: 'p', originalType: odd<string>(undefined) }, ['x']),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_COLUMN' } });
      expect(
        nestedFieldExpression({ name: odd<string>(null), originalType: POINT_TYPE }, ['x']),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_COLUMN' } });
      expect(
        nestedFieldExpression({ name: 'p', originalType: POINT_TYPE }, odd<NestedPathStep[]>('x')),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_STEP', step: -1 } });
      for (const step of [null, undefined, true, {}, [], 1n]) {
        expect(
          nestedFieldExpression({ name: 'p', originalType: POINT_TYPE }, [
            odd<NestedPathStep>(step),
          ]),
        ).toMatchObject({ ok: false, error: { code: 'INVALID_STEP', step: 0 } });
        expect(
          nestedFieldExpression({ name: 'd', originalType: 'JSON' }, [
            'a',
            odd<NestedPathStep>(step),
          ]),
        ).toMatchObject({ ok: false, error: { code: 'INVALID_STEP', step: 1 } });
      }
      expect(
        nestedFieldExpression({ name: 'p', originalType: POINT_TYPE }, ['x'], {
          extract: odd<'value'>('bogus'),
        }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_APPLICABLE' } });
      // An unknown leaf kind is the default.
      expect(build('d', 'JSON', ['a'], { jsonLeaf: odd<'json'>('bogus') }).expression).toBe(
        `json_extract_string("d", '$.a')`,
      );
    });

    it('never throws, whatever the type, path and options', () => {
      const types = [
        POINT_TYPE,
        ODD_NAMES_TYPE,
        PEOPLE_TYPE,
        'MAP(INTEGER, VARCHAR)',
        'MAP(UNION(a INTEGER), VARCHAR)',
        UNION_TYPE,
        'JSON',
        'VARIANT[]',
        'INTEGER[3]',
        'STRUCT(INTEGER, VARCHAR)',
        'VARCHAR',
        'STRUCT(',
        '',
      ];
      const steps: NestedPathStep[] = ['x', 'name', '', '*', '1', 1, 0, -1, 2.5, 99, 'k\0'];
      const extracts = [undefined, 'value', 'length', 'tag'] as const;
      let calls = 0;
      for (const type of types) {
        for (const a of steps) {
          for (const b of [undefined, ...steps]) {
            const path = b === undefined ? [a] : [a, b];
            for (const extract of extracts) {
              const result = nestedFieldExpression({ name: 'c', originalType: type }, path, {
                extract,
              });
              expect(typeof result.ok).toBe('boolean');
              calls++;
            }
          }
        }
      }
      expect(calls).toBe(types.length * steps.length * (steps.length + 1) * extracts.length);
    });
  });
});

describe('resolveNestedPath', () => {
  it.each<[string, string, NestedPathStep[], string, string[]]>([
    ['a struct', POINT_TYPE, [], POINT_TYPE, []],
    ['a struct field', POINT_TYPE, ['x'], 'DOUBLE', ['value']],
    ['a list', 'VARCHAR[]', [], 'VARCHAR[]', ['length']],
    ['a list element', 'VARCHAR[]', [1], 'VARCHAR', ['value']],
    ['an array', 'FLOAT[768]', [], 'FLOAT[768]', ['length']],
    ['a map', 'MAP(VARCHAR, INTEGER)', [], 'MAP(VARCHAR, INTEGER)', ['length']],
    ['a map value', 'MAP(VARCHAR, INTEGER)', ['size'], 'INTEGER', ['value']],
    ['a union', UNION_TYPE, [], UNION_TYPE, ['tag']],
    ['a union member', UNION_TYPE, ['str'], 'VARCHAR', ['value']],
    ['a list in a list of structs', PEOPLE_TYPE, [2, 'langs'], 'VARCHAR[]', ['value', 'length']],
    ['a union in a struct', `STRUCT(u ${UNION_TYPE})`, ['u'], UNION_TYPE, ['value', 'tag']],
    [
      'a map in a list',
      'MAP(VARCHAR, INTEGER)[]',
      [1],
      'MAP(VARCHAR, INTEGER)',
      ['value', 'length'],
    ],
  ])('finds %s, not in JSON', (_what, type, path, sqlType, extracts) => {
    const resolved = resolveNestedPath({ name: 'c', originalType: type }, path);
    expect(resolved).toMatchObject({ ok: true, json: false, jsonStart: -1, extracts });
    expect(resolved.ok && resolved.type.sqlType).toBe(sqlType);
  });

  it.each<[string, string, NestedPathStep[], string, number]>([
    ['a JSON column', 'JSON', [], 'json', 0],
    ['a key in a JSON column', 'JSON', ['a.b', 0], 'json', 0],
    ['a JSON field', 'STRUCT(meta JSON)', ['meta'], 'json', 1],
    ['a key in a JSON field', 'STRUCT(meta JSON)', ['meta', 'k'], 'json', 1],
    ['a JSON element', 'JSON[]', [2], 'json', 1],
    ['a VARIANT column', 'VARIANT', [], 'variant', 0],
    ['a key in a VARIANT element', 'VARIANT[]', [1, 'k', 0], 'variant', 1],
    ['a VARIANT field', 'STRUCT(k VARIANT)', ['k'], 'variant', 1],
  ])('finds %s, in JSON', (_what, type, path, kind, jsonStart) => {
    expect(resolveNestedPath({ name: 'c', originalType: type }, path)).toMatchObject({
      ok: true,
      type: { kind },
      json: true,
      jsonStart,
      extracts: ['value', 'length'],
    });
  });

  it('says why a path leads nowhere', () => {
    expect(resolveNestedPath({ name: 'point', originalType: POINT_TYPE }, ['z'])).toMatchObject({
      ok: false,
      error: { code: 'NO_SUCH_FIELD', step: 0 },
    });
    expect(resolveNestedPath({ name: 'tags', originalType: 'VARCHAR[]' }, [1, 2])).toMatchObject({
      ok: false,
      error: { code: 'NOT_A_CONTAINER', step: 1 },
    });
  });

  it('agrees with nestedFieldExpression about where a path leads', () => {
    const column = { name: 'people', originalType: PEOPLE_TYPE };
    const resolved = resolveNestedPath(column, [1, 'langs']);
    const built = nestedFieldExpression(column, [1, 'langs'], { extract: 'length' });
    expect(built).toMatchObject({ ok: true, extracts: ['value', 'length'], json: false });
    expect(resolved.ok && built.ok && resolved.type).toBe(built.ok && built.type);
  });
});

describe('uniqueColumnName', () => {
  it('keeps a name nothing takes', () => {
    expect(uniqueColumnName('point_x', ['point', 'tags'])).toBe('point_x');
  });

  it('counts up from _2, comparing names as DuckDB does', () => {
    expect(uniqueColumnName('point_x', ['point_x'])).toBe('point_x_2');
    expect(uniqueColumnName('point_x', ['point_x', 'point_x_2'])).toBe('point_x_3');
    expect(uniqueColumnName('point_x', ['POINT_X', 'Point_X_2', 'point_x_3'])).toBe('point_x_4');
    // A derived LABEL beside label is the same column to DuckDB.
    expect(uniqueColumnName('LABEL', ['label'])).toBe('LABEL_2');
    expect(uniqueColumnName('label', ['LABEL', 'LABEL_2'])).toBe('label_3');
  });

  it('keeps names apart that differ in the case of other than ASCII letters', () => {
    // DuckDB folds the case of ASCII letters only: "É" and "é" are two columns.
    expect(uniqueColumnName('É', ['é'])).toBe('É');
  });

  it('never gives back __rowid__', () => {
    expect(uniqueColumnName('__rowid__', [])).toBe('__rowid___2');
    expect(uniqueColumnName('__ROWID__', [])).toBe('__ROWID___2');
  });

  it('takes any iterable of names, and an empty base as column', () => {
    expect(uniqueColumnName('a', new Set(['a', 'a_2']))).toBe('a_3');
    function* names() {
      yield 'b';
    }
    expect(uniqueColumnName('b', names())).toBe('b_2');
    expect(uniqueColumnName('', ['column'])).toBe('column_2');
  });

  it('makes default names unique for a whole extraction', () => {
    const existing = ['attrs', 'attrs_size'];
    const built = build('attrs', 'MAP(VARCHAR, INTEGER)', ['size']);
    expect(uniqueColumnName(built.name, existing)).toBe('attrs_size_2');
  });
});

describe('columnNameKey', () => {
  it('folds ASCII letters only', () => {
    expect(columnNameKey('Point_X')).toBe('point_x');
    expect(columnNameKey('ÉCOLE')).toBe('École');
    expect(columnNameKey('ÜnÏ')).toBe('ÜnÏ');
  });
});
