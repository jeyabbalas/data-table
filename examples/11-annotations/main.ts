import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  QueryError,
  type DataTable,
  type AnnotationSeverity,
  type AnnotationFile,
  type CellAnnotation,
  type NewAnnotation,
  type RowAnnotation,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const container = $<HTMLElement>('table');
const filePicker = $<HTMLInputElement>('file-picker');
const scaleStatus = $<HTMLElement>('scale-status');
const navStatus = $<HTMLElement>('nav-status');
const onlyAnnotated = $<HTMLInputElement>('only-annotated');
const issueList = $<HTMLOListElement>('issues');
const issuesStatus = $<HTMLElement>('issues-status');

/** How many errors the list shows. */
const ISSUES_SHOWN = 20;

/** A message, unless a newer navigation took over the one that failed. */
function failure(err: unknown): string | null {
  if (err instanceof QueryError && err.code === 'QUERY_ABORTED') return null;
  return `Failed: ${err instanceof Error ? err.message : String(err)}`;
}

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    // Distinct tableName from example 10 so IndexedDB keys don't collide.
    tableName: 'nyc_taxi_annotations',
  });

  await table.loadData(DATA_URL, { sourceFormat: 'parquet', tableName: 'nyc_taxi_annotations' });

  // =========================================
  // Scenarios — each clears first so overlays don't accumulate
  // =========================================
  $<HTMLButtonElement>('btn-scenario-a').onclick = () => {
    table!.annotations.clear('all');
    table!.annotations.add({
      scope: 'row',
      rowId: 5,
      severity: 'warning',
      message: 'Scenario A — row 5 has a warning',
      code: 'SCENARIO_A',
    });
  };
  $<HTMLButtonElement>('btn-scenario-b').onclick = () => {
    table!.annotations.clear('all');
    table!.annotations.add({
      scope: 'column',
      column: 'fare_amount',
      severity: 'error',
      message: 'Scenario B — fare_amount column has an error',
      code: 'SCENARIO_B',
    });
  };
  $<HTMLButtonElement>('btn-scenario-c').onclick = () => {
    table!.annotations.clear('all');
    table!.annotations.add({
      scope: 'cell',
      rowId: 3,
      column: 'fare_amount',
      severity: 'info',
      message: 'Scenario C — info on (rowId 3, fare_amount)',
      code: 'SCENARIO_C',
    });
  };
  $<HTMLButtonElement>('btn-scenario-d').onclick = () => {
    table!.annotations.clear('all');
    const batch: NewAnnotation[] = [
      {
        scope: 'row',
        rowId: 7,
        severity: 'warning',
        message: 'Scenario D — row warning on rowId 7',
        code: 'SCENARIO_D_ROW',
      },
      {
        scope: 'column',
        column: 'fare_amount',
        severity: 'error',
        message: 'Scenario D — column error on fare_amount',
        code: 'SCENARIO_D_COL',
      },
      {
        scope: 'cell',
        rowId: 7,
        column: 'fare_amount',
        severity: 'info',
        message: 'Scenario D — cell info at (7, fare_amount)',
        code: 'SCENARIO_D_CELL',
      },
    ];
    table!.annotations.addMany(batch);
  };

  // Scenario E — multiple annotations of every scope piled at the same
  // intersection. Demonstrates that AnnotationStore tolerates multiple
  // annotations per (rowId, column) target and AnnotationPopover renders
  // each one in its scope's section.
  $<HTMLButtonElement>('btn-scenario-e').onclick = () => {
    table!.annotations.clear('all');
    const severities: AnnotationSeverity[] = ['error', 'warning', 'info'];
    const batch: NewAnnotation[] = [];
    for (const sev of severities) {
      batch.push({
        scope: 'row',
        rowId: 5,
        severity: sev,
        message: `Scenario E — row ann (${sev}) on row 5`,
        code: `SCENARIO_E_ROW_${sev.toUpperCase()}`,
      });
    }
    for (const sev of severities) {
      batch.push({
        scope: 'column',
        column: 'fare_amount',
        severity: sev,
        message: `Scenario E — column ann (${sev}) on fare_amount`,
        code: `SCENARIO_E_COL_${sev.toUpperCase()}`,
      });
    }
    for (const sev of severities) {
      batch.push({
        scope: 'cell',
        rowId: 5,
        column: 'fare_amount',
        severity: sev,
        message: `Scenario E — cell ann (${sev}) at (5, fare_amount)`,
        code: `SCENARIO_E_CELL_${sev.toUpperCase()}`,
      });
    }
    table!.annotations.addMany(batch);
  };

  $<HTMLButtonElement>('btn-clear').onclick = () => {
    table!.annotations.clear('all');
  };

  // =========================================
  // Scale — 100,000 annotations in one addMany: one change event, and the
  // grid's work does not grow with the store.
  // =========================================
  $<HTMLButtonElement>('btn-add-100k').onclick = () => {
    const t = table!;
    const rows = t.state.totalRows.get();
    const columns = t.state.schema
      .get()
      .filter((c) => !c.system)
      .map((c) => c.name);
    const severities: AnnotationSeverity[] = ['error', 'warning', 'info'];
    const batch: NewAnnotation[] = [];
    for (let i = 0; i < 100_000; i++) {
      const severity = severities[Math.floor(Math.random() * 3)]!;
      const rowId = Math.floor(Math.random() * rows);
      const column = columns[Math.floor(Math.random() * columns.length)]!;
      const kind = Math.random();
      if (kind < 0.9) {
        batch.push({ scope: 'cell', rowId, column, severity, message: `Check ${column}` });
      } else if (kind < 0.99) {
        batch.push({ scope: 'row', rowId, severity, message: `Check row ${rowId}` });
      } else {
        batch.push({ scope: 'column', column, severity, message: `Check column ${column}` });
      }
    }
    const started = performance.now();
    t.annotations.addMany(batch);
    const ms = Math.round(performance.now() - started);
    scaleStatus.textContent = `Added 100,000 in ${ms} ms: ${t.annotations.count().toLocaleString()} in all.`;
  };

  // =========================================
  // Navigate — what F8 / Shift+F8 (Alt+↓ / Alt+↑) run, from buttons. The
  // order is the view's, as filtered and sorted.
  // =========================================
  const go = async (direction: 'next' | 'previous') => {
    try {
      const landed =
        direction === 'next'
          ? await table!.actions.nextAnnotation()
          : await table!.actions.previousAnnotation();
      navStatus.textContent = landed
        ? `Row ${(landed.row + 1).toLocaleString()}, ${landed.column}: ` +
          `${landed.annotations[0]?.message ?? ''}${landed.wrapped ? ' (went round)' : ''}`
        : 'No annotations shown.';
    } catch (err) {
      navStatus.textContent = failure(err) ?? navStatus.textContent;
    }
  };
  $<HTMLButtonElement>('btn-prev').onclick = () => void go('previous');
  $<HTMLButtonElement>('btn-next').onclick = () => void go('next');

  // An annotated filter, which the chip's × can remove too: follow it.
  onlyAnnotated.checked = table.state.filters.get().some((f) => f.type === 'annotated');
  onlyAnnotated.onchange = () => {
    if (onlyAnnotated.checked) table!.actions.showAnnotatedRows();
    else table!.actions.hideAnnotatedRows();
  };
  table.on('filterChange', ({ filters }) => {
    onlyAnnotated.checked = filters.some((f) => f.type === 'annotated');
  });

  // =========================================
  // Errors — an issue list whose entries take the user to their cell with
  // revealRow. Column annotations single out no row, so it lists row and
  // cell ones. getAll() reads every annotation: rebuild the list once per
  // burst of changes, a microtask after the first.
  // =========================================
  const reveal = async (ann: RowAnnotation | CellAnnotation) => {
    try {
      const shown = await table!.actions.revealRow(
        ann.rowId,
        ann.scope === 'cell' ? ann.column : undefined,
      );
      navStatus.textContent = shown === null ? 'The filters hide that row.' : '';
    } catch (err) {
      navStatus.textContent = failure(err) ?? navStatus.textContent;
    }
  };
  let listQueued = false;
  const renderIssues = () => {
    listQueued = false;
    const errors = table!.annotations
      .getAll()
      .filter(
        (a): a is RowAnnotation | CellAnnotation => a.scope !== 'column' && a.severity === 'error',
      );
    issueList.replaceChildren(
      ...errors.slice(0, ISSUES_SHOWN).map((ann) => {
        const button = document.createElement('button');
        const where = ann.scope === 'cell' ? `${ann.column}, ` : '';
        button.textContent = `${where}__rowid__ ${ann.rowId}: ${ann.message}`;
        button.onclick = () => void reveal(ann);
        const item = document.createElement('li');
        item.append(button);
        return item;
      }),
    );
    issuesStatus.textContent =
      errors.length === 0
        ? 'No errors yet.'
        : `${Math.min(errors.length, ISSUES_SHOWN)} of ${errors.length.toLocaleString()} errors on rows and cells.`;
  };
  table.annotations.on('change', () => {
    if (listQueued) return;
    listQueued = true;
    queueMicrotask(renderIssues);
  });
  renderIssues();

  // =========================================
  // Severity filter — visual-only toggle via the AnnotationStore API.
  // Hiding a tier drops it from the error → warning → info hierarchy at
  // render time so the next-highest enabled severity paints through.
  // =========================================
  const wireFilter = (id: string, severity: AnnotationSeverity) => {
    const cb = $<HTMLInputElement>(id);
    cb.onchange = () => table!.annotations.setSeverityFilter({ [severity]: cb.checked });
  };
  wireFilter('filter-error', 'error');
  wireFilter('filter-warning', 'warning');
  wireFilter('filter-info', 'info');

  // Clear session — full wipe (annotations + filters + sort + presets + IDB),
  // then reload the dataset so the example stays interactive. The loader's
  // `CREATE OR REPLACE TABLE` handles the same-`tableName` reload of the
  // underlying DuckDB table atomically.
  $<HTMLButtonElement>('btn-clear-session').onclick = async () => {
    try {
      await table!.clearSession();
      await table!.loadData(DATA_URL, {
        sourceFormat: 'parquet',
        tableName: 'nyc_taxi_annotations',
      });
    } catch (err) {
      alert(`Clear session failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  $<HTMLButtonElement>('btn-download').onclick = () => {
    const file = table!.annotations.toJSON();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  $<HTMLButtonElement>('btn-load').onclick = () => filePicker.click();
  filePicker.addEventListener('change', async () => {
    const file = filePicker.files?.[0];
    if (!file) return;
    const text = await file.text();
    filePicker.value = '';
    try {
      const parsed = JSON.parse(text) as AnnotationFile;
      table!.annotations.loadJSON(parsed, 'replace');
    } catch (err) {
      alert(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
