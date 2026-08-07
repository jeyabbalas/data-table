# Phase 12 — Docs, tiered targets, final integration pass

Size: **S/M** · Depends on: **all prior phases (0–11)** · Blocks: **nothing — this is the
branch's exit gate**

---

## 1. Context

Read [`README.md`](./README.md) (whole file) and [`STATUS.md`](./STATUS.md) — **every handoff
section, all twelve** — first. This phase is the integration buffer: documentation starts telling
the truth with the measured numbers from `plans/scaling/baselines/`, the accumulated changesets
reconcile into one coherent release story, and the whole branch passes the full verification
matrix across three tiers. **It adds no behavior.** If a regression surfaces here, the response
is a fix-forward commit scoped to that regression (each with its own gate re-run) — never a new
feature, never a refactor, never a redesign.

Relevant README sections: §6 (tiers — your three manual passes), §8.4 (gates), §8.6 (baselines
are append-only), §8.7 (Chrome protocol), §9 (deferred/rejected — feeds the known-limitations
list).

## 2. Problem statement

The docs were written for v0.2–0.7 and still describe the pre-scaling library:

- `docs/performance.md` says so itself: "A reference-machine benchmark harness is not yet in
  place … methodology-first" (`:22-26`); the "Observable thresholds" tiers are "approximate
  ranges from architectural reasoning — not measured" (`:195-217`); "Known slow paths (as of
  v0.2.0)" (`:467-472`) still lists the wide-table DESCRIBE slow path Phase 1 fixed; the
  "Phase-9 benchmark snapshot" (`:474-537`) predates every phase; "Future benchmark tracking"
  (`:539-551`) promises exactly the harness Phase 0 built.
- `AGENTS.md` — the consumer/agent-facing capability guide — carries two load-bearing stale
  claims: "Above ~5M rows expect noticeable UI latency" (§2 item 2, `:71`) and the
  DOES-NOT-SUPPORT entry "No latency guarantees on very large tables … `OFFSET` cost that grows
  with depth" (`:55`, obsoleted by Phase 7's rank index and Phase 10's direct scan). Its SUPPORTS
  matrix (`:27-47`), config cheat-sheet (`:513-531`), pitfalls (`:537-581`), and lifecycle
  diagram (`:627-651`) know nothing of lazy viz, `vizReady`, column windowing, the column picker,
  the selection union, `loadStrategy`, or streaming export.
- `README.md`, `llms.txt` (`:3`, `:18`), `docs/README.md` (`:20`), the concept docs, and six
  guides repeat pieces of the same stale story; three examples subscribe to `loadComplete`
  (`examples/02-load-from-url/main.ts:29`, `examples/10-column-export/main.ts:31`,
  `examples/14-standalone-sql-editor/main.ts:304`) and must be re-verified against Phase 2's
  changed semantics.
- Eleven phases of changesets have accumulated in `.changeset/` with nobody checking they add up
  to a releasable story with correct semver levels and complete migration notes.
- No single session has ever run the **entire** verification matrix — default gates, both
  perf-gated suites, baselines, and manual tiers — against the finished branch.

All line anchors above were verified at the branch point (`c326e9e`); eleven phases of edits
sit between then and now. **Re-locate every one before editing** (grep for the quoted phrases).

## 3. Targeted review checklist (read before writing a single doc line)

- `STATUS.md` handoff sections for Phases 0–11: renamed options/events/codes, spike-narrowed
  Phase 10 scope, deferred items, budget names, and each phase's docs edits (you verify those
  landed rather than re-writing them).
