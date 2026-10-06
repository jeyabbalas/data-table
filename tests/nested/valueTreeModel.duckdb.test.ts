/**
 * The value tree over real values (DuckDB, Node target): every nested and
 * JSON column of both nested stress fixture files and every SQL-only
 * companion, read the way the value inspector reads a cell (`jsonValueSQL`
 * → `parseJsonTree` → `buildValueTree`), for the showcase rows 0–11 and 50
 * seeded rows, each tree expanded in full.
 *
 * DuckDB is the oracle:
 *
 * - The number of leaves (values without children: scalars, NULLs, empty
 *   containers) equals a count computed in SQL with `len`, `cardinality`
 *   and lambdas, for every column whose shape SQL can count (no UNION, JSON
 *   or VARIANT inside).
 * - Sampled nodes, read back with SQL built from their `path`
 *   (`"c"['a'][2]`, `struct_extract`, `map_extract_value`, `union_extract`,
 *   `json_extract`), hold the same JSON; a sampled scalar leaf shows the
 *   text DuckDB itself writes for it (`CAST(… AS VARCHAR)` for dates, BLOBs,
 *   UUIDs and FLOATs; `to_json`'s digits for other numbers).
 *
 * Never send `to_json` or `CAST(… AS JSON)` of a type holding a VARIANT to
 * the database here: DuckDB 1.5.4 answers with an INTERNAL error that
 * invalidates it for every later test. `jsonValueSQL` routes those through
 * VARIANT.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dataTypeOf, parseDuckDBType, type DuckDBTypeNode } from '@/core/duckdbType';
import { parseJsonTree, type JsonNode } from '@/core/jsonTree';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { jsonValueSQL } from '@/data/valueSql';
import {
  VALUE_TREE_BUCKET_SIZE,
  VALUE_TREE_PREVIEW_CHARS,
  VALUE_TREE_STRING_CAP,
  buildValueTree,
  formatFloat32,
  nodeJsonText,
  type ValueTreeMessages,
  type ValueTreeNode,
  type ValueTreePathStep,
} from '@/nested/valueTreeModel';
import { quoteIdentifier } from '@/worker/loaders/common';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { SHOWCASE, loadNestedFixture } from '../helpers/nestedFixture';
import { SQL_ONLY_COLUMNS, createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

const messages: ValueTreeMessages = {
  itemCount: (n) => `${n} items`,
  entryCount: (n) => `${n} entries`,
  fieldCount: (n) => `${n} fields`,
  keyCount: (n) => `${n} keys`,
  bucketLabel: (first, last) => `[${first} … ${last}]`,
  moreCharacters: (n) => `${n} more characters`,
};

/** The showcase rows, then 50 seeded rows of the rest (distinct: 389 and 988 share no factor). */
const FIXTURE_ROWS = [
  ...Object.values(SHOWCASE),
  ...Array.from({ length: 50 }, (_, k) => 12 + ((k * 389) % 988)),
];

/** Rows of the SQL-only companions' table: all of them. */
const COMPANION_ROWS = 64;

/** A SQL string literal. */
const lit = (text: string) => `'${text.replaceAll("'", "''")}'`;

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

/**
 * SQL counting the leaves the tree shows for `expr` of `type`: scalars,
 * NULLs and empty containers. `null` for a type whose shape SQL cannot
 * count here (a UNION, JSON or VARIANT inside).
 */
function leafCountSQL(expr: string, type: DuckDBTypeNode, depth = 0): string | null {
  const x = `x${depth}`;
  switch (type.kind) {
    case 'scalar':
      return '1';
    case 'list':
    case 'array': {
      const inner = leafCountSQL(x, type.element, depth + 1);
      return inner === null
        ? null
        : `CASE WHEN ${expr} IS NULL OR len(${expr}) = 0 THEN 1 ` +
            `ELSE list_sum(list_transform(${expr}, lambda ${x}: ${inner})) END`;
    }
    case 'map': {
      const inner = leafCountSQL(x, type.value, depth + 1);
      return inner === null
        ? null
        : `CASE WHEN ${expr} IS NULL OR cardinality(${expr}) = 0 THEN 1 ` +
            `ELSE list_sum(list_transform(map_values(${expr}), lambda ${x}: ${inner})) END`;
    }
    case 'struct': {
      const parts = type.fields.map((field, i) =>
        leafCountSQL(
          field.name === null ? `struct_extract(${expr}, ${i + 1})` : `${expr}[${lit(field.name)}]`,
          field.type,
          depth,
        ),
      );
      if (parts.some((part) => part === null)) return null;
      return `CASE WHEN ${expr} IS NULL THEN 1 ELSE ${parts.join(' + ') || '1'} END`;
    }
    default:
      return null;
  }
}

