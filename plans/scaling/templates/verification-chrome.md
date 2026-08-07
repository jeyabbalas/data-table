# Manual verification template — Claude in Chrome

Every phase instantiates this template in its "Manual verification" section: copy the steps,
fill the `{{…}}` placeholders (tier, params, budgets, phase-specific assertions), and drop steps
marked _(conditional)_ that don't apply to your phase. Execute it with the Claude-in-Chrome MCP
tools (`tabs_create_mcp`, `navigate`, `computer`, `javascript_tool`, `read_console_messages`,
`gif_creator`, …). Record results (metrics snapshots, screenshot paths, anomalies) in your
STATUS.md handoff.

**Availability note (Phase 0 only):** steps 3+ depend on the `?gen=` perf harness and
`#dt-perf-panel` that Phase 0 itself builds. Phase 0's doc contains its own bootstrap variant;
every later phase uses this template as-is.

## Ground rules

- **Never click `#file-input`** — the native file chooser cannot be automated. Tiers load via
  `?gen=`.
- **Never trigger native downloads, the clipboard, or `alert`/`confirm` dialogs** — they block
  the extension. Export is verified page-side (step 9). If a dialog opens accidentally, the user
  must dismiss it manually; note it and continue.
- **Poll, don't sleep.** Generation + load can take minutes on pre-optimization baselines; poll
  the readiness signals below on a ~5 s cadence with a phase-stated budget.
- **Console discipline**: capture console messages at session start, after heavy steps, and at
  the end with `read_console_messages` (pattern: `"error|Error|Uncaught|failed"`). The pass
  criterion is **zero new errors** across the session (allowlist known noise only if your phase
  doc lists any).
- `heapMB` in the readout is quantized in standard Chrome — compare orders of magnitude only.
- Chrome-extension caveat: interactions use the `computer` tool on the page screenshot;
  re-screenshot after layout-changing steps before clicking again.

## Steps

### 1. Start the dev server

```bash
# Bash tool, run_in_background: true   (Playwright owns port 5199; use 5173 here)
npm run dev -- --port 5173 --strictPort
```

Readiness: poll up to 60 s until `curl -sf http://localhost:5173/data-table/ > /dev/null`
succeeds. If the port is taken, find and stop the stale process first — do not switch ports
(the URLs below assume 5173).

### 2. Open the harness tab

Create a fresh tab (`tabs_create_mcp` — never reuse a stale tab id) and navigate to:

```
http://localhost:5173/data-table/?gen={{TIER}}&viz={{on|off}}{{&rows=…&cols=…&seed=…}}
```

Immediately read console messages (pattern above) to establish the baseline noise set.

### 3. Wait for ready + capture the load snapshot

Poll via `javascript_tool` every ~5 s (budget: `{{READY_BUDGET_MINUTES}}` min, from the baseline
table):

```js
document.querySelector('#dt-perf-panel')?.dataset.state;
```

until `"ready"`. On `"error"`: capture `[data-metric="error"]`, screenshot, stop the session,
and report. Then:

```js
JSON.stringify(window.__dtPerf.refresh());
```

**Assert**: `rows`/`cols` match the tier; `loadMs` within `{{LOAD_MS_EXPECTATION}}`;
`queryCount ≤ {{QUERY_BUDGET}}`; `domNodes ≤ {{DOM_BUDGET}}`.
**Screenshot #1**: full page (first paint + readout).

### 4. Deep vertical scroll + jumps

Via `javascript_tool`, then ~2 s settle each:

```js
const el = document.querySelector('.dt-body-scroll');
el.scrollTop = el.scrollHeight * 0.5; // then 0.97; then a scrollbar thumb drag via the computer tool
```

**Assert after each position** (via `javascript_tool`):

- No stuck placeholders: `document.querySelectorAll('.dt-root .dt-row [data-placeholder]').length === 0`
  (allow transiently non-zero right after the jump; assert after settle — selector per phase doc
  if the placeholder marker differs).
- Row oracle spot-check (unsorted/unfiltered only): for 3 visible rows,
  `data-row-id === data-row-index` and the `col_0` cell text equals the row index.

**Screenshot #2** at the deepest position. _(Optional)_ record the jump with `gif_creator` for
the phase log.

