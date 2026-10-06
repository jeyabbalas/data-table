/**
 * Helpers for the nested-type specs: mount a table built in DuckDB, read its
 * body back, work out what each nested cell should show, and tell a header
 * chart that has drawn from one that has not.
 *
 * What a nested cell should show comes from DuckDB, in the page, through the
 * table's own bridge, never from a string a spec builds: the value's whole
 * text (`CAST(c AS VARCHAR)`), how many items it has (`len`, `cardinality`,
 * `octet_length`), and the text of its first items (`c[1:32]`,
 * `map_from_entries(map_entries(c)[1:32])`). The rule that turns those into
 * a cell is the documented one (`gridValueSQL` in src/data/valueSql.ts),
 * applied here in TypeScript, as `tests/helpers/nestedExpectations.ts`
 * applies it for the vitest suite: past 32 items the head's text loses its
 * closing bracket and gains `, … +N]` (or `}` for a map), a BLOB past 256
 * bytes gains `… +N`, and any text past 1,000 graphemes keeps 1,000 and gains
 * `…`. The specs therefore check the grid's SQL, its transport and its
 * rendering, not DuckDB's formatting.
 *
 * Tables are generated in-page from SQL, exported to Parquet and loaded with
 * `loadData`, as `helpers/bigTable.ts` does: the production load path, with
 * the types the SQL gives (a MAP stays a MAP, which JSON inference does not
 * promise), and `id === __rowid__` by construction.
 */

import { expect, type Page } from '@playwright/test';

/** Id of the element {@link mountSqlTable} mounts the table into. */
export const NESTED_HOST_ID = 'dt-nested-host';

/** List and array items, and map entries, a cell shows before `… +N`. */
export const PREVIEW_ITEMS = 32;

/** Graphemes of text a cell shows before `…`. */
export const TEXT_CAP = 1000;

/** The most characters a nested cell holds: {@link TEXT_CAP} and the `…`, for ASCII text. */
export const MAX_CELL_CHARS = TEXT_CAP + 1;

/**
 * The wide table of `nested-wide.spec.ts`, which `extract-column.spec.ts`
 * extracts from too: {@link WIDE_ROWS} rows of `id`, 38 scalars as
 * `helpers/table.ts` generates them (`s01`…`s38`: text when the index is 1
 * mod 3, numbers otherwise), the six nested columns of {@link WIDE_NESTED},
 * and `grp` (`'g' || id % 97`) last.
 *
 * - `embedding`: 64 FLOATs, the first of them the row number. DuckDB writes
 *   a fixed-size ARRAY to Parquet as a LIST, so this is one, of 64 items.
 * - `long_ints`: 2,000 INTEGERs from the row number in every 50th row, 1–7
 *   in the others; NULL in every 13th.
 * - `long_words`: 2,000 words in every 64th row, none in every 11th, 1–5 in
 *   the others; the first 32 words of each carry 30 more characters, so the
 *   cap cuts a 2,000-word cell.
 * - `point`: a struct, `{rid, x, tier, note}`, whose `x` is `(id % 1000) / 4`
 *   and whose `note` is 1,500 characters in every 97th row.
 * - `attrs`: a MAP led by `rid`, 50 entries in every 40th row; NULL in every
 *   17th.
 * - `people`: a list of 1–4 structs, 40 in every 30th row, which the cap
 *   cuts too.
 */
