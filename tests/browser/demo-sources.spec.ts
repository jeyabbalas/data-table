/**
 * How the demo hands datasets to the library, and caches them for refresh.
 *
 * A large Parquet file only loads through the library's File path, where
 * DuckDB reads it from disk as it goes: read into an ArrayBuffer first, a
 * 200K × 1,000 file needs more memory than WebAssembly has. So the demo
 * must never read a dataset itself. These specs count every read of the
 * dataset's File on the page (`arrayBuffer`, `text`, `stream`, `bytes`),
 * and check what the refresh cache in IndexedDB holds: a Parquet source is
 * cached as the file itself, and restored from it unread, with its session;
 * a small CSV as a Parquet export, as before. And the demo runs one load at
 * a time, clears a cached dataset it cannot restore, and shows what it did
 * not write as text.
 *
 * In development the example chips and a relative `?url=` read the dev
 * server's `/fixtures/`, so the nested-types fixture loads before it reaches
 * GitHub's main branch; its nested columns have to come back from the cache
 * as they first loaded, types and text alike.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { NESTED_EXAMPLE, NESTED_EXAMPLE_STRUCTS, openDemo } from './helpers/demo';
import {
  type BodyState,
  expectedCellTexts,
  scrollToColumn,
  waitForFilledBody,
  wrongCells,
} from './helpers/nested';

const fixture = (path: string): string =>
  fileURLToPath(new URL(`../fixtures/datasets/${path}`, import.meta.url));
const PARQUET = fixture('parquet/titanic.parquet');
const CSV = fixture('csv/titanic.csv');
const ROWS = '891 rows';

const NESTED_PARQUET = fixture('parquet/nested-stress-tests.parquet');
const NESTED_ROWS = '1,000 rows';

/** The fixture's columns, in file order, as its manifest records them. */
const NESTED_COLUMNS = (
  JSON.parse(readFileSync(fixture('nested-stress-tests.manifest.json'), 'utf8')) as {
    parquet: { columns: { name: string; kind: 'scalar' | 'list' | 'struct' | 'map' | 'json' }[] };
  }
).parquet.columns;

type DemoWindow = { __dtDemo: { table: import('../../src/index').DataTable | null } };

type Probe = { __reads: string[]; __injected: boolean; __infoTexts: string[] };

/**
 * Count reads of the dataset's File named `name`, from before the demo's
 * own scripts run. A File from `<input type=file>`, from IndexedDB or made
 * from a fetched Blob all read through `Blob.prototype`.
 */
async function countReads(page: Page, name: string): Promise<void> {
  await page.addInitScript((name) => {
    const w = window as unknown as Probe;
    w.__reads = [];
    for (const method of ['arrayBuffer', 'text', 'stream', 'bytes'] as const) {
      const proto = Blob.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = function (this: Blob, ...args: unknown[]) {
        if (this instanceof File && this.name === name) w.__reads.push(method);
        return original.apply(this, args);
      };
    }
  }, name);
}

async function reads(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as Probe).__reads);
}

async function loadFile(page: Page, file: Parameters<Page['setInputFiles']>[1]): Promise<void> {
  await page.setInputFiles('#file-input', file);
  await page.click('#load-file-btn');
}

async function expectTable(page: Page, rows = ROWS): Promise<void> {
  await expect(page.locator('#table-info')).toContainText(rows, { timeout: 90_000 });
  await expect(
    page.locator('#table-container .dt-body .dt-row:not([data-placeholder])').first(),
  ).toBeVisible();
}

/** The `tableName` the demo saved for the dataset now loaded. */
async function sessionTableName(page: Page): Promise<string> {
  const handle = await page.waitForFunction(() => {
    const raw = localStorage.getItem('dt-last-session');
    return raw ? (JSON.parse(raw) as { tableName: string }).tableName : null;
  });
  return (await handle.jsonValue())!;
}

/** Record whether markup ever lands in the info bar, from before the demo's scripts run. */
async function watchInjection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Probe;
    w.__injected = false;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        if (!target.closest?.('#table-info')) continue;
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('img') || node.querySelector('img'))) {
            w.__injected = true;
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

async function injected(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as Probe).__injected);
}

const nameHeader = (page: Page) =>
  page.locator('#table-container [role="columnheader"][data-column="Name"]');

