# Execution status

One row per phase. The executing agent updates its row at session start (`in progress`) and
session end (`done`), and appends a handoff section below. Keep rows terse; put substance in the
handoff notes. Do not edit other phases' handoff sections.

| Phase | Doc                                                                          | Status      | Started    | Finished | Agent notes (one line)              |
| ----- | ---------------------------------------------------------------------------- | ----------- | ---------- | -------- | ----------------------------------- |
| 0     | [phase-00-harness.md](./phase-00-harness.md)                                 | in progress | 2026-08-08 | —        | Harness, instrumentation, baselines |
| 1     | [phase-01-load-path.md](./phase-01-load-path.md)                             | not started | —          | —        | —                                   |
| 2     | [phase-02-lazy-visualizations.md](./phase-02-lazy-visualizations.md)         | not started | —          | —        | —                                   |
| 3     | [phase-03-body-column-windowing.md](./phase-03-body-column-windowing.md)     | not started | —          | —        | —                                   |
| 4     | [phase-04-header-column-windowing.md](./phase-04-header-column-windowing.md) | not started | —          | —        | —                                   |
| 5     | [phase-05-projection-clipping.md](./phase-05-projection-clipping.md)         | not started | —          | —        | —                                   |
| 6     | [phase-06-interaction-sweep.md](./phase-06-interaction-sweep.md)             | not started | —          | —        | —                                   |
| 7     | [phase-07-rank-index.md](./phase-07-rank-index.md)                           | not started | —          | —        | —                                   |
| 8     | [phase-08-selection-model.md](./phase-08-selection-model.md)                 | not started | —          | —        | —                                   |
| 9     | [phase-09-persistence-undo.md](./phase-09-persistence-undo.md)               | not started | —          | —        | —                                   |
| 10    | [phase-10-direct-scan-mode.md](./phase-10-direct-scan-mode.md)               | not started | —          | —        | —                                   |
| 11    | [phase-11-bulk-transfer.md](./phase-11-bulk-transfer.md)                     | not started | —          | —        | —                                   |
| 12    | [phase-12-docs-integration.md](./phase-12-docs-integration.md)               | not started | —          | —        | —                                   |

Statuses: `not started` · `in progress` · `done` · `blocked (see notes)`.

---

## Handoff notes

Append a `### Phase N — <title>` section when you finish (or block on) your phase. Required
content:

- **Assumption drift**: file:line anchors from the phase doc that had moved or changed meaning,
  and what you did about it.
- **Files created/renamed/deleted** beyond what the phase doc predicted.
- **Budgets**: names + values you added to `tests/budgets.ts` or tightened.
- **Baselines**: tiers re-captured, before → after headline numbers.
- **Deviations** from the phase doc, with reasons.
- **For the next phases**: anything that changes their stated assumptions (be specific: file,
  symbol, new line anchor).
- **Manual verification**: final `window.__dtPerf` snapshot JSON (or the phase's equivalent) and
  where screenshots were saved, per the Chrome template.

<!-- Append handoff sections below this line. -->