export const WIDE_SELECT = `${Array.from({ length: 38 }, (_, k) => {
  const c = k + 1;
  const name = `s${String(c).padStart(2, '0')}`;
  return c % 3 === 1
    ? `'k' || ((i + ${c}) % 7) AS ${name}`
    : `((i * 31 + ${c * 17}) % 1000) / 10.0 AS ${name}`;
}).join(',\n')},
  list_transform(range(64),
    j -> CAST(CASE WHEN j = 0 THEN i ELSE ((i * 7 + j * 13) % 2001 - 1000) / 1000.0 END AS FLOAT)) AS embedding,
  CASE WHEN i % 13 = 12 THEN NULL
       ELSE list_transform(range(CASE WHEN i % 50 = 0 THEN 2000 ELSE i % 7 + 1 END),
         j -> CAST(i + j AS INTEGER)) END AS long_ints,
  list_transform(range(CASE WHEN i % 64 = 3 THEN 2000 WHEN i % 11 = 10 THEN 0 ELSE i % 5 + 1 END),
    j -> 'r' || i || '-' || j || CASE WHEN j < 32 THEN repeat('w', 30) ELSE '' END) AS long_words,
  {'rid': CAST(i AS INTEGER), 'x': (i % 1000) / 4, 'tier': ['gold', 'silver', 'bronze'][i % 3 + 1],
   'note': CASE WHEN i % 97 = 5 THEN repeat('n', 1500) ELSE 'n' || i END} AS point,
  CASE WHEN i % 17 = 16 THEN NULL
       ELSE map_from_entries(list_transform(range(CASE WHEN i % 40 = 1 THEN 50 ELSE i % 5 + 1 END),
         j -> {'k': CASE WHEN j = 0 THEN 'rid' ELSE 'k' || j END,
               'v': CAST(CASE WHEN j = 0 THEN i ELSE (i * j) % 1000 END AS INTEGER)})) END AS attrs,
  list_transform(range(CASE WHEN i % 30 = 2 THEN 40 ELSE i % 4 + 1 END),
    j -> {'rid': CAST(i AS INTEGER), 'name': 'p' || j, 'qty': CAST(j AS INTEGER)}) AS people,
  'g' || (i % 97) AS grp`;

/** Rows of the wide table, {@link WIDE_SELECT}. */
export const WIDE_ROWS = 200_000;

/** The wide table's nested columns, in display order, just before `grp`. */
export const WIDE_NESTED = [
  'embedding',
  'long_ints',
  'long_words',
  'point',
  'attrs',
  'people',
] as const;

/** What one body row fetch read for a column {@link mountSqlTable} records. */
export interface ColumnPayload {
  /** Characters of text, all rows together. */
  chars: number;
  /** Characters of the longest value. */
  longest: number;
  /**
   * Values that were neither text nor NULL: a nested value read as it is,
   * an array or an object of any size, which `chars` cannot bound.
   */
  other: number;
}

/** One body row fetch, as {@link mountSqlTable} records it. */
export interface RowFetchPayload {
  rows: number;
  /** By column, for the recorded columns the fetch selected. */
  columns: Record<string, ColumnPayload>;
}

/** What the nested specs leave on `window`, for `page.evaluate` callbacks. */
export type NestedWindow = {
  __dt: import('../../../src/index').DataTable;
  /** Mount progress, so a hung stage names itself in traces. */
  __dtStage?: string;
  __dtRowFetches?: RowFetchPayload[];
};

export interface SqlTableOptions {
  /**
   * The columns after `id`, as a SELECT list over `i`, the row number from
   * 0. `id` is `CAST(i AS INTEGER)`, first, and equals `__rowid__`.
   */
  select: string;
  rows: number;
  /** Header charts. Default `false`. */
  visualizations?: boolean;
  /**
   * The derived-column UI, "extract field → column" with it (the header's
   * extract button, the value inspector's add buttons). Default `true`, as
   * `createDataTable`'s.
   */
  derivedColumns?: boolean;
  /**
   * Record, for each body row fetch, how much text it read for these
   * columns; read back with {@link rowFetchPayloads}.
   */
  recordFetches?: readonly string[];
}

/**
 * Create a table in a 1200 × 600 px host fixed at the top-left of the page,
 * build `options.rows` rows in DuckDB from `options.select`, export them to
 * Parquet and load that. The table is on `window.__dt`.
 *
 * Resolves once `loadData` has, which is after the first screen of rows is
 * fetched and painted.
 */
