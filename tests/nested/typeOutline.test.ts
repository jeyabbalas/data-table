/**
 * The short texts of a DuckDB type: a column header's label, the summary
 * chart's outline, the stats line's summary, and the words a screen reader
 * says.
 */
import { describe, expect, it } from 'vitest';

import { parseDuckDBType } from '@/core/duckdbType';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';
import {
  TYPE_OUTLINE_MAX_LENGTH,
  columnTypeLabel,
  columnTypeSpoken,
  columnTypeTitle,
  outlinedColumnType,
  spokenType,
  typeOutline,
  type TypeOutlineForm,
} from '@/nested/typeOutline';

const FORMS: readonly TypeOutlineForm[] = ['label', 'outline', 'summary'];

function outline(type: string, form: TypeOutlineForm): string {
  return typeOutline(parseDuckDBType(type), form);
}

function forms(type: string): [string, string, string] {
  return [outline(type, 'label'), outline(type, 'outline'), outline(type, 'summary')];
}

describe('typeOutline — the plan table', () => {
  it.each([
    [
      'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
      'struct(3)',
      '{x, y, tier}',
      'x double · y double · tier varchar',
    ],
    ['INTEGER[]', '[integer]', '[integer]', '[integer]'],
    ['INTEGER[3]', 'integer[3]', 'integer[3]', 'integer[3]'],
    ['FLOAT[768]', 'float[768]', 'float[768]', 'float[768]'],
    ['MAP(VARCHAR, INTEGER)', '{varchar → integer}', '{varchar → integer}', '{varchar → integer}'],
    [
      'UNION(num INTEGER, str VARCHAR)',
      'union(2)',
      'union(num | str)',
      'num integer | str varchar',
    ],
    ['STRUCT(a INT, b VARCHAR)[]', '[struct(2)]', '[{a, b}]', '[{a integer, b varchar}]'],
    ['JSON', 'json', 'json', 'json'],
    ['VARIANT', 'variant', 'variant', 'variant'],
  ])('%s', (type, label, chartOutline, summary) => {
    expect(forms(type)).toEqual([label, chartOutline, summary]);
  });
});

describe('typeOutline — scalars', () => {
  it.each([
    ['DECIMAL(18,4)', 'decimal(18,4)'],
    ['DECIMAL(10, 2)', 'decimal(10,2)'],
    ['NUMERIC(38,0)', 'decimal(38,0)'],
    ['TIMESTAMP WITH TIME ZONE', 'timestamptz'],
    ['TIMESTAMPTZ', 'timestamptz'],
    ['TIME WITH TIME ZONE', 'timetz'],
    ['TIMESTAMP', 'timestamp'],
    ['TIMESTAMP_NS', 'timestamp_ns'],
    ["ENUM('it''s', 'y,z')", 'enum'],
    ['INT', 'integer'],
    ['INT8', 'bigint'],
    ['FLOAT8', 'double'],
    ['REAL', 'float'],
    ['TEXT', 'varchar'],
    ['BOOL', 'boolean'],
    ['BYTEA', 'blob'],
    ['HUGEINT', 'hugeint'],
    ['UUID', 'uuid'],
    ['INTERVAL', 'interval'],
  ])('%s is %s inside a list', (scalar, written) => {
    // A scalar column never shows an outline; its texts show inside nested ones.
    expect(forms(`${scalar}[]`)).toEqual([`[${written}]`, `[${written}]`, `[${written}]`]);
  });

  it('writes temporal leaves of a struct', () => {
    expect(outline('STRUCT(at TIMESTAMP WITH TIME ZONE, t TIME WITH TIME ZONE)', 'summary')).toBe(
      'at timestamptz · t timetz',
    );
  });
});

describe('typeOutline — containers', () => {
  it('nests lists, arrays and maps in every form', () => {
    expect(forms('INTEGER[2][]')).toEqual(['[integer[2]]', '[integer[2]]', '[integer[2]]']);
    expect(forms('INTEGER[][2]')).toEqual(['[integer][2]', '[integer][2]', '[integer][2]']);
    expect(forms('MAP(DATE, INTEGER[])')).toEqual([
      '{date → [integer]}',
      '{date → [integer]}',
      '{date → [integer]}',
    ]);
    expect(forms('MAP(VARCHAR, STRUCT(a INTEGER, b VARCHAR))')).toEqual([
      '{varchar → struct(2)}',
      '{varchar → {a, b}}',
      '{varchar → {a integer, b varchar}}',
    ]);
  });

  it('shows only field names in an outline, whatever their types', () => {
    const type = 'STRUCT(owner STRUCT(contact STRUCT(email VARCHAR), phones VARCHAR[]), n INTEGER)';
    expect(forms(type)).toEqual([
      'struct(2)',
      '{owner, n}',
      'owner {contact {email varchar}, phones [varchar]} · n integer',
    ]);
  });

  it('writes a union inside another type with its wrapper', () => {
    expect(forms('UNION(i INTEGER, s VARCHAR)[]')).toEqual([
      '[union(2)]',
      '[union(i | s)]',
      '[union(i integer | s varchar)]',
    ]);
    expect(forms('UNION(l INTEGER[], p STRUCT(x DOUBLE))')).toEqual([
      'union(2)',
      'union(l | p)',
      'l [integer] | p {x double}',
    ]);
  });

  it('writes JSON and VARIANT inside other types', () => {
    expect(forms('JSON[]')).toEqual(['[json]', '[json]', '[json]']);
    expect(forms('STRUCT(k VARIANT)')).toEqual(['struct(1)', '{k}', 'k variant']);
    expect(forms('VARIANT[]')).toEqual(['[variant]', '[variant]', '[variant]']);
  });

  it('writes empty structs and unions', () => {
    expect(forms('STRUCT()')).toEqual(['struct(0)', '{}', '{}']);
    expect(forms('UNION()')).toEqual(['union(0)', 'union()', 'union()']);
  });
});

