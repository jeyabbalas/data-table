/**
 * How the demo hands datasets to the library, and caches them for refresh.
 *
 * A large Parquet file only loads through the library's File path, where
 * DuckDB reads it from disk as it goes: read into an ArrayBuffer first, a
 * 200K × 1,000 file needs more memory than WebAssembly has. So the demo
 * must never read a dataset itself. These specs count every read of the
 * dataset's File on the page (`arrayBuffer`, `text`, `stream`, `bytes`),
 * and check what the refresh cache in IndexedDB holds: a Parquet source is
 * cached as the file itself, and restored from it unread; a small CSV as a
 * Parquet export, as before.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openDemo } from './helpers/demo';

const fixture = (path: string): string =>
  fileURLToPath(new URL(`../fixtures/datasets/${path}`, import.meta.url));
const PARQUET = fixture('parquet/titanic.parquet');
const CSV = fixture('csv/titanic.csv');
const ROWS = '891 rows';

type Probe = { __reads: string[]; __injected: boolean };

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

async function expectTable(page: Page): Promise<void> {
  await expect(page.locator('#table-info')).toContainText(ROWS, { timeout: 90_000 });
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

test('hands an uploaded Parquet file to the library unread, and caches the file itself', async ({
  page,
}) => {
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

  // A refresh restores the dataset from the cached file, again unread.
  await page.reload();
  await expectTable(page);
  expect(await sessionTableName(page)).toBe(tableName);
  expect(await reads(page)).toEqual([]);
});

test('caches a small CSV as a Parquet export, and restores it', async ({ page }) => {
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

test('names a URL dataset by its content hash, and caches the fetched file', async ({ page }) => {
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

test('shows a shared ?url= link as text, not markup', async ({ page }) => {
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
  const payload = '<img src="x" alt="">';
  await page.goto(`./?url=${encodeURIComponent(payload)}`);

  await expect(page.locator('#table-info')).toContainText('Error', { timeout: 90_000 });
  expect(await page.evaluate(() => (window as unknown as Probe).__injected)).toBe(false);
});