/** Sort by Name, and wait for the session snapshot to hold the sort. */
async function sortByNameAndSave(page: Page, tableName: string): Promise<void> {
  await nameHeader(page).locator('.dt-col-sort-btn').click();
  await expect(nameHeader(page)).toHaveAttribute('aria-sort', 'ascending');
  await expect
    .poll(
      () =>
        page.evaluate(async (key) => {
          const db = await new Promise<IDBDatabase>((done, fail) => {
            const req = indexedDB.open('dt-sessions', 1);
            req.onsuccess = () => done(req.result);
            req.onerror = () => fail(req.error);
          });
          const snapshot = await new Promise<{ sortColumns?: { column: string }[] } | undefined>(
            (done, fail) => {
              const get = db.transaction('sessions', 'readonly').objectStore('sessions').get(key);
              get.onsuccess = () => done(get.result as { sortColumns?: { column: string }[] });
              get.onerror = () => fail(get.error);
            },
          );
          db.close();
          return snapshot?.sortColumns?.map((s) => s.column) ?? [];
        }, tableName),
      { timeout: 30_000 },
    )
    .toEqual(['Name']);
}

/** Put a row in the refresh cache and point the last session at it, as a demo would have. */
async function seedCache(
  page: Page,
  row: { tableName: string; bytes: number[]; format: string; sourceName: string },
): Promise<void> {
  await page.evaluate(async (row) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const req = indexedDB.open('dt-data-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('data', { keyPath: 'tableName' });
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    await new Promise<void>((done, fail) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put({
        tableName: row.tableName,
        data: new Blob([new Uint8Array(row.bytes)]),
        format: row.format,
        sourceName: row.sourceName,
      });
      tx.oncomplete = () => done();
      tx.onerror = () => fail(tx.error);
    });
    db.close();
    localStorage.setItem(
      'dt-last-session',
      JSON.stringify({ type: 'file', source: row.sourceName, tableName: row.tableName }),
    );
  }, row);
}

interface CacheRow {
  fields: string[];
  format: unknown;
  isFile: boolean;
  size: number | null;
  magic: string | null;
}

/** The refresh cache's row for `tableName`, or null while there is none. */
async function readCacheRow(page: Page, tableName: string): Promise<CacheRow | null> {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const req = indexedDB.open('dt-data-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('data', { keyPath: 'tableName' });
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    const found = await new Promise<Record<string, unknown> | undefined>((done, fail) => {
      const get = db.transaction('data', 'readonly').objectStore('data').get(key);
      get.onsuccess = () => done(get.result as Record<string, unknown> | undefined);
      get.onerror = () => fail(get.error);
    });
    db.close();
    if (!found) return null;
    const data = found.data;
    return {
      fields: Object.keys(found).sort(),
      format: found.format ?? null,
      isFile: data instanceof File,
      size: data instanceof Blob ? data.size : null,
      magic:
        data instanceof Blob
          ? new TextDecoder().decode(await data.slice(0, 4).arrayBuffer())
          : null,
    };
  }, tableName);
}

/** The refresh cache's row for `tableName`, once the demo has written it. */
async function cacheRow(page: Page, tableName: string): Promise<CacheRow> {
  await expect.poll(() => readCacheRow(page, tableName), { timeout: 30_000 }).not.toBeNull();
  return (await readCacheRow(page, tableName))!;
}

test('hands an uploaded Parquet file to the library unread, and restores it from the cache with its session', async ({
  page,
}) => {
  test.slow();
  await countReads(page, 'titanic.parquet');
  await openDemo(page);

  await loadFile(page, PARQUET);
  await expectTable(page);
  expect(await reads(page)).toEqual([]);

  const tableName = await sessionTableName(page);
  expect(await cacheRow(page, tableName)).toEqual({
    fields: ['data', 'format', 'sourceName', 'tableName'],
    format: 'parquet',
    isFile: true,
    size: readFileSync(PARQUET).byteLength,
    magic: 'PAR1',
  });

  await sortByNameAndSave(page, tableName);

  // A refresh restores the dataset from the cached file, again unread, and
  // its session with it.
  await page.reload();
  await expectTable(page);
  expect(await sessionTableName(page)).toBe(tableName);
  expect(await reads(page)).toEqual([]);
  await expect(nameHeader(page)).toHaveAttribute('aria-sort', 'ascending');
});

