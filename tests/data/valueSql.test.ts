/**
 * SQL text of `gridValueSQL` and `jsonValueSQL`, per kind of column. What
 * the SQL returns on a real engine is `valueSql.duckdb.test.ts`'s subject;
 * this file pins the text and the choices: which columns are read as text,
 * which are sliced, which are capped, and which JSON route each takes.
 */
import { describe, expect, it } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import { BLOB_PREVIEW, PREVIEW_ITEMS, TEXT_CAP, gridValueSQL, jsonValueSQL } from '@/data/valueSql';

/** A column of `originalType`, typed as the loaders type it. */
function col(originalType: string, name = 'c'): ColumnSchema {
  return { name, type: mapDuckDBType(originalType), nullable: true, originalType };
}

const grid = (originalType: string, quoted = '"c"') => gridValueSQL(col(originalType), quoted);
const json = (originalType: string, quoted = '"c"') => jsonValueSQL(col(originalType), quoted);

/** The capped form of `text`. */
const capped = (text: string) =>
  `list_transform([${text}], lambda txt: CASE WHEN strlen(txt) > 1000` +
  ` AND strlen(left_grapheme(txt, 1000)) < strlen(txt)` +
  ` THEN concat(left_grapheme(txt, 1000), '…') ELSE txt END)[1]`;

const LIST_TEXT =
  `CASE WHEN len("c") > 32` +
  ` THEN concat(left(CAST("c"[1:32] AS VARCHAR), -1), ', … +', len("c") - 32, ']')` +
  ` ELSE CAST("c" AS VARCHAR) END`;

const MAP_TEXT =
  `CASE WHEN cardinality("c") > 32` +
  ` THEN concat(left(CAST(map_from_entries(map_entries("c")[1:32]) AS VARCHAR), -1), ', … +', cardinality("c") - 32, '}')` +
  ` ELSE CAST("c" AS VARCHAR) END`;

const BLOB_TEXT =
  `CASE WHEN octet_length("c") > 256` +
  ` THEN concat(CAST("c"[1:256] AS VARCHAR), '… +', octet_length("c") - 256)` +
  ` ELSE CAST("c" AS VARCHAR) END`;

const CAST_TEXT = 'CAST("c" AS VARCHAR)';

const isCapped = (sql: string | null) => sql !== null && sql.startsWith('list_transform([');

describe('constants', () => {
  it('are the documented bounds', () => {
    expect(PREVIEW_ITEMS).toBe(32);
    expect(TEXT_CAP).toBe(1000);
    expect(BLOB_PREVIEW).toBe(256);
  });
});