describe('typeOutline — unnamed fields and odd names', () => {
  it('writes a struct of unnamed fields in parentheses, by type', () => {
    expect(forms('STRUCT(INTEGER, VARCHAR)')).toEqual([
      'struct(2)',
      '(integer, varchar)',
      'integer · varchar',
    ]);
    expect(forms('STRUCT(INTEGER, VARCHAR)[]')).toEqual([
      '[struct(2)]',
      '[(integer, varchar)]',
      '[(integer, varchar)]',
    ]);
    // An unnamed field's own type is written as a label in an outline.
    expect(outline('STRUCT(STRUCT(a INTEGER), VARCHAR)', 'outline')).toBe('(struct(1), varchar)');
  });

  it('shows names raw: quotes, commas, keywords, unicode', () => {
    const type =
      'STRUCT("my field" INTEGER, "x,y" INTEGER, "it\'s" INTEGER, "quote""d" INTEGER, ' +
      '"ünï" INTEGER, "emoji😀" INTEGER, "SELECT" INTEGER, "2" INTEGER)';
    expect(outline(type, 'outline')).toBe(
      '{my field, x,y, it\'s, quote"d, ünï, emoji😀, SELECT, 2}',
    );
    expect(outline('STRUCT("my field" INTEGER, "x,y" VARCHAR)', 'summary')).toBe(
      'my field integer · x,y varchar',
    );
  });

  it('shows a control character in a name as a space, and the empty name as ""', () => {
    expect(outline('STRUCT("a\nb" INTEGER, "" VARCHAR)', 'outline')).toBe('{a b, ""}');
    expect(outline('UNION("t\tab" INTEGER)', 'outline')).toBe('union(t ab)');
  });

  it('shows the empty name as DuckDB writes it, as nothing after a named field', () => {
    // The JSON {"b": 2, "": 1} loads as STRUCT(b BIGINT,  BIGINT).
    expect(forms('STRUCT(b BIGINT,  BIGINT)')).toEqual([
      'struct(2)',
      '{b, ""}',
      'b bigint · "" bigint',
    ]);
  });

  it('leaves markup in names as text: escaping is the caller’s', () => {
    const type = 'STRUCT("<img src=x onerror=alert(1)>" INTEGER)';
    expect(outline(type, 'outline')).toBe('{<img src=x onerror=alert(1)>}');
  });
});

