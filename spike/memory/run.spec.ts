/**
 * Drives the memory-envelope spike: one fresh page (so one fresh DuckDB and
 * one fresh linear memory) per case, one JSON result per case.
 *
 *   SPIKE_DATA=<dir with gen.py output> \
 *   npx playwright test -c spike/memory/playwright.config.ts
 *
 * SPIKE_CASES overrides the matrix: comma-separated `strategy:file[:flags]`,
 * where flags may contain `i` (run interactions) and `limit=<size>`
 * (e.g. `buffer:wide-200k:i:limit=2.5GB`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';

const DATA = process.env['SPIKE_DATA'];
const RESULTS = join(fileURLToPath(new URL('.', import.meta.url)), 'results');

const DEFAULT_CASES = [
  // Ceiling bisection at 1,000 columns: load only.
  ...['buffer', 'handle'].flatMap((s) =>
    ['wide-100k', 'wide-150k', 'wide-200k', 'wide-250k', 'wide-300k'].map((f) => `${s}:${f}`),
  ),
  'view:wide-300k',
  // The target shapes, with the interaction queries.
  ...['buffer', 'handle', 'view'].flatMap((s) =>
    ['wide-200k', 'wide-200k-onerg', 'wide-200k-rounded', 'deep-5m', 'deep-5m-rg1m'].map(
      (f) => `${s}:${f}:i`,
    ),
  ),
  // The limit the archived branch hard-coded.
  'handle:wide-200k::limit=2.5GB',
];

/** `prefetch` and `nocache` flags map to DuckDB settings applied before the load. */
function settingsFor(flags: string[]): string[] {
  return [
    ...(flags.includes('prefetch') ? ['SET prefetch_all_parquet_files = true'] : []),
    ...(flags.includes('nocache') ? ['SET enable_external_file_cache = false'] : []),
  ];
}
const settingTag = (settings?: string[]) =>
  (settings ?? []).map((s) => (s.includes('prefetch') ? 'prefetch' : 'nocache'));

const cases = (process.env['SPIKE_CASES']?.split(',') ?? DEFAULT_CASES).map((spec) => {
  const [strategy, file, ...flags] = spec.split(':');
  const limit = flags.find((f) => f.startsWith('limit='))?.slice('limit='.length);
  return {
    strategy: strategy as 'buffer' | 'handle' | 'view',
    file: file!,
    interactions: flags.includes('i'),
    ...(limit ? { memoryLimit: limit } : {}),
    ...(settingsFor(flags).length ? { settings: settingsFor(flags) } : {}),
    ...(flags.includes('lib') ? { loader: 'library' as const } : {}),
    ...(flags.includes('retry') ? { retryLazy: true } : {}),
  };
});

test.skip(!DATA, 'set SPIKE_DATA to the directory holding gen.py output');
mkdirSync(RESULTS, { recursive: true });

for (const c of cases) {
  const label = `${c.file} ${c.strategy}${c.interactions ? ' +interactions' : ''}${c.memoryLimit ? ` limit=${c.memoryLimit}` : ''}${settingTag(
    c.settings,
  )
    .map((s) => ` +${s}`)
    .join('')}${c.loader === 'library' ? ' +library' : ''}`;
  test(label, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const name = `${c.file}__${c.strategy}${c.memoryLimit ? `__${c.memoryLimit}` : ''}${settingTag(
      c.settings,
    )
      .map((s) => `__${s}`)
      .join('')}${c.loader === 'library' ? '__library' : ''}${c.retryLazy ? '__retry' : ''}.json`;
    try {
      await page.goto('/');
      await page.waitForFunction(() => window.spike?.ready === true, undefined, {
        timeout: 120_000,
      });
      await page.setInputFiles('#file', join(DATA!, `${c.file}.parquet`));
      const result = await page.evaluate((config) => window.spike.run(config), {
        strategy: c.strategy,
        interactions: c.interactions,
        ...(c.memoryLimit ? { memoryLimit: c.memoryLimit } : {}),
        ...(c.settings ? { settings: c.settings } : {}),
        ...(c.loader ? { loader: c.loader } : {}),
        ...(c.retryLazy ? { retryLazy: true } : {}),
        timeoutMs: 5 * 60_000,
      });
      writeFileSync(join(RESULTS, name), JSON.stringify(result, null, 2) + '\n');
      console.log(
        `${label}: ${result.ok ? 'OK' : `FAILED at ${result.failedAt}: ${result.error}`}` +
          ` | wasm peak ${result.wasmMiB.end} MiB | load ${result.timings['load']?.ms ?? '-'} ms` +
          (result.timings['enhance'] ? ` | enhance ${result.timings['enhance'].ms} ms` : '') +
          (result.timings['retry']
            ? ` | first load: ${result.timings['load']?.error?.slice(0, 40)} | retry ${result.timings['retry'].ms} ms${result.timings['retry'].error ? ' ' + result.timings['retry'].error : ''}`
            : '') +
          (result.convertedColumns?.length ? ` | converted ${result.convertedColumns.length}` : ''),
      );
    } catch (err) {
      // The tab itself died (e.g. the renderer was killed for memory): that
      // is a result, not a harness failure.
      const error = err instanceof Error ? err.message : String(err);
      writeFileSync(
        join(RESULTS, name),
        JSON.stringify({ config: c, ok: false, failedAt: 'page', error }, null, 2) + '\n',
      );
      console.log(`${label}: PAGE FAILED: ${error.split('\n')[0]}`);
    } finally {
      await context.close().catch(() => {});
    }
  });
}