test('caches a small CSV as a Parquet export, and restores it', async ({ page }) => {
  test.slow();
  await countReads(page, 'titanic.csv');
  await openDemo(page);

  await loadFile(page, CSV);
  await expectTable(page);
  // The library reads a CSV File as text; the demo reads it not at all.
  expect(await reads(page)).not.toContain('arrayBuffer');

  const tableName = await sessionTableName(page);
  expect(await cacheRow(page, tableName)).toMatchObject({
    fields: ['data', 'format', 'sourceName', 'tableName'],
    format: 'parquet',
    isFile: false,
    magic: 'PAR1',
  });

  await page.reload();
  await expectTable(page);
});

test('names a URL dataset by its content hash, caches it, and reopens its ?url= link with its session', async ({
  page,
}) => {
  test.slow();
  await openDemo(page);
  const url = `${new URL(page.url()).origin}/fixtures/parquet/titanic.parquet`;
  const hash = createHash('sha256').update(readFileSync(PARQUET)).digest('hex').slice(0, 16);

  await page.fill('#url-input', url);
  await page.click('#load-url-btn');
  await expectTable(page);

  const tableName = await sessionTableName(page);
  expect(tableName).toBe(`dt_${hash}`);
  expect(await cacheRow(page, tableName)).toEqual({
    fields: ['data', 'format', 'sourceName', 'tableName'],
    format: 'parquet',
    isFile: true,
    size: readFileSync(PARQUET).byteLength,
    magic: 'PAR1',
  });

  // The same content again is already loaded: nothing loads, and no time shows.
  await page.click('#load-url-btn');
  await expect(page.locator('#table-info')).toContainText(ROWS);
  await expect(page.locator('#table-info')).not.toContainText('loaded in');

  await sortByNameAndSave(page, tableName);
  // The page's own address is now the shareable link to the dataset.
  expect(new URL(page.url()).searchParams.get('url')).toBe(url);
  await page.reload();
  await expectTable(page);
  expect(await sessionTableName(page)).toBe(tableName);
  await expect(nameHeader(page)).toHaveAttribute('aria-sort', 'ascending');
});

test('restores a dataset an older demo cached as Parquet bytes', async ({ page }) => {
  await openDemo(page);
  await page.evaluate(
    async (bytes) => {
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const req = indexedDB.open('dt-data-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('data', { keyPath: 'tableName' });
        req.onsuccess = () => done(req.result);
        req.onerror = () => fail(req.error);
      });
      await new Promise<void>((done, fail) => {
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put({
          tableName: 'dt_legacy',
          buffer: new Uint8Array(bytes),
          sourceName: 'titanic.parquet',
        });
        tx.oncomplete = () => done();
        tx.onerror = () => fail(tx.error);
      });
      db.close();
      localStorage.setItem(
        'dt-last-session',
        JSON.stringify({ type: 'file', source: 'titanic.parquet', tableName: 'dt_legacy' }),
      );
    },
    Array.from(readFileSync(PARQUET)),
  );

  await page.reload();
  await expectTable(page);
});

test('a failed load leaves the table in place for the next one', async ({ page }) => {
  await openDemo(page);

  await loadFile(page, {
    name: 'broken.parquet',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a parquet file'),
  });
  await expect(page.locator('#table-info')).toContainText('Error', { timeout: 90_000 });

  await loadFile(page, PARQUET);
  await expectTable(page);
  await expect(page.locator('#table-container .dt-root')).toHaveCount(1);
});