/** A JSONPath for steps inside a JSON value, or `null` when one is not expressible as one here. */
function jsonPath(steps: readonly ValueTreePathStep[]): string | null {
  let path = '$';
  for (const step of steps) {
    if (typeof step === 'number') path += `[${step}]`;
    else if (step === '' || step === '*') return null;
    else path += `."${step.replace(/["\\]/g, '\\$&')}"`;
  }
  return path;
}

/** SQL reading `path` of `column`, and the DuckDB type it gives; `null` when not expressible. */
function pathSQL(
  column: ColumnSchema,
  path: readonly ValueTreePathStep[],
): { expr: string; type: DuckDBTypeNode } | null {
  let type = parseDuckDBType(column.originalType);
  let expr = quoteIdentifier(column.name);
  for (let i = 0; i < path.length; i++) {
    const step = path[i]!;
    switch (type.kind) {
      case 'struct': {
        const index =
          typeof step === 'number' ? step - 1 : type.fields.findIndex((f) => f.name === step);
        const field = type.fields[index]!;
        expr =
          field.name === null
            ? `struct_extract(${expr}, ${index + 1})`
            : `${expr}[${lit(field.name)}]`;
        type = field.type;
        break;
      }
      case 'list':
      case 'array':
        expr = `${expr}[${step}]`;
        type = type.element;
        break;
      case 'map': {
        const key = type.key;
        const literal =
          typeof step === 'number'
            ? String(step)
            : key.kind === 'scalar' && key.name === 'VARCHAR'
              ? lit(step)
              : `CAST(${lit(step)} AS ${key.sqlType})`;
        expr = `map_extract_value(${expr}, ${literal})`;
        type = type.value;
        break;
      }
      case 'union':
        expr = `union_extract(${expr}, ${lit(String(step))})`;
        type = type.members.find((m) => m.tag === step)!.type;
        break;
      case 'json':
      case 'variant': {
        const json = jsonPath(path.slice(i));
        if (json === null) return null;
        const source = type.kind === 'variant' ? `CAST(${expr} AS JSON)` : expr;
        return { expr: `json_extract(${source}, ${lit(json)})`, type: parseDuckDBType('JSON') };
      }
      default:
        throw new Error(`path ${JSON.stringify(path)} steps into ${type.sqlType}`);
    }
  }
  return { expr, type };
}

/** `to_json`-style JSON of `expr` of `type`, as the inspector reads it (never `to_json` of a VARIANT). */
function jsonOf(expr: string, type: DuckDBTypeNode): string {
  const column: ColumnSchema = {
    name: 'v',
    type: dataTypeOf(type),
    nullable: true,
    originalType: type.sqlType,
  };
  return jsonValueSQL(column, expr);
}

/** A JSON number's text, in one spelling per value: digits and words compared as doubles. */
function canonicalNumber(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('nan')) return 'NaN';
  if (lower.includes('inf')) return lower.startsWith('-') ? '-Infinity' : 'Infinity';
  const value = Number(raw);
  return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * JSON in one spelling: no whitespace, numbers as doubles. `json_extract`
 * rewrites the numbers of the JSON it returns (`1.50` → `1.5`), and a value
 * through VARIANT keeps a DECIMAL's zeros where `to_json` drops them.
 */
function canonical(node: JsonNode): string {
  switch (node.kind) {
    case 'object':
      return `{${node.entries.map((e) => `${JSON.stringify(e.key)}:${canonical(e.value)}`).join(',')}}`;
    case 'array':
      return `[${node.items.map(canonical).join(',')}]`;
    case 'number':
      return canonicalNumber(node.raw);
    case 'string':
      return JSON.stringify(node.value);
    case 'boolean':
      return String(node.value);
    case 'null':
      return 'null';
  }
}

/** DuckDB's text for a FLOAT, in JavaScript's words for the numbers that are not finite. */
function duckFloat(text: string): string {
  if (text === 'nan' || text === '-nan') return 'NaN';
  if (text === 'inf') return 'Infinity';
  if (text === '-inf') return '-Infinity';
  return text;
}

const TEXT_DATA_TYPES = new Set(['date', 'time', 'timestamp', 'interval', 'uuid']);
const TEXT_NAMES = new Set(['BLOB', 'BIT', 'ENUM']);

/**
 * What a scalar leaf of `type` shows, from DuckDB's own text for it (`text`,
 * `CAST(… AS VARCHAR)`) and its JSON (`json`, as `to_json` wrote it).
 */
