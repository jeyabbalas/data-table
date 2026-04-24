import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  type DataTable,
  type AnnotationSeverity,
  type AnnotationFile,
  type AnnotationChangePayload,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const container = $<HTMLElement>('table');
const sevSelect = $<HTMLSelectElement>('sev');
const countEl = $<HTMLElement>('count');
const viewerEl = $<HTMLElement>('viewer');
const logEl = $<HTMLElement>('log');
const filePicker = $<HTMLInputElement>('file-picker');

let table: DataTable | undefined;
const recentEvents: string[] = [];

(async () => {
  table = await createDataTable({
    container,
    // Distinct tableName from example 10 so IndexedDB keys don't collide.
    tableName: 'nyc_taxi_annotations',
  });

  await table.loadData(DATA_URL, { sourceFormat: 'csv', tableName: 'nyc_taxi_annotations' });

  // Any annotation change → refresh viewer + event log + count.
  table.annotations.on('change', (payload) => {
    appendEvent(payload);
    refreshViewer();
  });
  refreshViewer();

  // Setup — Add row
  $<HTMLButtonElement>('btn-row').onclick = () => {
    table!.annotations.add({
      scope: 'row',
      rowId: 5,
      severity: currentSeverity(),
      message: `Row annotation at rowId 5 (${currentSeverity()})`,
    });
  };

  // Setup — Add column
  $<HTMLButtonElement>('btn-col').onclick = () => {
    table!.annotations.add({
      scope: 'column',
      column: 'fare_amount',
      severity: currentSeverity(),
      message: `Column annotation on fare_amount (${currentSeverity()})`,
    });
  };

  // Setup — Add cell
  $<HTMLButtonElement>('btn-cell').onclick = () => {
    table!.annotations.add({
      scope: 'cell',
      rowId: 3,
      column: 'fare_amount',
      severity: currentSeverity(),
      message: `Cell annotation at (3, fare_amount) (${currentSeverity()})`,
    });
  };

  // Setup — Add 100 random
  $<HTMLButtonElement>('btn-many').onclick = () => {
    const totalRows = table!.state.totalRows.get();
    const columns = table!.state.schema
      .get()
      .filter((c) => c.system !== true)
      .map((c) => c.name);
    const severities: AnnotationSeverity[] = ['error', 'warning', 'info'];
    const scopes: Array<'row' | 'column' | 'cell'> = ['row', 'column', 'cell'];
    const batch = Array.from({ length: 100 }, (_, i) => {
      const scope = scopes[Math.floor(Math.random() * scopes.length)];
      const severity = severities[Math.floor(Math.random() * severities.length)];
      const rowId = Math.floor(Math.random() * Math.max(1, totalRows));
      const column = columns[Math.floor(Math.random() * columns.length)];
      const message = `Random #${i + 1} (${scope}, ${severity})`;
      if (scope === 'row') return { scope, rowId, severity, message } as const;
      if (scope === 'column') return { scope, column, severity, message } as const;
      return { scope, rowId, column, severity, message } as const;
    });
    table!.annotations.addMany(batch);
  };

  // Setup — Clear
  $<HTMLButtonElement>('btn-clear').onclick = () => {
    table!.annotations.clear('all');
  };

  // Clear session — full wipe (annotations + filters + sort + presets + IDB),
  // then reload the dataset so the example stays interactive. `clearSession`
  // resets JS state only; the DuckDB table survives, so drop it explicitly
  // before the second loadData or `CREATE TABLE` throws "already exists".
  $<HTMLButtonElement>('btn-clear-session').onclick = async () => {
    try {
      await table!.clearSession();
      await table!.bridge.query('DROP TABLE IF EXISTS "nyc_taxi_annotations"');
      await table!.loadData(DATA_URL, {
        sourceFormat: 'csv',
        tableName: 'nyc_taxi_annotations',
      });
    } catch (err) {
      logEl.textContent = `Clear session failed: ${err instanceof Error ? err.message : String(err)}\n\n${logEl.textContent}`;
    }
  };

  // Download JSON
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

  // Load JSON
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
      logEl.textContent = `Load failed: ${err instanceof Error ? err.message : String(err)}\n\n${logEl.textContent}`;
    }
  });
})();

function currentSeverity(): AnnotationSeverity {
  return sevSelect.value as AnnotationSeverity;
}

function refreshViewer(): void {
  if (!table) return;
  countEl.textContent = String(table.annotations.count());
  const file = table.annotations.toJSON();
  const json = JSON.stringify(file, null, 2);
  viewerEl.textContent = json.length > 4000 ? `${json.slice(0, 4000)}\n… (truncated)` : json;
}

function appendEvent(payload: AnnotationChangePayload): void {
  const line = `${new Date().toLocaleTimeString()} — ${payload.kind} (${payload.ids.length} id${payload.ids.length === 1 ? '' : 's'})`;
  recentEvents.unshift(line);
  while (recentEvents.length > 20) recentEvents.pop();
  logEl.textContent = recentEvents.join('\n');
}

window.addEventListener('beforeunload', () => void table?.destroy());