test('runs one load at a time', async ({ page }) => {
  await openDemo(page);
  const url = `${new URL(page.url()).origin}/fixtures/parquet/titanic.parquet`;
  let fetches = 0;
  // Hold the first load open for 3 s, however fast the machine.
  await page.route('**/fixtures/parquet/titanic.parquet', async (route) => {
    fetches++;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.setInputFiles('#file-input', CSV);
  await page.fill('#url-input', url);
  await page.click('#load-url-btn');

  await expect(page.locator('#load-file-btn')).toBeDisabled();
  await expect(page.locator('#load-url-btn')).toBeDisabled();
  for (const chip of await page.locator('.chip[data-url]').all()) await expect(chip).toBeDisabled();
  // Neither starts a second load, which would mount a second table and
  // DuckDB worker: Enter in the URL input, which stays enabled, and a click
  // on Load File, forced as a user's would be.
  await page.press('#url-input', 'Enter');
  await page.locator('#load-file-btn').click({ force: true });

  await expectTable(page);
  await expect(page.locator('#load-file-btn')).toBeEnabled();
  await expect(page.locator('#load-url-btn')).toBeEnabled();
  await expect(page.locator('#table-container .dt-root')).toHaveCount(1);
  expect(fetches).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dt-last-session')!).type)).toBe(
    'url',
  );
});

test('shows the loading file, not the last dataset, until the load ends', async ({ page }) => {
  test.slow();
  await openDemo(page);
  await loadFile(page, PARQUET);
  await expectTable(page);
  await expect(page.locator('#table-info')).toContainText('loaded in');

  await page.evaluate(() => {
    const w = window as unknown as Probe;
    const info = document.querySelector('#table-info')!;
    w.__infoTexts = [];
    new MutationObserver(() => w.__infoTexts.push(info.textContent ?? '')).observe(info, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await loadFile(page, CSV);
  await expectTable(page);
  await expect(page.locator('#table-info')).toContainText('loaded in');

  const texts = await page.evaluate(() => (window as unknown as Probe).__infoTexts);
  const firstCounts = texts.findIndex((text) => text.includes('rows'));
  expect(firstCounts).toBeGreaterThan(0);
  for (const text of texts.slice(0, firstCounts)) expect(text).toMatch(/^Loading titanic\.csv \(/);
  // Counts shown before the load ended would carry the last load's time, and
  // on a first load that one included DuckDB's start-up.
  expect(new Set(texts.slice(firstCounts)).size).toBe(1);
  expect(texts.at(-1)).toMatch(/891 rows.*\| loaded in \d+\.\d s$/);
});

test('offers to forget a cached dataset it cannot restore', async ({ page }) => {
  await watchInjection(page);
  await openDemo(page);
  const sourceName = '<img src="x" alt="">.parquet';
  await seedCache(page, {
    tableName: 'dt_file_broken',
    bytes: Array.from(Buffer.from('not a parquet file')),
    format: 'parquet',
    sourceName,
  });

  await page.reload();
  const info = page.locator('#table-info');
  await expect(info).toContainText('Could not restore', { timeout: 90_000 });
  await expect(info).toContainText(sourceName);
  expect(await injected(page)).toBe(false);
  // Nothing is deleted on its own: the reason may pass.
  expect(await readCacheRow(page, 'dt_file_broken')).not.toBeNull();
  expect(await sessionTableName(page)).toBe('dt_file_broken');
  await expect(page.locator('#load-file-btn')).toBeEnabled();
  await expect(page.locator('#load-url-btn')).toBeEnabled();

  await info.getByRole('link', { name: 'Forget it' }).click();
  await expect(info).toHaveText('Load a file or URL to get started.');
  await expect.poll(() => readCacheRow(page, 'dt_file_broken')).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('dt-last-session'))).toBeNull();

  await page.reload();
  await expect(info).toHaveText('Load a file or URL to get started.');
});

test('keeps a cached dataset through a restore that fails for a reason that passes', async ({
  page,
}) => {
  test.slow();
  // While the flag is set, the page cannot start DuckDB's worker.
  await page.addInitScript(() => {
    const w = window as unknown as { __realWorker: typeof Worker };
    w.__realWorker = window.Worker;
    if (sessionStorage.getItem('dt-test-no-worker')) {
      window.Worker = class {
        constructor() {
          throw new Error('Workers are blocked');
        }
      } as unknown as typeof Worker;
    }
  });
  await openDemo(page);
  await loadFile(page, PARQUET);
  await expectTable(page);
  const tableName = await sessionTableName(page);
  await cacheRow(page, tableName);
  const info = page.locator('#table-info');

  await page.evaluate(() => sessionStorage.setItem('dt-test-no-worker', '1'));
  await page.reload();
  await expect(info).toContainText('Could not restore titanic.parquet', { timeout: 90_000 });
  expect(await readCacheRow(page, tableName)).not.toBeNull();
  expect(await sessionTableName(page)).toBe(tableName);
  await expect(page.locator('#load-file-btn')).toBeEnabled();
  await expect(page.locator('#load-url-btn')).toBeEnabled();

  // The next normal reload restores it.
  await page.evaluate(() => sessionStorage.removeItem('dt-test-no-worker'));
  await page.reload();
  await expectTable(page);
  expect(await sessionTableName(page)).toBe(tableName);

  // And so does Try again, once the reason has passed.
  await page.evaluate(() => sessionStorage.setItem('dt-test-no-worker', '1'));
  await page.reload();
  await expect(info).toContainText('Could not restore titanic.parquet', { timeout: 90_000 });
  await page.evaluate(() => {
    window.Worker = (window as unknown as { __realWorker: typeof Worker }).__realWorker;
    sessionStorage.removeItem('dt-test-no-worker');
  });
  await info.getByRole('link', { name: 'Try again' }).click();
  await expectTable(page);
});

test('offers to skip a restore that stalls', async ({ page }) => {
  test.slow();
  // While the flag is set, DuckDB's worker never answers.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('dt-test-silent-worker')) {
      window.Worker = class {
        postMessage(): void {}
        terminate(): void {}
        addEventListener(): void {}
        removeEventListener(): void {}
      } as unknown as typeof Worker;
    }
  });
  await openDemo(page);
  await loadFile(page, PARQUET);
  await expectTable(page);
  await cacheRow(page, await sessionTableName(page));
  const info = page.locator('#table-info');

  await page.evaluate(() => sessionStorage.setItem('dt-test-silent-worker', '1'));
  await page.reload();
  await expect(info).toContainText('Loading titanic.parquet');
  await expect(page.locator('#load-file-btn')).toBeDisabled();

  await page.evaluate(() => sessionStorage.removeItem('dt-test-silent-worker'));
  await info.getByRole('link', { name: 'Skip' }).click();
  await expect(info).toHaveText('Load a file or URL to get started.');
  expect(await page.evaluate(() => localStorage.getItem('dt-last-session'))).toBeNull();
  await expect(page.locator('#load-file-btn')).toBeEnabled();
});