### 5. Horizontal sweep _(wide tiers)_

Set `.dt-body-scroll.scrollLeft` to 0 → 25% → 50% → 75% → max, settling ~1 s each. **Assert at
each stop**: rendered header `data-column` sequence equals the corresponding slice of
`window.__dtPerf.table.state.visibleColumns.get()` ({{before Phase 3: the full list}}), and one
sampled visible cell's text matches the tier's `cellOracle` value for its (row, column). Observe:
no blank cell bands persisting > ~1 s.

### 6. Sort

`window.__dtPerf.resetQueryStats()`. Click the sort control on column `{{SORT_COL}}` (locate via
`find`/screenshot, click via `computer`). Wait for settle (poll until the grid subtree stops
mutating across 3 polls ~120 ms apart). **Assert**: first visible column values are ordered;
query-count delta ≤ `{{SORT_QUERY_BUDGET}}`; wall feel `{{SORT_EXPECTATION}}`. Sort again to
invert; then clear. **The row oracle is invalid while sorted — do not assert it here.**

### 7. Filter _(viz=on runs)_

On a numeric column's histogram, drag-select a bin range (`computer` drag). **Assert**: a filter
chip appears; the filtered row count drops plausibly; visible histograms re-render;
query-count delta ≤ `{{FILTER_QUERY_BUDGET}}`. Open the filter panel from a column header, add a
categorical filter, apply. Remove both via their chips. Re-assert zero new console errors.

### 8. Column operations

Resize (drag a header edge ±100 px — expect no multi-second jank, budget
`{{RESIZE_EXPECTATION}}`), pin the first data column, hide one column, reorder one column via its
drag handle. Repeat a short horizontal sweep — **assert** the pinned column stays leftmost and
the step-5 invariant still holds. Undo repeatedly to initial state, then redo back. **Assert**
after each: no console errors; no stuck placeholders.

### 9. Export _(page-side only — never the native download)_

Open the export dialog (to verify it renders), close with Escape. Then verify the data path via
`javascript_tool`:

```js
const t = window.__dtPerf.table;
const name = t.state.tableName.get();
const buf = await t.bridge.exportToBuffer(
  `SELECT * FROM "${name.replaceAll('"', '""')}" LIMIT 1000`,
  'parquet',
);
buf.byteLength;
```

**Assert**: `byteLength > 0` and within `{{EXPORT_SIZE_RANGE}}`.

### 10. Theme flip

Select the "Dark" theme radio. Wait for `.dt-root[data-dt-color-scheme="dark"]`. **Assert**: no
console errors; flip completes without a multi-second stall (`{{THEME_EXPECTATION}}`).
**Screenshot #3** (dark). Flip back.

### 11. Final sweep

`read_console_messages` (same pattern) — **assert zero new errors for the whole session**.
Capture the final `window.__dtPerf.refresh()` snapshot and record it (plus screenshot paths) in
STATUS.md.

### 12. Cleanup

Close the tab (`tabs_close_mcp`). Stop the dev server (TaskStop / kill the background shell).
Confirm the port is free: `! curl -sf http://localhost:5173/data-table/`.

## Placeholder key

| Placeholder                                                                                             | Filled with                                                          |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `{{TIER}}`                                                                                              | `wide-ci` \| `wide` \| `grid` \| `deep` \| `target` \| `custom`      |
| `{{READY_BUDGET_MINUTES}}`                                                                              | from the baseline table for this tier (generous pre-optimization)    |
| `{{LOAD_MS_EXPECTATION}}` / `{{SORT_EXPECTATION}}` / `{{RESIZE_EXPECTATION}}` / `{{THEME_EXPECTATION}}` | order-of-magnitude expectations; cite the phase's budget or baseline |
| `{{QUERY_BUDGET}}` / `{{DOM_BUDGET}}` / `{{SORT_QUERY_BUDGET}}` / `{{FILTER_QUERY_BUDGET}}`             | named constants from `tests/budgets.ts`                              |
| `{{SORT_COL}}`                                                                                          | a numeric column, typically `col_1`                                  |
| `{{EXPORT_SIZE_RANGE}}`                                                                                 | plausible byte range for 1,000 rows of the tier                      |
