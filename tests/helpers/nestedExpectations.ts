/**
 * What a grid cell should show for a nested value, worked out apart from the
 * SQL that shows it (`gridValueSQL`, in src/data/valueSql.ts).
 *
 * DuckDB supplies facts only: a value's whole text (`CAST(c AS VARCHAR)`),
 * how many items it has (`len`, `cardinality`, `octet_length`), and the
 * text of its first items (`c[1:32]`, `map_from_entries(map_entries(c)[1:32])`,
 * a BLOB's first 256 bytes). The cell rule is applied here, in TypeScript:
 *
 * - A list or array of more than PREVIEW_ITEMS items shows the head's text
 *   without its closing bracket, then `, … +N]`; a map, `, … +N}`.
 * - A BLOB of more than BLOB_PREVIEW bytes shows the head's text, then `… +N`.
 * - Then any text of more than TEXT_CAP graphemes, as `Intl.Segmenter`
 *   counts them, keeps TEXT_CAP of them and gains `…`. A BLOB's text, ASCII
 *   but for the `…`, keeps the whole bytes in its first TEXT_CAP characters
 *   instead: a `\`, `\x` or `\xA` left of an escape, and any part of the
 *   `… +N`, go.
 *
 * INTERVAL and JSON columns are read whole and never capped: the grid casts
 * an INTERVAL plainly and reads JSON text as it is.
 *
 * @example
 * ```ts
 * const schema = await detectSchema('nested_parquet', bridge);
 * const tags = schema.find((c) => c.name === 'tags')!;
 * const expected = await expectedCellTexts(bridge, 'nested_parquet', tags);
 * expected.get(7); // '[…, … +9968]', at most 1,000 graphemes and a '…'
 * ```
 */
import { parseDuckDBType } from '@/core/duckdbType';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { BLOB_PREVIEW, PREVIEW_ITEMS, TEXT_CAP } from '@/data/valueSql';
import { quoteIdentifier } from '@/filters/FilterSQL';

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** `text` cut to TEXT_CAP graphemes and given `…`, or as it is when it has no more. */
export function capGraphemes(text: string): string {
  // A grapheme is at least one UTF-16 code unit.
  if (text.length <= TEXT_CAP) return text;
  let count = 0;
  for (const { index } of graphemes.segment(text)) {
    if (count === TEXT_CAP) return `${text.slice(0, index)}…`;
    count++;
  }
  return text;
}

/** A BLOB's text cut as a cell cuts it: between bytes, without its count. */
function capBlob(text: string): string {
  if (text.length <= TEXT_CAP) return text;
  const head = text.slice(0, TEXT_CAP);
  const count = head.indexOf('…');
  return `${count >= 0 ? head.slice(0, count) : head.replace(/\\(x[0-9A-Fa-f]?)?$/, '')}…`;
}

/** How the grid shows a column's values. */
type CellRule =
  | { kind: 'items'; count: string; head: string; close: ']' | '}' }
  | { kind: 'bytes' }
  | { kind: 'whole'; capped: boolean };

function ruleFor(column: ColumnSchema, c: string): CellRule {
  const node = parseDuckDBType(column.originalType);
  switch (node.kind) {
    case 'list':
    case 'array':
      return { kind: 'items', count: `len(${c})`, head: `${c}[1:${PREVIEW_ITEMS}]`, close: ']' };
    case 'map':
      return {
        kind: 'items',
        count: `cardinality(${c})`,
        head: `map_from_entries(map_entries(${c})[1:${PREVIEW_ITEMS}])`,
        close: '}',
      };
    case 'json':
      return { kind: 'whole', capped: false };
    case 'scalar':
      if (node.name === 'BLOB') return { kind: 'bytes' };
      if (node.name === 'INTERVAL') return { kind: 'whole', capped: false };
      if (['BIT', 'GEOMETRY', 'BIGNUM'].includes(node.name)) return { kind: 'whole', capped: true };
      throw new Error(`expectedCellTexts: the grid reads ${column.name} (${node.sqlType}) raw`);
    default:
      // struct, union, variant, unknown
      return { kind: 'whole', capped: true };
  }
}

/**
 * The text each row's cell should show for `column` of `tableName`, by
 * `__rowid__`; `null` for a NULL value.
 */
export async function expectedCellTexts(
  bridge: WorkerBridge,
  tableName: string,
  column: ColumnSchema,
): Promise<Map<number, string | null>> {
  const c = quoteIdentifier(column.name);
  const table = quoteIdentifier(tableName);
  const rule = ruleFor(column, c);
  const expected = new Map<number, string | null>();

  if (rule.kind === 'whole') {
    const rows = await bridge.query<{ id: number; whole: string | null }>(
      `SELECT "__rowid__" AS id, CAST(${c} AS VARCHAR) AS whole FROM ${table}`,
    );
    for (const { id, whole } of rows) {
      expected.set(id, whole === null || !rule.capped ? whole : capGraphemes(whole));
    }
    return expected;
  }

  // The whole text only where it is shown whole: a 10,000-item list's
  // would be wasted.
  const [count, head, limit, more] =
    rule.kind === 'bytes'
      ? [`octet_length(${c})`, `${c}[1:${BLOB_PREVIEW}]`, BLOB_PREVIEW, (n: number) => `… +${n}`]
      : [rule.count, rule.head, PREVIEW_ITEMS, (n: number) => `, … +${n}${rule.close}`];
  const rows = await bridge.query<{
    id: number;
    n: number | null;
    head: string | null;
    whole: string | null;
  }>(
    `SELECT "__rowid__" AS id, ${count} AS n,` +
      ` CASE WHEN ${count} > ${limit} THEN CAST(${head} AS VARCHAR) END AS head,` +
      ` CASE WHEN ${count} <= ${limit} THEN CAST(${c} AS VARCHAR) END AS whole` +
      ` FROM ${table}`,
  );
  for (const { id, n, head: headText, whole } of rows) {
    if (n === null) {
      expected.set(id, null);
      continue;
    }
    const text =
      n > limit
        ? `${rule.kind === 'bytes' ? headText! : headText!.slice(0, -1)}${more(n - limit)}`
        : whole!;
    expected.set(id, rule.kind === 'bytes' ? capBlob(text) : capGraphemes(text));
  }
  return expected;
}