describe('typeOutline — the nested stress fixture', () => {
  // DESCRIBE of tests/fixtures/datasets/parquet/nested-stress-tests.parquet.
  const ODD_NAMES =
    'STRUCT("label" VARCHAR, "name" VARCHAR, "type" VARCHAR, "data" VARCHAR, size INTEGER, ' +
    'length INTEGER, toJSON VARCHAR, constructor VARCHAR, __proto__ VARCHAR, hasOwnProperty BOOLEAN, ' +
    '"months" INTEGER, "days" INTEGER, nanoseconds BIGINT, "my field" VARCHAR, "x,y" DOUBLE, ' +
    '"quote""d" VARCHAR, "it\'s" VARCHAR, "2" INTEGER, "1" INTEGER, "10" INTEGER, "ünï" VARCHAR, ' +
    '"emoji😀" VARCHAR, "order" INTEGER, "null" VARCHAR, "SELECT" VARCHAR, ID BIGINT)';
  const TYPED_LEAVES =
    'STRUCT(dec38 DECIMAL(38,0), dec18_4 DECIMAL(18,4), uuid UUID, blob BLOB, "time" TIME, ' +
    'ts TIMESTAMP, tstz TIMESTAMP WITH TIME ZONE, date DATE, flag BOOLEAN, f32 FLOAT, i64 BIGINT)';
  const NESTED_STRUCT =
    'STRUCT("owner" STRUCT("name" VARCHAR, contact STRUCT(email VARCHAR, phones VARCHAR[], ' +
    'address STRUCT(city VARCHAR, zip VARCHAR))), "version" INTEGER)';

  it('outlines 26 odd field names without cutting one', () => {
    expect(forms(ODD_NAMES)).toEqual([
      'struct(26)',
      '{label, name, type, data, size, length, toJSON, … +19}',
      'label varchar · name varchar · type varchar · data varchar · size integer · ' +
        'length integer · toJSON varchar · … +19',
    ]);
  });

  it('writes typed leaves with their DuckDB names', () => {
    expect(forms(TYPED_LEAVES)).toEqual([
      'struct(11)',
      '{dec38, dec18_4, uuid, blob, time, ts, tstz, date, flag, … +2}',
      'dec38 decimal(38,0) · dec18_4 decimal(18,4) · uuid uuid · blob blob · time time · ' +
        'ts timestamp · tstz timestamptz · … +4',
    ]);
  });

  it('writes a struct four levels deep in full where it fits', () => {
    expect(forms(NESTED_STRUCT)).toEqual([
      'struct(2)',
      '{owner, version}',
      'owner {name varchar, contact {email varchar, phones [varchar], ' +
        'address {city varchar, zip varchar}}} · version integer',
    ]);
  });

  it('writes lists of structs, maps of structs and lists of lists', () => {
    expect(forms('STRUCT("name" VARCHAR, age INTEGER, langs VARCHAR[])[]')).toEqual([
      '[struct(3)]',
      '[{name, age, langs}]',
      '[{name varchar, age integer, langs [varchar]}]',
    ]);
    expect(forms('MAP(VARCHAR, STRUCT(qty INTEGER, price DECIMAL(10,2), note VARCHAR))')).toEqual([
      '{varchar → struct(3)}',
      '{varchar → {qty, price, note}}',
      '{varchar → {qty integer, price decimal(10,2), note varchar}}',
    ]);
    expect(forms('TINYINT[][][]')).toEqual(['[[[tinyint]]]', '[[[tinyint]]]', '[[[tinyint]]]']);
    expect(forms('TIMESTAMP WITH TIME ZONE[]')).toEqual([
      '[timestamptz]',
      '[timestamptz]',
      '[timestamptz]',
    ]);
  });
});