export async function mountSqlTable(page: Page, options: SqlTableOptions): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    async (o) => {
      const w = window as unknown as NestedWindow;
      w.__dtStage = 'import';
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../../src/index');

      const host = document.createElement('div');
      host.id = o.hostId;
      host.style.cssText =
        'position: fixed; left: 0; top: 0; width: 1200px; height: 600px; z-index: 1; background: white;';
      document.body.appendChild(host);

      w.__dtStage = 'boot';
      const table = await mod.createDataTable({
        container: host,
        // No IndexedDB: a restored session would make this a different test.
        persistence: false,
        visualizations: o.visualizations,
        derivedColumns: o.derivedColumns,
      });
      w.__dt = table;

      if (o.recordFetches) {
        // Every body row fetch selects `__rowid__` first, then a comma or
        // nothing; the oracle's queries alias it, and are not recorded.
        const recorded = new Set(o.recordFetches);
        const payloads: RowFetchPayload[] = (w.__dtRowFetches = []);
        const query = table.bridge.query.bind(table.bridge);
        table.bridge.query = (async (sql: string, ...rest: unknown[]) => {
          const rows = (await (query as (...a: unknown[]) => Promise<unknown[]>)(
            sql,
            ...rest,
          )) as Record<string, unknown>[];
          if (/^SELECT "__rowid__"(?:,| FROM )/.test(sql)) {
            const columns: Record<string, ColumnPayload> = {};
            for (const row of rows) {
              for (const [name, value] of Object.entries(row)) {
                if (!recorded.has(name)) continue;
                const c = (columns[name] ??= { chars: 0, longest: 0, other: 0 });
                if (typeof value === 'string') {
                  c.chars += value.length;
                  c.longest = Math.max(c.longest, value.length);
                } else if (value !== null && value !== undefined) {
                  c.other++;
                }
              }
            }
            payloads.push({ rows: rows.length, columns });
          }
          return rows;
        }) as typeof table.bridge.query;
      }

      w.__dtStage = 'generate';
      await table.bridge.query(
        `CREATE OR REPLACE TABLE gen_src AS
         SELECT CAST(i AS INTEGER) AS id, ${o.select}
         FROM range(0, ${o.rows}) t(i)`,
      );
      // Never export __rowid__: the loader rejects sources that carry it.
      w.__dtStage = 'export';
      const buf = await table.bridge.exportToBuffer('SELECT * FROM gen_src ORDER BY id', 'parquet');
      w.__dtStage = 'drop';
      await table.bridge.query('DROP TABLE gen_src');
      w.__dtStage = 'load';
      // The ArrayBuffer, which exportToBuffer guarantees is exactly the file.
      await table.loadData(buf.buffer as ArrayBuffer, { sourceFormat: 'parquet' });
      w.__dtStage = 'done';
    },
    {
      select: options.select,
      rows: options.rows,
      visualizations: options.visualizations ?? false,
      derivedColumns: options.derivedColumns ?? true,
      recordFetches: options.recordFetches ? [...options.recordFetches] : null,
      hostId: NESTED_HOST_ID,
    },
  );
}

/** The row fetches recorded since the last call, in the order they landed. */
export function rowFetchPayloads(page: Page): Promise<RowFetchPayload[]> {
  return page.evaluate(() => (window as unknown as NestedWindow).__dtRowFetches!.splice(0));
}

/** The table's body, as {@link readBody} reads it. */
export interface BodyState {
  /** Body rows with data. */
  rows: number;
  /** Rows still waiting for their data. */
  placeholders: number;
  /** Cells of rows with data still waiting for their column. */
  pending: number;
  /** Text of each cell of the columns asked for, by row id; `null` when the row has no such cell. */
  cells: Record<string, Record<string, string | null>>;
}

/** Read the body of the table under `root`. */
export function readBody(
  page: Page,
  columns: readonly string[],
  root = `#${NESTED_HOST_ID}`,
): Promise<BodyState> {
  return page.evaluate(
    ({ root, columns }) => {
      const host = document.querySelector(root)!;
      const rows = Array.from(
        host.querySelectorAll<HTMLElement>('.dt-body .dt-row:not([data-placeholder])'),
      );
      const cells: Record<string, Record<string, string | null>> = {};
      for (const row of rows) {
        const texts: Record<string, string | null> = {};
        for (const column of columns) texts[column] = null;
        for (const cell of row.querySelectorAll<HTMLElement>('.dt-cell[data-column]')) {
          const column = cell.dataset.column!;
          if (column in texts) texts[column] = cell.textContent;
        }
        cells[row.getAttribute('data-row-id')!] = texts;
      }
      return {
        rows: rows.length,
        placeholders: host.querySelectorAll('.dt-body .dt-row[data-placeholder]').length,
        pending: host.querySelectorAll('.dt-body .dt-cell--pending').length,
        cells,
      };
    },
    { root, columns: [...columns] },
  );
}

/**
 * Wait until every body row has a cell for each of `columns` and every cell
 * has its data, and return the body as it was then. Requiring the cells
 * keeps a check made just after a scroll from passing on the columns the
 * view has not yet left.
 */
