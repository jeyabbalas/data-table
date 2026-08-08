#!/usr/bin/env node
/**
 * perf-baseline-report.mjs
 *
 * Merges every `plans/scaling/baselines/baseline-*.json` capture written by
 * `tests/browser/perf-baseline.spec.ts` into a set of comparison tables in
 * `plans/scaling/baselines/README.md`, one table per tier + viz mode and
 * one column per capture SHA.
 *
 * Usage:
 *   node scripts/perf-baseline-report.mjs           # rewrite the README tables
 *   node scripts/perf-baseline-report.mjs --check   # fail if the README is stale
 *
 * The point is the shape, not the prose: a phase that claims it cut load
 * time has to show the new column next to the old one. Captures are
 * append-only (`plans/scaling/README.md` §8.6) — this script never deletes
 * a JSON and never edits outside its markers:
 *
 *     <!-- dt-baselines:start --> ... <!-- dt-baselines:end -->
 *
 * Notes:
 *   - Columns are ordered by capture date, then SHA, so the newest capture
 *     is always rightmost and a regression reads left to right.
 *   - `null` renders as `—`. It means "not measured for this tier", not
 *     "zero" — TARGET has no DOM at all until Phase 10, and conflating the
 *     two would invent a 100% improvement out of a missing number.
 *   - Machines are listed under each table rather than in it. Two captures
 *     from different machines are not comparable, and the report says so
 *     instead of quietly lining them up.
 *   - `--check` is for a docs-truth pass (Phase 12); nothing in CI runs it,
 *     because CI never has captures to compare.
 *   - The emitted tables are not column-padded; `npm run perf:baseline:report`
 *     chains `prettier --write` so `npm run format:check` stays green. Run
 *     this script bare and you must format the README yourself.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const baselineDir = join(repoRoot, 'plans', 'scaling', 'baselines');
const readmePath = join(baselineDir, 'README.md');
const readmeRelPath = 'plans/scaling/baselines/README.md';

const START = '<!-- dt-baselines:start -->';
const END = '<!-- dt-baselines:end -->';

/** Metric rows, in report order, with the unit shown to the reader. */
const METRICS = [
  ['genMs', 'Generate (ms)'],
  ['exportMs', 'Export to parquet (ms)'],
  ['loadMs', 'Load (ms)'],
  ['workerMs', '└ worker stage (ms)'],
  ['firstPaintMs', '└ first paint (ms)'],
  ['vizReadyMs', '└ viz ready (ms)'],
  ['queryCount', 'Queries sent'],
  ['cacheHits', 'Cache hits'],
  ['domNodes', 'DOM nodes'],
  ['canvasCount', 'Canvases'],
  ['liveResizeObservers', 'Live ResizeObservers'],
  ['liveMutationObservers', 'Live MutationObservers'],
  ['sortSignalSubscribers', 'sortColumns subscribers'],
  ['heapMB', 'JS heap (MB)'],
  ['oneSortMs', 'One sort (ms)'],
  ['oneFilterMs', 'One filter (ms)'],
  ['scrollStormFrameP95', 'Scroll storm frame p95 (ms)'],
];

/** Read every capture, newest last. */
function collectCaptures() {
  if (!existsSync(baselineDir)) return [];
  const files = readdirSync(baselineDir)
    .filter((f) => f.startsWith('baseline-') && f.endsWith('.json'))
    .sort();
  const rows = [];
  for (const file of files) {
    try {
      rows.push({ file, ...JSON.parse(readFileSync(join(baselineDir, file), 'utf8')) });
    } catch (err) {
      console.error(`perf-baseline-report: skipping unreadable ${file} — ${err.message}`);
    }
  }
  return rows;
}