describe('typeOutline — length', () => {
  it.each(FORMS)('keeps %s within its budget for wide, deep and long types', (form) => {
    const wide = `STRUCT(${Array.from({ length: 40 }, (_, i) => `field_${i} DOUBLE`).join(', ')})`;
    const deep = 'INTEGER' + '[]'.repeat(40);
    const longName = `STRUCT("${'n'.repeat(20000)}" INTEGER, b VARCHAR)`;
    const wideUnion = `UNION(${Array.from({ length: 30 }, (_, i) => `member_${i} VARCHAR`).join(', ')})`;
    const deepStruct = 'STRUCT(a '.repeat(30) + 'INTEGER' + ')'.repeat(30);
    for (const type of [wide, deep, longName, wideUnion, deepStruct]) {
      const text = outline(type, form);
      expect(text.length, `${form} of ${type.slice(0, 40)}…`).toBeLessThanOrEqual(
        TYPE_OUTLINE_MAX_LENGTH[form],
      );
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('ends a list cut short with the number of fields left out', () => {
    const wide = `STRUCT(${Array.from({ length: 40 }, (_, i) => `f${i} DOUBLE`).join(', ')})`;
    const chartOutline = outline(wide, 'outline');
    expect(chartOutline).toMatch(/^\{f0, f1, f2, .*, … \+\d+\}$/);
    const shown = chartOutline
      .slice(1, -1)
      .split(', ')
      .filter((s) => !s.startsWith('…')).length;
    const missing = Number(/\+(\d+)\}$/.exec(chartOutline)![1]);
    expect(shown + missing).toBe(40);

    const summary = outline(wide, 'summary');
    expect(summary).toMatch(/^f0 double · f1 double · .* · … \+\d+$/);
    expect(outline(wide, 'label')).toBe('struct(40)');
  });

  it('shows types nested more than 8 levels deep as …', () => {
    expect(outline('INTEGER' + '[]'.repeat(12), 'label')).toBe('[[[[[[[[[…]]]]]]]]]');
  });

  it('cuts only the first entry of a list, and shows a later one whole or not at all', () => {
    expect(outline(`STRUCT("${'n'.repeat(200)}" INTEGER, b VARCHAR)`, 'outline')).toBe(
      `{${'n'.repeat(55)}…, b}`,
    );
    const nested = `STRUCT(a STRUCT(${Array.from({ length: 30 }, (_, i) => `x${i} INTEGER`).join(', ')}), b INTEGER)`;
    expect(outline(nested, 'summary')).toBe(
      'a {x0 integer, x1 integer, x2 integer, x3 integer, x4 integer, x5 integer, ' +
        'x6 integer, x7 integer, … +22} · b integer',
    );
  });

  it('cuts a long name, never inside a surrogate pair', () => {
    const text = outline(`STRUCT("${'😀'.repeat(100)}" INTEGER)`, 'outline');
    expect(text.length).toBeLessThanOrEqual(TYPE_OUTLINE_MAX_LENGTH.outline);
    expect(text).toMatch(/…\}$/);
    // Every surrogate pair is whole.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text)).toBe(false);
  });

  it('shows a type the parser could not read as it is, cut to the budget', () => {
    expect(outline('STRUCT(a INTEGER', 'label')).toBe('STRUCT(a INTEGER');
    const long = 'STRUCT(' + 'x'.repeat(200);
    expect(outline(long, 'label')).toHaveLength(TYPE_OUTLINE_MAX_LENGTH.label);
  });
});

describe('spokenType', () => {
  it.each([
    ['INTEGER[]', 'list of integer'],
    ['VARCHAR[][]', 'list of list of varchar'],
    ['FLOAT[768]', 'array of 768 float'],
    ['STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)', 'struct with 3 fields'],
    ['STRUCT(a INT)[]', 'list of struct with 1 field'],
    ['MAP(VARCHAR, INTEGER)', 'map from varchar to integer'],
    ['UNION(num INTEGER, str VARCHAR)', 'union of 2 types'],
    ['UNION(num INTEGER)', 'union of 1 type'],
    ['JSON', 'JSON'],
    ['VARIANT', 'variant'],
    ['DECIMAL(10,2)[]', 'list of decimal'],
    ['TIMESTAMPTZ[]', 'list of timestamp with time zone'],
  ])('%s is "%s"', (type, words) => {
    expect(spokenType(parseDuckDBType(type))).toBe(words);
  });

  it('takes its words from the strings', () => {
    const messages = mergeStrings(defaultStrings, {
      values: {
        typeList: (element) => `liste de ${element}`,
        typeStruct: (n) => `structure à ${n} champs`,
      },
    });
    expect(spokenType(parseDuckDBType('STRUCT(a INTEGER, b INTEGER)[]'), messages)).toBe(
      'liste de structure à 2 champs',
    );
  });

  it('stops after 8 levels', () => {
    const words = spokenType(parseDuckDBType('INTEGER' + '[]'.repeat(40)));
    expect(words.split('list of').length - 1).toBe(9);
    expect(words.endsWith('…')).toBe(true);
  });
});

describe('column type texts', () => {
  const col = (type: ColumnSchema['type'], originalType: string) => ({ type, originalType });

  it('outlines nested and JSON columns, and no others', () => {
    expect(outlinedColumnType(col('nested', 'INTEGER[]'))?.kind).toBe('list');
    expect(outlinedColumnType(col('string', 'JSON'))?.kind).toBe('json');
    expect(outlinedColumnType(col('string', 'VARCHAR'))).toBeNull();
    expect(outlinedColumnType(col('integer', 'INTEGER'))).toBeNull();
    expect(outlinedColumnType(col('uuid', 'UUID'))).toBeNull();
  });

  it('labels a nested or JSON column by its outline, others by their type', () => {
    expect(columnTypeLabel(col('nested', 'STRUCT(x DOUBLE, y DOUBLE)'))).toBe('struct(2)');
    expect(columnTypeLabel(col('nested', 'VARIANT'))).toBe('variant');
    expect(columnTypeLabel(col('string', 'JSON'))).toBe('json');
    expect(columnTypeLabel(col('string', 'VARCHAR'))).toBe('string');
    expect(columnTypeLabel(col('float', 'DOUBLE'))).toBe('float');
    // An empty or missing type falls back to the library's.
    expect(columnTypeLabel(col('nested', ''))).toBe('nested');
  });

  it('titles a nested or JSON column with its full type', () => {
    expect(columnTypeTitle(col('nested', 'STRUCT(x DOUBLE)'))).toBe('STRUCT(x DOUBLE)');
    expect(columnTypeTitle(col('string', 'JSON'))).toBe('JSON');
    expect(columnTypeTitle(col('string', 'VARCHAR'))).toBeNull();
    expect(columnTypeTitle(col('nested', ''))).toBeNull();
  });

  it('speaks a nested or JSON column’s type, others by their type', () => {
    expect(columnTypeSpoken(col('nested', 'INTEGER[]'))).toBe('list of integer');
    expect(columnTypeSpoken(col('string', 'JSON'))).toBe('JSON');
    expect(columnTypeSpoken(col('string', 'VARCHAR'))).toBe('string');
    expect(columnTypeSpoken(col('date', 'DATE'))).toBe('date');
  });
});