export async function waitForFilledBody(
  page: Page,
  columns: readonly string[],
  root = `#${NESTED_HOST_ID}`,
): Promise<BodyState> {
  let state: BodyState | undefined;
  await expect
    .poll(
      async () => {
        state = await readBody(page, columns, root);
        const mounted = Object.values(state.cells).every((texts) =>
          columns.every((column) => texts[column] !== null),
        );
        return {
          rows: state.rows > 0,
          mounted,
          placeholders: state.placeholders,
          pending: state.pending,
        };
      },
      { message: 'every body row and cell gets its data', timeout: 30_000 },
    )
    .toEqual({ rows: true, mounted: true, placeholders: 0, pending: 0 });
  return state!;
}

/**
 * Scroll the table under `root` sideways in one jump, so that `column`'s
 * left edge is the left edge of the view (or as near as the table's width
 * allows). Every visible column has a header, mounted or not, so the jump
 * can be measured from it.
 */
export async function scrollToColumn(
  page: Page,
  column: string,
  root = `#${NESTED_HOST_ID}`,
): Promise<void> {
  await page.evaluate(
    ({ root, column }) => {
      const host = document.querySelector(root)!;
      const scroller = host.querySelector('.dt-body-scroll')!;
      const header = Array.from(host.querySelectorAll('.dt-col-header[data-column]')).find(
        (h) => h.getAttribute('data-column') === column,
      );
      if (!header) throw new Error(`scrollToColumn: no header for ${column}`);
      scroller.scrollLeft +=
        header.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    },
    { root, column },
  );
}

/** Where a spec's table is: its own mount's `window.__dt`, or the demo's `window.__dtDemo.table`. */
export type TableRef = 'mounted' | 'demo';

/**
 * The text each of `columns` should show in the rows whose `__rowid__` is in
 * `rowIds`, by row id and column, worked out in the page from what DuckDB
 * says of the values (see the module comment). A NULL value is `'null'`, as
 * the grid writes it.
 *
 * Only for columns the grid reads as text: nested ones, JSON and BLOB. It
 * throws on others, whose cells the grid formats itself.
 */
export function expectedCellTexts(
  page: Page,
  columns: readonly string[],
  rowIds: readonly (number | string)[],
  from: TableRef = 'mounted',
): Promise<Record<string, Record<string, string>>> {
  return page.evaluate(
    async ({ columns, rowIds, from, previewItems, textCap }) => {
      const w = window as unknown as NestedWindow & {
        __dtDemo?: { table: NestedWindow['__dt'] };
      };
      const table = from === 'demo' ? w.__dtDemo!.table : w.__dt;
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../../src/index');
      const advanced = (await import(
        /* @vite-ignore */ '/data-table/src/advanced.ts'
      )) as typeof import('../../../src/advanced');
      const relation = mod.quoteIdentifier(table.state.tableName.get()!);
      const schema = table.state.schema.get();

      const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const cap = (text: string): string => {
        // A grapheme is at least one UTF-16 code unit.
        if (text.length <= textCap) return text;
        let count = 0;
        for (const { index } of graphemes.segment(text)) {
          if (count === textCap) return `${text.slice(0, index)}…`;
          count++;
        }
        return text;
      };

      const out: Record<string, Record<string, string>> = {};
      for (const id of rowIds) out[String(id)] = {};
      if (rowIds.length === 0) return out;
      const ids = rowIds.map((id) => Number(id)).join(', ');

      for (const name of columns) {
        const column = schema.find((c) => c.name === name);
        if (!column) throw new Error(`expectedCellTexts: no column ${name}`);
        const c = mod.quoteIdentifier(name);
        const node = advanced.parseDuckDBType(column.originalType ?? '');
        // The count and head of a value cut to `limit` items, and what
        // follows the head; or none, for a value shown whole.
        let cut: {
          count: string;
          head: string;
          limit: number;
          more: (n: number) => string;
        } | null = null;
        let capped = true;
        switch (node.kind) {
          case 'list':
          case 'array':
            if (node.kind === 'list' || node.size > previewItems) {
              cut = {
                count: `len(${c})`,
                head: `${c}[1:${previewItems}]`,
                limit: previewItems,
                more: (n) => `, … +${n}]`,
              };
            }
            break;
          case 'map':
            cut = {
              count: `cardinality(${c})`,
              head: `map_from_entries(map_entries(${c})[1:${previewItems}])`,
              limit: previewItems,
              more: (n) => `, … +${n}}`,
            };
            break;
          case 'json':
            capped = false;
            break;
          case 'scalar':
            if (node.name !== 'BLOB') {
              throw new Error(`expectedCellTexts: the grid formats ${name} (${node.sqlType})`);
            }
            cut = {
              count: `octet_length(${c})`,
              head: `${c}[1:256]`,
              limit: 256,
              more: (n) => `… +${n}`,
            };
            break;
          default:
            // struct, union, variant, unknown: the whole text, capped.
            break;
        }
        const select = cut
          ? `${cut.count} AS n,` +
            ` CASE WHEN ${cut.count} > ${cut.limit} THEN CAST(${cut.head} AS VARCHAR) END AS head,` +
            ` CASE WHEN ${cut.count} <= ${cut.limit} THEN CAST(${c} AS VARCHAR) END AS whole`
          : `NULL AS n, NULL AS head, CAST(${c} AS VARCHAR) AS whole`;
        const rows = await table.bridge.query<{
          id: number | bigint;
          n: number | bigint | null;
          head: string | null;
          whole: string | null;
        }>(`SELECT ${select}, "__rowid__" AS id FROM ${relation} WHERE "__rowid__" IN (${ids})`);
        for (const row of rows) {
          const n = row.n === null ? null : Number(row.n);
          let text: string | null;
          if (cut && n === null) text = null;
          else if (cut && n! > cut.limit) {
            // A BLOB's head has no closing bracket to lose.
            const head = node.kind === 'scalar' ? row.head! : row.head!.slice(0, -1);
            text = `${head}${cut.more(n! - cut.limit)}`;
          } else text = row.whole;
          out[String(Number(row.id))]![name] = text === null ? 'null' : capped ? cap(text) : text;
        }
      }
      return out;
    },
    {
      columns: [...columns],
      rowIds: rowIds.map(String),
      from,
      previewItems: PREVIEW_ITEMS,
      textCap: TEXT_CAP,
    },
  );
}