function expectedLeafText(type: DuckDBTypeNode, text: string, json: string): string {
  if (type.kind !== 'scalar') throw new Error(`not a scalar: ${type.sqlType}`);
  const { dataType, name } = type;
  if (name === 'FLOAT' || name === 'REAL') return duckFloat(text);
  if (dataType === 'float' || dataType === 'decimal' || dataType === 'integer') {
    return /^-?\d/.test(json) ? json : canonicalNumber(json);
  }
  if (dataType === 'boolean' || TEXT_DATA_TYPES.has(dataType) || TEXT_NAMES.has(name)) return text;
  // Quoted as JSON.stringify quotes, DEL and the C1 controls escaped as well.
  return JSON.stringify(text).replace(
    /[\u007f-\u009f]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

// ---------------------------------------------------------------------------
// Walking a tree
// ---------------------------------------------------------------------------

interface Walked {
  /** Every node that is not a bucket, depth first. */
  readonly nodes: ValueTreeNode[];
  /** Nodes without children. */
  readonly leaves: number;
  /** Depth of each node, for picking a deep one. */
  readonly depths: Map<ValueTreeNode, number>;
}

/** Expand everything, checking what every node promises on the way. */
function walk(root: ValueTreeNode, where: string): Walked {
  const ids = new Set<string>();
  const nodes: ValueTreeNode[] = [];
  const depths = new Map<ValueTreeNode, number>();
  let leaves = 0;
  const stack: [ValueTreeNode, number][] = [[root, 0]];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [node, depth] = next;
    if (ids.has(node.id)) throw new Error(`${where}: duplicate id ${node.id}`);
    ids.add(node.id);
    if (node.key && !node.label.startsWith(node.key.text)) {
      throw new Error(`${where}: label ${node.label} does not start with ${node.key.text}`);
    }
    if (node.preview !== undefined && node.preview.length > VALUE_TREE_PREVIEW_CHARS) {
      throw new Error(`${where}: preview too long: ${node.preview}`);
    }
    if (!node.bucket) {
      nodes.push(node);
      depths.set(node, depth);
    }
    const children = node.children?.() ?? [];
    if (children.length > VALUE_TREE_BUCKET_SIZE) throw new Error(`${where}: too many children`);
    if (!node.children) leaves++;
    // Containers list their count of children, through any buckets.
    if (node.count !== undefined && !node.bucket && node.children) {
      const shown = children[0]?.bucket
        ? children.reduce((sum, b) => sum + b.count!, 0)
        : children.length;
      if (shown !== node.count) {
        throw new Error(`${where}: ${node.id} shows ${shown} of ${node.count}`);
      }
    }
    // A bucket is not a level of its own: its children sit one level below its container.
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push([children[i]!, node.bucket ? depth : depth + 1]);
    }
  }
  return { nodes, leaves, depths };
}

/** A few nodes with paths: the root, the deepest, the last, and one more picked by `seed`. */
function pickSamples(walked: Walked, seed: number): ValueTreeNode[] {
  const withPath = walked.nodes.filter((n) => n.path !== null);
  if (withPath.length === 0) return [];
  let deepest = withPath[0]!;
  for (const node of withPath) {
    if (walked.depths.get(node)! > walked.depths.get(deepest)!) deepest = node;
  }
  const picked = [
    withPath[0]!,
    deepest,
    withPath[withPath.length - 1]!,
    withPath[(seed * 7919) % withPath.length]!,
  ];
  return [...new Set(picked)];
}

// ---------------------------------------------------------------------------