test('shows a shared ?url= link as text, not markup', async ({ page }) => {
  await watchInjection(page);
  const payload = '<img src="x" alt="">';
  await page.goto(`./?url=${encodeURIComponent(payload)}`);

  await expect(page.locator('#table-info')).toContainText('Error', { timeout: 90_000 });
  expect(await injected(page)).toBe(false);
});

test('shows a failed load’s error as text, not markup', async ({ page }) => {
  await watchInjection(page);
  const message = '<img src="x" alt="">';
  await page.addInitScript((message) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).includes('/refused/')
        ? Promise.reject(new Error(message))
        : fetchOriginal(input, init);
  }, message);
  await openDemo(page);

  await page.fill('#url-input', `${new URL(page.url()).origin}/refused/data.parquet`);
  await page.click('#load-url-btn');

  await expect(page.locator('#table-info')).toHaveText(`Error: ${message}`, { timeout: 90_000 });
  expect(await injected(page)).toBe(false);
});

test('shows a previous session’s file name as text, not markup', async ({ page }) => {
  await watchInjection(page);
  await openDemo(page);
  const source = '<img src="x" alt="">.csv';
  await page.evaluate((source) => {
    localStorage.setItem(
      'dt-last-session',
      JSON.stringify({ type: 'file', source, tableName: 'dt_file_gone' }),
    );
  }, source);

  await page.reload();
  await expect(page.locator('#table-info')).toContainText(`Previous session: ${source}`);
  expect(await injected(page)).toBe(false);
});

/** The demo table's schema: what a restore has to bring back. */
function demoSchema(
  page: Page,
): Promise<{ name: string; type: string; originalType: string; system: boolean }[]> {
  return page.evaluate(() =>
    (window as unknown as DemoWindow).__dtDemo.table!.state.schema.get().map((c) => ({
      name: c.name,
      type: c.type,
      originalType: c.originalType,
      system: c.system === true,
    })),
  );
}

/** Columns at least partly in view with the view's left edge at `id`, and at `point`. */
const SCREENS = [
  ['id', ['raw_blob', 'tags', 'scores', 'long_list']],
  ['point', NESTED_EXAMPLE_STRUCTS],
] as const;

/**
 * The demo table's cells of {@link SCREENS}, by screen, row id and column,
 * each screen checked against DuckDB on the way: texts equal across a
 * restore are right ones too.
 */