/**
 * Cells of `state` that do not show what `expected` says, as
 * `row/column: shown ≠ expected`, cut to 120 characters each. A row of
 * `expected` the body lacks is reported too, as is one the oracle did not
 * return, so neither side can come up empty unnoticed.
 */
export function wrongCells(
  state: BodyState,
  expected: Record<string, Record<string, string>>,
  columns: readonly string[],
): string[] {
  const clip = (text: string | null | undefined) =>
    text === null || text === undefined
      ? String(text)
      : text.length > 120
        ? `${text.slice(0, 117)}… (${text.length} chars)`
        : text;
  const wrong: string[] = [];
  for (const [id, texts] of Object.entries(state.cells)) {
    for (const column of columns) {
      const want = expected[id]?.[column];
      if (texts[column] !== want && wrong.length < 20) {
        wrong.push(`${id}/${column}: ${clip(texts[column])} ≠ ${clip(want)}`);
      }
    }
  }
  for (const id of Object.keys(expected)) {
    if (!(id in state.cells) && wrong.length < 20) wrong.push(`${id}: not in the body`);
  }
  return wrong;
}

/**
 * The columns among `columns` whose header chart has not drawn yet: no
 * header, no canvas, a canvas marked `data-fetch-failed`, or one with no
 * pixel painted. Every chart clears its canvas and draws nothing until its
 * first fetch lands, so a painted pixel is the chart's data; the nested
 * summary's stats line, the signal `lazy-charts.spec.ts` uses, is empty for
 * a column that is all NULL.
 */
export function unpaintedCharts(
  page: Page,
  columns: readonly string[],
  root = `#${NESTED_HOST_ID}`,
): Promise<string[]> {
  return page.evaluate(
    ({ root, columns }) => {
      const headers = new Map<string, Element>();
      for (const header of document.querySelectorAll(`${root} .dt-col-header[data-column]`)) {
        headers.set(header.getAttribute('data-column')!, header);
      }
      return columns.filter((name) => {
        const canvas = headers.get(name)?.querySelector<HTMLCanvasElement>('.dt-col-viz canvas');
        if (!canvas || canvas.hasAttribute('data-fetch-failed')) return true;
        if (canvas.width === 0 || canvas.height === 0) return true;
        const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] !== 0) return false;
        return true;
      });
    },
    { root, columns: [...columns] },
  );
}

/** Every console error and uncaught exception on the page from now on. */
export function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