- Every `.changeset/*.md` — this is the authoritative enumeration of what shipped: new options
  (`loadStrategy`, `visualizations.eager`, any knobs from Phases 2/5/10/11), new events
  (`vizReady`), changed semantics (`loadComplete`, selection payloads), new error/warning codes
  (memory guardrail and persistence-quota codes from Phases 9/10 — use the **actual** names, not
  this doc's guesses). Note `uniform-stats-denominator.md` predates the branch and stays.
- `plans/scaling/baselines/README.md` (generated matrix) + the per-tier JSONs: the measured
  numbers your new tier table quotes, per capture SHA.
- `tests/budgets.ts` — the named budget constants your Chrome passes and doc claims cite.
- `docs/performance.md`, `AGENTS.md`, `README.md`, `llms.txt`, `docs/README.md`,
  `docs/concepts/architecture.md`, `docs/concepts/state-model.md`, `docs/troubleshooting.md`
  (error table `:16`, warnings `:76`, FAQs 8/25 `:273`/`:567`), and the six guides listed in
  §4.5 — current state, not branch-point state.
- `docs/migration-guides/README.md` + `_TEMPLATE.md` — the per-release migration convention the
  audit checks against.
- `CONTRIBUTING.md` changeset conventions; `package.json` scripts (`docs:api` = typedoc — never
  hand-edit `docs/api/`; `version`/`release` are the maintainer's, do not run).
- Skim `demo/perf.ts` for the readout fields (including Phase 10's load-strategy readout) your
  target-tier pass asserts on.

## 4. Design (decided — implement as specified; deviations go to STATUS.md)

### 4.1 `docs/performance.md` — the rewrite (largest single edit)

Keep the container-height material (`:11-19` and "The virtual scroller") — it is still the #1
pitfall. Then:

- **Delete** the "not yet measured" status paragraph (`:22-26`). Numbers exist now.
- **Replace "Observable thresholds"** with a measured tier matrix: rows = WIDE (1,000×100K),
  GRID (200×500K), DEEP (20×5M), TARGET (1,000×5M direct-scan); columns = load, first paint,
  scroll (frame p95), sort, filter, export — values from the **final** baseline JSONs, cited by
  git SHA + date + machine class, with the honest caveat that wall-clock varies 2–5× across
  hardware. Link `plans/scaling/baselines/` as provenance and `DEVELOPMENT.md` for reproducing.
- **Expand "Measuring your workload"** around Phase 0's `dt:load:*` stub: all five marks and
  four measures, a copy-pasteable `performance.getEntriesByName` snippet, and the
  `?gen=`/`window.__dtPerf` dev harness pointer.
- **New explanations** (short, linking to `docs/concepts/architecture.md` for depth): the rank
  index (why sorted/filtered deep scroll is now O(block), retiring the OFFSET caveat) and
  direct-scan mode (what `loadStrategy` trades: no materialization, per-query file scan cost,
  which features degrade per the Phase 10 spike).
- **Tuning levers**: add `loadStrategy`, `visualizations` laziness/eager opt-out, and every knob
  Phases 2/5/10/11 shipped (from the changesets); re-verify the existing lever text
  (`fetchBlockSize`, `rowCacheRows`, `prefetch`, cache size) still matches behavior.
- **Retire "Known slow paths (as of v0.2.0)"** — drop entries fixed by phases (the wide-table
  DESCRIBE bullet is Phase 1's), keep still-true ones, and fold in a **"Current limits"**
  section: honest ceilings from README §9 (no wasm64, no server compute, SAB opt-in only, Arrow
  IPC deferred), the ~4 GB WASM ceiling, TARGET-tier feature narrowing from the Phase 10 spike
  (read STATUS.md), and anything Phases 1–11 explicitly deferred.
- **Replace the "Phase-9 benchmark snapshot"** section's stale numbers with the new capture (or
  point it at the tier matrix) and delete "Future benchmark tracking" — it is delivered; keep a
  one-liner on where baselines live.

### 4.2 `AGENTS.md`

- Rewrite the two claims (re-locate first; anchors `:55` and `:71` at branch point): state the
  measured envelope (e.g. "DEEP 20×5M loads in ~Xs, sorts in ~Yms" — real numbers from the final
  baselines), point to `loadStrategy` and the performance.md tier matrix, and keep an honest
  residual caveat (wall-clock varies by hardware; TARGET tier has the Phase 10 feature limits).
- SUPPORTS matrix: add lazy visualizations + `vizReady`, column virtualization (windowed body +
  headers), searchable column picker, the `explicit | all-except` selection model, `loadStrategy`
  / direct-scan, streaming exports — one bullet each with `src/<file>` cites, matching the list's
  existing style.
- §4 cheat-sheet: add rows for every new `createDataTable` option with its default.
- §5 pitfalls: update pitfall 11 (`loadData` completion semantics) for Phase 2 — `loadComplete`
  fires at first interactive paint; code that needs charts drawn must await `vizReady` (or set
  the eager opt-out). Add pitfalls only where a changeset shows a real trap (e.g. select-all now
  yields a non-enumerable selection shape — use whatever API Phase 8 shipped).
- §8 lifecycle diagram: insert `vizReady` after `loadComplete`; reflect load-promise timing.

### 4.3 `README.md`

- Feature bullets (`:8-31`): lazy-by-default visualizations, column virtualization, column
  picker, selection at 5M rows, `loadStrategy`, streaming export — edit existing bullets rather
  than growing the list unboundedly.
- New short **"Large datasets"** section (place after "Sizing the container", which stays
  verbatim): 3–6 sentences — the tiers the library is verified against with one headline number
  each, `loadStrategy` in one line, link to `docs/performance.md`. Include (here or in
  performance.md — pick one, link from the other) the known-limitations list from §4.1.
- Events paragraph (`:331-341`): add `vizReady`. Feature-toggles table: `visualizations` row
  gains the eager/lazy note. Re-count the error-code claims (`:212` says 46, `:395` says 34 —
  already inconsistent; fix both against the post-Phase-9/10 catalog).

### 4.4 Concepts, troubleshooting, llms.txt, index pages

- `docs/concepts/architecture.md`: Phases 2/3/4/7/10 each added their section (verify in
  STATUS.md). Your job is **coherence**: the "10-second summary" and "Data flow" walk-through
  mention column windowing, the viz lifecycle/state machine, the rank index, and direct-scan;
  cross-links between sections exist; no section still describes the pre-phase behavior it sits
  next to.
- `docs/concepts/state-model.md`: "Selection" reflects the Phase 8 union type; "Undo / redo
  snapshots" reflects Phase 9's bounded/shared snapshots; the `TableState` field inventory
  matches `src/core/State.ts` today.
- `docs/troubleshooting.md`: add rows to the error/warning tables for every new code the
  changesets enumerate (memory-ceiling guardrail, loud persistence-quota, direct-scan errors —
  actual names only); update FAQ 8 (memory across `loadData`) and FAQ 25 (slow large tables) to
  mention `loadStrategy`; add an FAQ only if a phase's STATUS notes flag a recurring confusion
  (candidate: "my code awaited `loadComplete` but charts weren't drawn").
- `llms.txt`: refresh the capability summary (`:3`) and the performance.md blurb (`:18`);
  `docs/README.md:20` same blurb fix.

### 4.5 Guides + examples (verify-then-fill, not rewrite)

For each guide, confirm the owning phase's edits landed (STATUS.md says which); fill gaps only:
`loading-data.md` (honest progress §"Progress reporting", `loadStrategy` under source
types/recipes), `visualizations.md` (lazy lifecycle, `vizReady`, staleness), `events.md`
(catalog + "Lifecycle ordering" diagram + "Track a long load" recipe), `filters.md` (gotchas:
sorted/filtered deep scroll now fine), `session-persistence.md` ("What gets persisted" after
Phase 9; quota handling now loud), `derived-columns.md` (vector ingestion via Arrow, new size
guidance). Then run each of the 14 `examples/` against the dev server; the three `loadComplete`
subscribers get special attention (do they read viz state after it?). Fix example code where new
defaults changed observable behavior; annotate (comment) where behavior is merely faster.

### 4.6 API reference + changeset audit

- `npm run docs:api` regenerates `docs/api/` (never hand-edit); `docs/api-reference.md` entries
  for new symbols should exist from their phases — verify, fill gaps. `npx vitest -u` **only** if
  the API-surface snapshot legitimately changed, and inspect the diff.
- Changeset audit: table of every `.changeset/*.md` → semver level → one-line summary. Verify:
  breaking notes + `Migration` sections exist for the `loadComplete` semantics change and the
  selection-model change; levels are honest (behavior changes ≥ minor; breaking documented);
  naming is coherent; `docs/migration-guides/` has entries where the template requires them. Add
  missing changesets for earlier phases' changes if any were forgotten (that is in scope). **Do
  not run `changeset version` or `release`** — the maintainer cuts the release.
- Paste the audit table into STATUS.md under your handoff.

### 4.7 Regression protocol

A §6/§7 failure means a real regression escaped a phase gate. Fix forward: smallest change that
restores the contract, its own commit ("Fix <symptom> regression from phase N work"-shaped
subject, still no prefixes), then **re-run the full §6 sequence from the top**. If the fix would
require redesigning a phase's approach, stop and report per README §8.2 — do not improvise.

## 5. Implementation milestones (commit at each)

1. Changeset audit + any back-fill changesets + migration-guide gaps. — _commit: "Reconcile
   changesets into a coherent release story"_
2. `docs/performance.md` rewrite (§4.1). — _commit: "Rewrite performance doc around measured
   tier baselines"_
3. `AGENTS.md` + `README.md` + `llms.txt` + `docs/README.md` (§4.2–4.3, llms/index bits of
   §4.4). — _commit: "Update capability claims to the measured envelope"_
4. Concepts + troubleshooting + guides coherence pass (§4.4–4.5). — _commit: "Align concept
   docs, troubleshooting, and guides with scaling work"_
5. Examples verified/fixed; `npm run docs:api` regen. — _commit: "Verify examples and regenerate
   API reference"_
6. Full gate run (§6) + final baselines + report. — _commit: "Capture final baselines across all
   tiers"_
7. Three manual tier passes (§7), evidence + audit table into STATUS.md; phase row `done`. —
   _commit: "Record final verification evidence for the branch"_

## 6. Programmatic verification — the final integration gate

Run **in this order**, each expected green (this is the whole branch's exit gate, not just this
phase's):

```bash
npm run lint
npm run format:check          # includes plans/**/*.md — prettier-clean
npm run typecheck
npm run test:coverage         # coverage gate holds
npm run build
npm run size                  # bundle budgets hold (docs changes must not move them)
npm run docs:api:check
npm run test:browser          # includes tiers.smoke.spec.ts
npm run test:perf             # script already sets RUN_DUCKDB_PERF=1 RUN_LIFECYCLE_STRESS=1
RUN_BROWSER_PERF=1 npx playwright test
npm run perf:baseline && npm run perf:baseline:report
```

Expected outcomes: zero failures anywhere; the two perf-gated suites pass within their budgets
from `tests/budgets.ts`; the baseline run appends a **final** capture column per tier (committed
— append-only, never overwrite; the report README now shows the before/after arc of the whole
branch). Additionally grep-verify no doc still contains the retired claims: the strings
"not measured", "Above ~5M rows expect noticeable UI latency", "No latency guarantees", and
"as of v0.2.0" appear nowhere in `README.md`, `AGENTS.md`, `docs/` (except changelog/migration
history, which records the past truthfully).

## 7. Manual verification (Claude in Chrome) — three tier passes

Instantiate [`templates/verification-chrome.md`](./templates/verification-chrome.md) **three
times**, end-to-end each, with budget placeholders (`{{READY_BUDGET_MINUTES}}`,
`{{QUERY_BUDGET}}`, `{{DOM_BUDGET}}`, `{{SORT_QUERY_BUDGET}}`, …) filled from `tests/budgets.ts`
and `{{LOAD_MS_EXPECTATION}}`-class values from the **final** baseline capture for that tier
(generous ×2 margin — this is a hand-driven browser, not CI):

- **Pass A — WIDE, viz on** (`?gen=wide&viz=on`): all 12 template steps. Step 5's horizontal
  sweep asserts the **windowed** header slice (Phases 3–4). Extend step 8 with the Phase 6
  column picker (open, search a column, toggle visibility, close) and a full undo/redo unwind of
  every step-8 mutation. Step 9 export of 1,000 rows.
- **Pass B — DEEP** (`?gen=deep&viz=on`): steps 1–4 and 6–12 (skip 5 — 20 columns). Step 4 jumps
  to ~row 4,850,000 sorted **and** unsorted (rank index, Phase 7). Add a selection probe:
  select-all via the header checkbox, assert the readout/heap does not balloon (Phase 8), spot
  invert one row, clear. Step 9 export.
- **Pass C — TARGET** (`?gen=target` in whatever load mode Phase 10 shipped): steps 1–4, 6, 9,
  11–12 scoped to what the spike-narrowed feature set supports (read STATUS.md — assert
  gracefully-absent, don't fight it). Additionally assert the readout/table reports the
  **direct-scan strategy** (Phase 10's readout field), first paint within its baseline budget,
  and step 9's export completes via the streamed path with plausible `byteLength`.

Every pass finishes with the template's console sweep: **zero new console errors, all three
tiers**. Attach all three final `window.__dtPerf` snapshots + screenshots to STATUS.md.

## 8. Acceptance checklist

- [ ] All §6 commands green in one session on the final tree; final baselines + regenerated
      report committed.
- [ ] Every doc file named in §4 touched-or-verified, each with a one-line note in the STATUS.md
      handoff ("rewritten" / "verified, no gap" / "gap filled: …").
- [ ] Changeset audit table (file → level → summary) pasted into STATUS.md; breaking +
      migration notes confirmed for `loadComplete` and selection; back-filled changesets (if
      any) listed.
- [ ] `docs/api/` regenerated, not hand-edited; API-surface snapshot diff (if any) intentional.
- [ ] Stale-claim grep from §6 comes back empty; error-code counts in README/troubleshooting
      match the actual catalog.
- [ ] All 14 examples run against new defaults; fixes/annotations committed.
- [ ] Three Chrome tier passes executed end-to-end, zero console errors, evidence in STATUS.md.
- [ ] Any regression fixed forward with its own commit + full gate re-run, and written up.
- [ ] Working tree clean; STATUS.md row `done`; branch ready for the maintainer's PR.

## 9. Out of scope

Any behavior change, feature, or refactor (fix-forward regressions excepted); running
`changeset version` / `changeset publish` or editing `CHANGELOG.md` version sections (the
maintainer's release does that); CI workflow changes; rewriting docs sections unrelated to
scaling; overwriting historical baseline JSONs; relitigating README §9 rejections — document
them instead.

## 10. Docs / changeset obligations

This phase **is** the docs work (§4). Its own changeset: at most a docs-only `patch` (or none)
— but back-filling forgotten changesets for earlier phases' user-visible changes is in scope and
takes whatever level that change honestly needs. `DEVELOPMENT.md`: verify Phase 0's "Dataset
tiers and perf harness" section survived eleven phases of drift (tier table, `?gen=` grammar,
`RUN_*` gates, baseline procedure) — it is now the contract future contributors hold the perf
story to.

## 11. STATUS.md handoff

Fill per the STATUS.md required list, plus: the per-file touched-or-verified table (§8), the
changeset audit table, the final baseline headline numbers per tier (the branch's closing
before/after story, citing first and last capture SHAs), all three Chrome snapshots + screenshot
paths, any fix-forward commits with root-cause one-liners, and a short "for the maintainer's PR"
list: suggested release headline, the breaking changes with their migration pointers, and the
known-limitations link. This is the last handoff — write it for the human reading the PR, not
for a next phase.