describe('gridValueSQL', () => {
  describe('lists and arrays', () => {
    it('a list shows 32 items and how many more, capped when its items are text', () => {
      expect(grid('VARCHAR[]')).toBe(capped(LIST_TEXT));
    });

    it('a list of numbers is not capped: 32 of them always fit', () => {
      expect(grid('INTEGER[]')).toBe(LIST_TEXT);
    });

    it('an array of more than 32 items is sliced like a list', () => {
      expect(grid('FLOAT[768]')).toBe(LIST_TEXT);
      expect(grid('INTEGER[33]')).toBe(LIST_TEXT);
    });

    it('an array of 32 items or fewer is a plain cast', () => {
      expect(grid('INTEGER[3]')).toBe(CAST_TEXT);
      expect(grid('INTEGER[32]')).toBe(CAST_TEXT);
      expect(grid('VARCHAR[3]')).toBe(capped(CAST_TEXT));
    });

    it('a list of lists slices only the outer list, and is capped', () => {
      expect(grid('INTEGER[][]')).toBe(capped(LIST_TEXT));
      expect(grid('TINYINT[][][]')).toBe(capped(LIST_TEXT));
    });
  });

  it('a map shows 32 entries and how many more', () => {
    expect(grid('MAP(VARCHAR, INTEGER)')).toBe(capped(MAP_TEXT));
    expect(grid('MAP(INTEGER, INTEGER)')).toBe(MAP_TEXT);
    expect(grid('MAP(DATE, INTEGER[])')).toBe(capped(MAP_TEXT));
    expect(grid('MAP(STRUCT(k INTEGER), VARCHAR)')).toBe(capped(MAP_TEXT));
  });

  it('a struct, union or VARIANT is its whole text, capped unless its type bounds it', () => {
    expect(grid('STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)')).toBe(capped(CAST_TEXT));
    expect(grid('STRUCT(x DOUBLE, y DOUBLE)')).toBe(CAST_TEXT);
    expect(grid('STRUCT(INTEGER, VARCHAR)')).toBe(capped(CAST_TEXT));
    expect(grid('STRUCT(HUGEINT, UHUGEINT)')).toBe(CAST_TEXT);
    expect(grid('UNION(n INTEGER, s VARCHAR)')).toBe(capped(CAST_TEXT));
    expect(grid('UNION(i INTEGER, d DOUBLE)')).toBe(CAST_TEXT);
    expect(grid('VARIANT')).toBe(capped(CAST_TEXT));
    expect(grid('VARIANT[]')).toBe(capped(LIST_TEXT));
    expect(grid('STRUCT(k VARIANT)')).toBe(capped(CAST_TEXT));
  });

  it('JSON is read as it is: its text is already a string', () => {
    expect(grid('JSON')).toBeNull();
    expect(grid('JSON[]')).toBe(capped(LIST_TEXT));
  });

  it('a BLOB shows its first 256 bytes and how many more, capped', () => {
    expect(grid('BLOB')).toBe(capped(BLOB_TEXT));
  });

  it('BIT, GEOMETRY and BIGNUM, which Arrow carries as bytes, are cast and capped', () => {
    for (const type of ['BIT', 'GEOMETRY', 'BIGNUM', 'VARINT']) {
      expect(grid(type), type).toBe(capped(CAST_TEXT));
    }
  });

  it('INTERVAL keeps its plain cast', () => {
    expect(grid('INTERVAL')).toBe(CAST_TEXT);
  });

  it('scalars Arrow carries well are read as they are', () => {
    for (const type of [
      'INTEGER',
      'BIGINT',
      'HUGEINT',
      'DOUBLE',
      'DECIMAL(18,4)',
      'BOOLEAN',
      'VARCHAR',
      'DATE',
      'TIME',
      'TIMESTAMP',
      'TIMESTAMP WITH TIME ZONE',
      'UUID',
      "ENUM('a', 'b')",
    ]) {
      expect(grid(type), type).toBeNull();
    }
  });

  it('a type the parser cannot read is cast and capped when it looks nested', () => {
    expect(grid('STRUCT(a INTEGER')).toBe(capped(CAST_TEXT));
    expect(grid('NOT A TYPE (')).toBeNull();
    const interval: ColumnSchema = {
      name: 'c',
      type: 'interval',
      nullable: true,
      originalType: 'NOT A TYPE (',
    };
    expect(gridValueSQL(interval, '"c"')).toBe(CAST_TEXT);
  });

  it('a schema entry built without its DuckDB type is read by its DataType', () => {
    const bare = { name: 'c', type: 'integer', nullable: true } as unknown as ColumnSchema;
    expect(gridValueSQL(bare, '"c"')).toBeNull();
    expect(gridValueSQL({ ...bare, type: 'interval' }, '"c"')).toBe(CAST_TEXT);
  });

  describe('which columns are capped: only those whose type does not bound their text', () => {
    it.each([
      ['BOOLEAN[]', false],
      ['TINYINT[]', false],
      ['BIGINT[]', false],
      ['UBIGINT[]', false],
      ['FLOAT[]', false],
      ['DOUBLE[]', false],
      ['DECIMAL(10,2)[]', false],
      ['DECIMAL(25,4)[]', false],
      ['DATE[]', false],
      ['TIME[]', false],
      ['INTEGER[2][]', false],
      ['FLOAT[768]', false],
      ['HUGEINT[]', true],
      ['UHUGEINT[]', true],
      ['DECIMAL(26,4)[]', true],
      ['DECIMAL(38,0)[]', true],
      ['TIMESTAMP[]', true],
      ['TIMESTAMP WITH TIME ZONE[]', true],
      ['UUID[]', true],
      ['INTERVAL[]', true],
      ["ENUM('x', 'y')[]", true],
      ['BLOB[]', true],
      ['BIT[]', true],
      ['INTEGER[3][]', true],
      ['STRUCT(a INTEGER, b VARCHAR)[]', true],
    ])('%s: capped %s', (type, expected) => {
      expect(isCapped(grid(type))).toBe(expected);
    });
  });

  describe('the column operand', () => {
    it('uses a quoted identifier as it is, escaped quotes and all', () => {
      expect(gridValueSQL(col('INTEGER[]'), '"my ""odd"" col"')).toBe(
        LIST_TEXT.replaceAll('"c"', '"my ""odd"" col"'),
      );
      expect(gridValueSQL(col('INTEGER[3]'), '"t"."c"')).toBe('CAST("t"."c" AS VARCHAR)');
    });

    it('parenthesises anything else, so a slice applies to all of it', () => {
      const sql = gridValueSQL(col('INTEGER[]'), 'list_concat("a", "b")')!;
      expect(sql).toContain('CAST((list_concat("a", "b"))[1:32] AS VARCHAR)');
      expect(sql).toContain('len((list_concat("a", "b")))');
    });

    it('a name with brackets or a lambda keyword in it stays inside its quotes', () => {
      const sql = gridValueSQL(col('VARCHAR[]', 'lambda txt: [1:32]'), '"lambda txt: [1:32]"')!;
      expect(sql).toContain('len("lambda txt: [1:32]") > 32');
    });
  });
});