describe('value tree over the nested stress fixture (real DuckDB)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;
  const tables: { table: string; columns: ColumnSchema[]; rows: number[] }[] = [];

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    for (const format of ['parquet', 'json'] as const) {
      const loaded = await loadNestedFixture(harness, format);
      tables.push({
        table: loaded.tableName,
        columns: loaded.schema.filter((c) => parseDuckDBType(c.originalType).kind !== 'scalar'),
        rows: FIXTURE_ROWS,
      });
    }
    await createSqlOnlyTable(harness.conn, 'companions_table', COMPANION_ROWS);
    await createSqlOnlyView(harness.conn, 'companions', 'companions_table');
    tables.push({
      table: 'companions',
      columns: SQL_ONLY_COLUMNS.map((c) => ({
        name: c.name,
        type: 'nested',
        nullable: true,
        originalType: c.type,
      })),
      rows: Array.from({ length: COMPANION_ROWS }, (_, i) => i),
    });
  }, 60_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('covers every nested and JSON column', () => {
    const names = tables.map((t) => `${t.table}: ${t.columns.map((c) => c.name).join(', ')}`);
    expect(tables[0]!.columns.map((c) => c.name)).toContain('odd_names');
    expect(tables[0]!.columns.map((c) => c.name)).toContain('doc');
    expect(tables[1]!.columns.map((c) => c.name)).toContain('shifty');
    expect(tables[2]!.columns).toHaveLength(SQL_ONLY_COLUMNS.length);
    expect(
      tables.reduce((sum, t) => sum + t.columns.length, 0),
      names.join('\n'),
    ).toBeGreaterThan(50);
  });

  it('builds and expands every value; leaf counts, paths and leaf texts agree with DuckDB', async () => {
    let trees = 0;
    let checkedSamples = 0;
    let checkedLeaves = 0;
    let countedColumns = 0;
    for (const { table, columns, rows } of tables) {
      for (const column of columns) {
        const quoted = quoteIdentifier(column.name);
        const type = parseDuckDBType(column.originalType);
        const countSQL = leafCountSQL(quoted, type);
        if (countSQL !== null) countedColumns++;
        const values = await bridge.query<{ r: number; j: string | null; n?: number | null }>(
          `SELECT "__rowid__" AS r, ${jsonValueSQL(column, quoted)} AS j` +
            (countSQL === null ? '' : `, ${countSQL} AS n`) +
            ` FROM ${quoteIdentifier(table)} WHERE "__rowid__" IN (${rows.join(', ')}) ORDER BY r`,
        );
        expect(values, `${table}.${column.name}`).toHaveLength(rows.length);

        const samples: { node: ValueTreeNode; row: number; expr: string; type: DuckDBTypeNode }[] =
          [];
        for (const { r, j, n } of values) {
          const where = `${table}.${column.name} row ${r}`;
          const parsed = parseJsonTree(j ?? 'null');
          expect(parsed.truncated, where).toBe(false);
          const root = buildValueTree(parsed.root, type, messages, { rootKey: column.name });
          const walked = walk(root, where);
          trees++;
          if (countSQL !== null) expect(walked.leaves, where).toBe(Number(n));
          if (j === null) continue;
          for (const node of pickSamples(walked, r)) {
            const at = pathSQL(column, node.path!);
            if (at) samples.push({ node, row: r, expr: at.expr, type: at.type });
          }
        }
        if (samples.length === 0) continue;

        // One query per column reads every sample back.
        const read = await bridge.query<{ k: number; j: string | null; t: string | null }>(
          samples
            .map(
              (s, k) =>
                `SELECT ${k} AS k, ${jsonOf(s.expr, s.type)} AS j, CAST(${s.expr} AS VARCHAR) AS t ` +
                `FROM ${quoteIdentifier(table)} WHERE "__rowid__" = ${s.row}`,
            )
            .join(' UNION ALL ') + ' ORDER BY k',
        );
        expect(read).toHaveLength(samples.length);
        for (const { k, j, t } of read) {
          const { node, row } = samples[k]!;
          const where = `${table}.${column.name} row ${row} path ${JSON.stringify(node.path)}`;
          const sql = j === null ? 'null' : canonical(parseJsonTree(j).root);
          expect(canonical(node.json), where).toBe(sql);
          // What Copy JSON gives is standard JSON.
          expect(() => JSON.parse(nodeJsonText(node)), where).not.toThrow();
          checkedSamples++;
          if (!node.value || j === null || node.type?.kind !== 'scalar') {
            if (j === null) expect(node.value?.style ?? 'null', where).toBe('null');
            continue;
          }
          const expected = expectedLeafText(node.type, t!, j);
          if (node.value.more === undefined) {
            expect(node.value.text, where).toBe(expected);
          } else {
            // Cut: the text shown is the start of the text expected.
            const head = node.value.text.endsWith('…"')
              ? node.value.text.slice(0, -2)
              : node.value.text.slice(0, -1);
            expect(expected.startsWith(head), where).toBe(true);
          }
          checkedLeaves++;
        }
      }
    }
    expect(trees).toBeGreaterThan(4000);
    expect(countedColumns).toBeGreaterThanOrEqual(50);
    expect(checkedSamples).toBeGreaterThan(9000);
    expect(checkedLeaves).toBeGreaterThan(4500);
  }, 240_000);

  it('lists long_list rows 5–7 (1,000, 2,500 and 10,000 items) through buckets, in order', async () => {
    const parquet = tables[0]!;
    const column = parquet.columns.find((c) => c.name === 'long_list')!;
    const rows = await bridge.query<{ r: number; j: string; n: number }>(
      `SELECT "__rowid__" AS r, ${jsonValueSQL(column, '"long_list"')} AS j, len("long_list") AS n ` +
        `FROM ${quoteIdentifier(parquet.table)} WHERE "__rowid__" IN (5, 6, 7) ORDER BY r`,
    );
    expect(rows.map((row) => row.n)).toEqual([1000, 2500, 10_000]);
    const buckets: string[][] = [];
    for (const { j, n } of rows) {
      const root = buildValueTree(
        parseJsonTree(j).root,
        parseDuckDBType(column.originalType),
        messages,
      );
      expect(root.count).toBe(n);
      const top = root.children!();
      buckets.push(top.slice(0, 2).map((b) => b.label));
      expect(top).toHaveLength(Math.ceil(n / 100));
      const all = top.flatMap((b) => [...b.children!()]);
      expect(all).toHaveLength(n);
      expect(
        all.every(
          (item, i) => item.key?.text === String(i + 1) && item.value?.text === String(i + 1),
        ),
      ).toBe(true);
      expect(all[n - 1]!.path).toEqual([n]);
    }
    expect(buckets).toEqual([
      ['[1 … 100]', '[101 … 200]'],
      ['[1 … 100]', '[101 … 200]'],
      ['[1 … 100]', '[101 … 200]'],
    ]);
  });

  it('cuts the 20,000-character element of strings_edge at the cap', async () => {
    const parquet = tables[0]!;
    const column = parquet.columns.find((c) => c.name === 'strings_edge')!;
    const [row] = await bridge.query<{ j: string; longest: number }>(
      `SELECT ${jsonValueSQL(column, '"strings_edge"')} AS j, list_max(list_transform("strings_edge", lambda s: length(s))) AS longest ` +
        `FROM ${quoteIdentifier(parquet.table)} WHERE "__rowid__" = ${SHOWCASE.CAP_EDGE}`,
    );
    expect(row!.longest).toBeGreaterThanOrEqual(20_000);
    const root = buildValueTree(
      parseJsonTree(row!.j).root,
      parseDuckDBType(column.originalType),
      messages,
    );
    const cut = root.children!().filter((c) => c.value?.more !== undefined);
    expect(cut.length).toBeGreaterThan(0);
    for (const leaf of cut) {
      expect(leaf.value!.text.length).toBeLessThanOrEqual(VALUE_TREE_STRING_CAP * 6 + 3);
      expect(leaf.value!.more).toMatch(/^\d+ more characters$/);
    }
  });

  it('formatFloat32 writes every float as DuckDB writes the FLOAT, from to_json’s widened text too', async () => {
    const bits = new Uint32Array(1);
    const float = new Float32Array(bits.buffer);
    const values: number[] = [
      1, 0.1, 0.3, 1e-4, 1e-5, 1e15, 1e16, 3.4028234663852886e38, 1.401298464324817e-45,
      1.1754943508222875e-38, 16777216, 16777218, -0, 0, 123456792, 9.999999e15, 2453185.75,
      -53812808,
    ].map(Math.fround);
    let seed = 20261005;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const samples = Number(process.env['VALUE_TREE_FLOAT_SAMPLES'] ?? 6000);
    while (values.length < samples) {
      // Any bit pattern; a short decimal; an embedding-like value.
      bits[0] = next();
      if (Number.isFinite(float[0]!)) values.push(float[0]!);
      values.push(Math.fround((next() % 2_000_001) / 10 ** (next() % 12)) - 1000);
      values.push(Math.fround(Math.sin(next())));
    }
    const mismatches: string[] = [];
    for (let from = 0; from < values.length; from += 5000) {
      const chunk = values.slice(from, from + 5000);
      // Each float's exact value, as the shortest double text that reads back as it.
      const list = `[${chunk.map((v) => lit(Object.is(v, -0) ? '-0' : String(v))).join(', ')}]`;
      const [row] = await bridge.query<{ t: string[]; j: string[] }>(
        `SELECT list_transform(${list}, lambda s: CAST(CAST(s AS FLOAT) AS VARCHAR)) AS t, ` +
          `list_transform(${list}, lambda s: CAST(to_json(CAST(s AS FLOAT)) AS VARCHAR)) AS j`,
      );
      chunk.forEach((value, i) => {
        const duck = duckFloat(row!.t[i]!);
        if (formatFloat32(value) !== duck) {
          mismatches.push(`${value}: ${formatFloat32(value)} ≠ ${duck}`);
        }
        if (formatFloat32(Number(row!.j[i]!)) !== duck) {
          mismatches.push(`to_json ${row!.j[i]}: ≠ ${duck}`);
        }
      });
    }
    expect(mismatches.slice(0, 50)).toEqual([]);
  }, 120_000);
});