async function nestedCells(page: Page): Promise<BodyState['cells'][]> {
  const root = '#table-container';
  const screens: BodyState['cells'][] = [];
  for (const [left, columns] of SCREENS) {
    await scrollToColumn(page, left, root);
    const body = await waitForFilledBody(page, columns, root);
    const expected = await expectedCellTexts(page, columns, Object.keys(body.cells), 'demo');
    expect(wrongCells(body, expected, columns)).toEqual([]);
    screens.push(body.cells);
  }
  return screens;
}

test('in development, the Nested types chip loads the dev server’s fixture, its nested columns typed nested', async ({
  page,
}) => {
  const parquet: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.parquet')) parquet.push(request.url());
  });
  // A chip that reached for GitHub would fail here, rather than pass on GitHub's copy.
  await page.route('https://raw.githubusercontent.com/**', (route) => route.abort());
  await openDemo(page);

  await page.getByRole('button', { name: NESTED_EXAMPLE }).click();
  await expectTable(page, NESTED_ROWS);
  expect(parquet).toEqual([
    `${new URL(page.url()).origin}/fixtures/parquet/nested-stress-tests.parquet`,
  ]);

  // The file's 36 columns, after the hidden `__rowid__`.
  const schema = await demoSchema(page);
  expect(schema[0]).toMatchObject({ name: '__rowid__', system: true });
  expect(schema.slice(1).map((c) => c.name)).toEqual(NESTED_COLUMNS.map((c) => c.name));
  expect(
    await page.evaluate(() =>
      (window as unknown as DemoWindow).__dtDemo.table!.state.visibleColumns.get(),
    ),
  ).toEqual(NESTED_COLUMNS.map((c) => c.name));
  // The lists, structs and maps are nested, and nothing else: the JSON
  // column stays text.
  const nested = NESTED_COLUMNS.filter((c) => ['list', 'struct', 'map'].includes(c.kind));
  expect(schema.filter((c) => c.type === 'nested').map((c) => c.name)).toEqual(
    nested.map((c) => c.name),
  );
  expect(schema.find((c) => c.name === 'doc')!.type).toBe('string');
  // The info bar counts the file's columns, without the hidden `__rowid__`.
  const info = page.locator('#table-info');
  await expect(info).toContainText(`${NESTED_ROWS}, ${NESTED_COLUMNS.length} columns (`);
  await expect(info).toContainText(`, ${nested.length} nested)`);
});

test('opens a ?url= link relative to the page', async ({ page }) => {
  const path = '/fixtures/csv/titanic.csv';
  await page.goto(`./?url=${path}`);
  await expectTable(page);

  const hash = createHash('sha256').update(readFileSync(CSV)).digest('hex').slice(0, 16);
  expect(await sessionTableName(page)).toBe(`dt_${hash}`);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('dt-last-session')!) as unknown),
  ).toEqual({ type: 'url', source: path, tableName: `dt_${hash}` });
  expect(new URL(page.url()).searchParams.get('url')).toBe(path);
});

test('brings the Nested types dataset back after a reload, and from the cache, with the same schema and cells', async ({
  page,
}) => {
  test.slow();
  await openDemo(page);
  await page.getByRole('button', { name: NESTED_EXAMPLE }).click();
  await expectTable(page, NESTED_ROWS);
  const tableName = await sessionTableName(page);
  expect(await cacheRow(page, tableName)).toEqual({
    fields: ['data', 'format', 'sourceName', 'tableName'],
    format: 'parquet',
    isFile: true,
    size: readFileSync(NESTED_PARQUET).byteLength,
    magic: 'PAR1',
  });
  const schema = await demoSchema(page);
  const cells = await nestedCells(page);

  const fetched: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.parquet')) fetched.push(request.url());
  });
  // A reload keeps the chip's `?url=` in the address, and the demo opens a
  // `?url=` link by fetching it again, to see whether its content changed.
  await page.reload();
  await expectTable(page, NESTED_ROWS);
  expect(fetched).toHaveLength(1);
  expect(await sessionTableName(page)).toBe(tableName);
  expect(await demoSchema(page)).toEqual(schema);
  expect(await nestedCells(page)).toEqual(cells);

  // Opened at its own address, the demo restores the dataset from the
  // cache, without fetching it.
  fetched.length = 0;
  await page.goto('./');
  await expectTable(page, NESTED_ROWS);
  expect(fetched).toEqual([]);
  expect(await sessionTableName(page)).toBe(tableName);
  expect(await demoSchema(page)).toEqual(schema);
  expect(await nestedCells(page)).toEqual(cells);
});