describe('jsonValueSQL', () => {
  it('reads most types through to_json', () => {
    for (const type of [
      'VARCHAR[]',
      'INTEGER[3]',
      'STRUCT(x DOUBLE, tier VARCHAR)',
      'STRUCT(INTEGER, VARCHAR)',
      'MAP(VARCHAR, INTEGER)',
      'UNION(i INTEGER, s VARCHAR)',
      'DECIMAL(10,2)[]',
      'INTEGER',
      'VARCHAR',
      'BLOB',
      'INTERVAL',
    ]) {
      expect(json(type), type).toBe('CAST(to_json("c") AS VARCHAR)');
    }
  });

  it('reads a JSON column as its text', () => {
    expect(json('JSON')).toBe('CAST("c" AS VARCHAR)');
  });

  it('reads a JSON list through to_json, which keeps its values as JSON', () => {
    expect(json('JSON[]')).toBe('CAST(to_json("c") AS VARCHAR)');
  });

  it('casts a VARIANT to JSON, keeping NULL', () => {
    expect(json('VARIANT')).toBe(
      'CASE WHEN "c" IS NULL THEN NULL ELSE CAST(CAST("c" AS JSON) AS VARCHAR) END',
    );
  });

  it('reads a type holding a VARIANT through VARIANT, keeping NULL', () => {
    const viaVariant =
      'CASE WHEN "c" IS NULL THEN NULL ELSE CAST(CAST(CAST("c" AS VARIANT) AS JSON) AS VARCHAR) END';
    for (const type of [
      'VARIANT[]',
      'STRUCT(k VARIANT)',
      'MAP(VARCHAR, VARIANT)',
      'STRUCT(a STRUCT(b VARIANT[]))',
      'UNION(v VARIANT, i INTEGER)',
    ]) {
      expect(json(type), type).toBe(viaVariant);
    }
  });

  it('names the fields of an unnamed struct by position before the cast to VARIANT', () => {
    expect(json("STRUCT(VARIANT, ENUM('a', 'it''s'))[]")).toBe(
      `CASE WHEN "c" IS NULL THEN NULL ELSE CAST(CAST(CAST(CAST("c" AS STRUCT("1" VARIANT, "2" ENUM('a', 'it''s'))[]) AS VARIANT) AS JSON) AS VARCHAR) END`,
    );
    expect(
      json(
        'STRUCT(v VARIANT, p STRUCT(INTEGER, DECIMAL(18,4)[2]), m MAP(VARCHAR, UNION("my tag" INTEGER)))',
      ),
    ).toBe(
      `CASE WHEN "c" IS NULL THEN NULL ELSE CAST(CAST(CAST(CAST("c" AS STRUCT("v" VARIANT, "p" STRUCT("1" INTEGER, "2" DECIMAL(18,4)[2]), "m" MAP(VARCHAR, UNION("my tag" INTEGER)))) AS VARIANT) AS JSON) AS VARCHAR) END`,
    );
  });

  it('reads a type the parser cannot read through VARIANT only when it names VARIANT', () => {
    expect(json('STRUCT(v VARIANT')).toBe(
      'CASE WHEN "c" IS NULL THEN NULL ELSE CAST(CAST(CAST("c" AS VARIANT) AS JSON) AS VARCHAR) END',
    );
    expect(json('STRUCT(a INTEGER')).toBe('CAST(to_json("c") AS VARCHAR)');
  });

  it('parenthesises an operand that is not a quoted identifier', () => {
    expect(jsonValueSQL(col('VARIANT'), 'a.b')).toBe(
      'CASE WHEN (a.b) IS NULL THEN NULL ELSE CAST(CAST((a.b) AS JSON) AS VARCHAR) END',
    );
    expect(jsonValueSQL(col('INTEGER[]'), '"t"."c"')).toBe('CAST(to_json("t"."c") AS VARCHAR)');
  });
});
