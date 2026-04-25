import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  type DataTable,
  type AnnotationSeverity,
  type AnnotationFile,
  type NewAnnotation,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const container = $<HTMLElement>('table');
const filePicker = $<HTMLInputElement>('file-picker');

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    // Distinct tableName from example 10 so IndexedDB keys don't collide.
    tableName: 'nyc_taxi_annotations',
  });

  await table.loadData(DATA_URL, { sourceFormat: 'csv', tableName: 'nyc_taxi_annotations' });

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
  // then reload the dataset so the example stays interactive.
  $<HTMLButtonElement>('btn-clear-session').onclick = async () => {
    try {
      await table!.clearSession();
      await table!.bridge.query('DROP TABLE IF EXISTS "nyc_taxi_annotations"');
      await table!.loadData(DATA_URL, {
        sourceFormat: 'csv',
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