/** Group by `<tier>-<vizMode>`, preserving a stable tier order. */
function groupCaptures(rows) {
  const order = ['wide-ci', 'wide', 'wide-csv', 'grid', 'deep', 'target'];
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.tier}-${row.vizMode}`;
    if (!groups.has(key)) groups.set(key, { tier: row.tier, vizMode: row.vizMode, captures: [] });
    groups.get(key).captures.push(row);
  }
  for (const group of groups.values()) {
    group.captures.sort((a, b) =>
      a.date === b.date ? a.gitSha.localeCompare(b.gitSha) : a.date.localeCompare(b.date),
    );
  }
  return [...groups.values()].sort((a, b) => {
    const byTier = order.indexOf(a.tier) - order.indexOf(b.tier);
    return byTier !== 0 ? byTier : a.vizMode.localeCompare(b.vizMode);
  });
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

/** One table per tier + viz mode; one column per capture. */
function renderGroup(group) {
  const { tier, vizMode, captures } = group;
  const lines = [`### ${tier} — visualizations ${vizMode}`, ''];

  const header = ['Metric', ...captures.map((c) => `\`${c.gitSha}\` (${c.date})`)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);

  for (const [key, label] of METRICS) {
    const cells = captures.map((c) => formatValue(c[key]));
    // A metric no capture in this group measured is noise in the table —
    // TARGET would otherwise carry eleven rows of em dashes.
    if (cells.every((cell) => cell === '—')) continue;
    lines.push(`| ${label} | ${cells.join(' | ')} |`);
  }

  lines.push('');
  for (const capture of captures) {
    const machine = capture.machine
      ? `${capture.machine.platform}, ${capture.machine.cpus} cpus, node ${capture.machine.node}`
      : 'machine not recorded';
    lines.push(`- \`${capture.gitSha}\` — ${machine}.${capture.notes ? ` ${capture.notes}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderReport(rows) {
  if (rows.length === 0) {
    return [
      '',
      '_No captures yet._ Run `npm run perf:baseline` and then',
      '`npm run perf:baseline:report`.',
      '',
    ].join('\n');
  }
  const groups = groupCaptures(rows);
  return ['', ...groups.map(renderGroup)].join('\n');
}

/** The README this script maintains, created on first run. */
function seedReadme() {
  return [
    '# Pre-optimization baselines',
    '',
    'Machine-generated. Do not edit between the markers — run',
    '`npm run perf:baseline:report` instead.',
    '',
    'Each JSON in this directory is one capture of one tier at one commit,',
    'written by `tests/browser/perf-baseline.spec.ts` (`npm run perf:baseline`).',
    'Captures are append-only: a phase that improves a number adds a column,',
    'it does not overwrite the old one.',
    '',
    'Wall-clock numbers here are **not** budgets and nothing asserts against',
    'them — they are machine-specific. The machine is recorded under each',
    'table; two rows from different machines are not comparable. The',
    'machine-independent counts (queries, DOM nodes, observers) are the ones',
    'that graduate into `tests/budgets.ts` when a phase tightens them.',
    '',
    START,
    END,
    '',
  ].join('\n');
}

function main() {
  const checkMode = process.argv.includes('--check');
  const rows = collectCaptures();
  const body = renderReport(rows);

  mkdirSync(baselineDir, { recursive: true });
  const existing = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : seedReadme();

  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    console.error(`perf-baseline-report: ${readmeRelPath} is missing its markers.\n`);
    console.error(`Fix: restore the \`${START}\` ... \`${END}\` block, or delete the file`);
    console.error('     and re-run to regenerate it from scratch.');
    process.exit(1);
  }

  const updated = existing.slice(0, start + START.length) + body + existing.slice(end);

  if (checkMode) {
    // Compare with layout collapsed: the committed README has been through
    // Prettier, which pads table cells *and* stretches the `| --- |`
    // separator dashes to match. A byte comparison against freshly
    // generated text would report "stale" on every run and mean nothing, so
    // normalize away exactly the three things Prettier changes — cell
    // padding, dash runs, and blank lines — and nothing else.
    const normalize = (text) =>
      text
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').replace(/-{2,}/g, '-').trim())
        .filter((line) => line.length > 0)
        .join('\n');
    if (normalize(updated) === normalize(existing)) {
      console.log(`perf-baseline-report: OK — ${readmeRelPath} matches ${rows.length} captures.`);
      return;
    }
    console.error(`perf-baseline-report: ${readmeRelPath} is stale.\n`);
    console.error('Fix: run `npm run perf:baseline:report` and commit the result.');
    process.exit(1);
  }

  writeFileSync(readmePath, updated, 'utf8');
  const tiers = new Set(rows.map((r) => `${r.tier}/${r.vizMode}`));
  console.log(
    `perf-baseline-report: wrote ${readmeRelPath} — ${rows.length} captures ` +
      `across ${tiers.size} tier/viz combinations.`,
  );
}

main();
