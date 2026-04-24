import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  type DataTable,
  type AnnotationSeverity,
  type AnnotationFile,
  type AnnotationChangePayload,
  type NewAnnotation,
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
const intersectionEl = $<HTMLElement>('intersection');

let table: DataTable | undefined;
const recentEvents: string[] = [];

(async () => {
  table = await createDataTable({
    container,
    // Distinct tableName from example 10 so IndexedDB keys don't collide.
    tableName: 'nyc_taxi_annotations',
  });

  await table.loadData(DATA_URL, { sourceFormat: 'csv', tableName: 'nyc_taxi_annotations' });

  // Any annotation change → refresh viewer + event log + count + intersections.
  table.annotations.on('change', (payload) => {
    appendEvent(payload);
    refreshViewer();
    refreshIntersections();
  });
  refreshViewer();

  // Scroll within the body triggers intersection refresh too so users see
  // the panel update as new annotated cells enter / leave the viewport.
  const bodyScroll = container.querySelector('.dt-body-scroll');
  bodyScroll?.addEventListener('scroll', refreshIntersections, { passive: true });
  // Initial paint once the first data has loaded. requestAnimationFrame
  // defers past the initial render's DOM work so the DOM queries find the
  // rendered rows.
  requestAnimationFrame(() => refreshIntersections());

  // =========================================
  // Setup — Add
  // =========================================
  $<HTMLButtonElement>('btn-row').onclick = () => {
    table!.annotations.add({
      scope: 'row',
      rowId: 5,
      severity: currentSeverity(),
      message: `Row annotation at rowId 5 (${currentSeverity()})`,
    });
  };

  $<HTMLButtonElement>('btn-col').onclick = () => {
    table!.annotations.add({
      scope: 'column',
      column: 'fare_amount',
      severity: currentSeverity(),
      message: `Column annotation on fare_amount (${currentSeverity()})`,
    });
  };

  $<HTMLButtonElement>('btn-cell').onclick = () => {
    table!.annotations.add({
      scope: 'cell',
      rowId: 3,
      column: 'fare_amount',
      severity: currentSeverity(),
      message: `Cell annotation at (3, fare_amount) (${currentSeverity()})`,
    });
  };

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

  $<HTMLButtonElement>('btn-clear').onclick = () => {
    table!.annotations.clear('all');
  };

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

  // =========================================
  // Severity filter — toggles visual opt-out via data attributes on .dt-root
  // =========================================
  const root = container.querySelector('.dt-root') as HTMLElement | null;
  const wireFilter = (id: string, severity: 'error' | 'warning' | 'info') => {
    const cb = $<HTMLInputElement>(id);
    cb.onchange = () => {
      if (!root) return;
      if (cb.checked) {
        root.removeAttribute(`data-dt-ann-filter-${severity}`);
      } else {
        root.setAttribute(`data-dt-ann-filter-${severity}`, 'off');
      }
    };
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
      logEl.textContent = `Clear session failed: ${err instanceof Error ? err.message : String(err)}\n\n${logEl.textContent}`;
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

/**
 * Walk the currently-rendered rows, read the `data-row-id` + `data-column`
 * attributes off every annotated cell, and render one list item per
 * intersection with a truncated preview of each message. Runs on scroll and
 * on every annotation change.
 */
function refreshIntersections(): void {
  if (!table) return;
  const annotatedCells = container.querySelectorAll<HTMLElement>(
    '.dt-cell--annotated, .dt-cell--col-annotated, .dt-cell--row-annotated',
  );
  if (annotatedCells.length === 0) {
    intersectionEl.innerHTML = '<li>(no annotated cells in view)</li>';
    return;
  }
  const items: string[] = [];
  const seen = new Set<string>();
  for (const cell of annotatedCells) {
    const rowEl = cell.parentElement;
    const rowIdStr = rowEl?.getAttribute('data-row-id');
    const col = cell.getAttribute('data-column');
    if (!rowIdStr || !col) continue;
    const key = `${rowIdStr}|${col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rowId = Number(rowIdStr);
    const anns = table.annotations.getByCell(rowId, col);
    if (anns.length === 0) continue;
    const msgs = anns.map((a) => {
      const trimmed = a.message.length > 80 ? a.message.slice(0, 77) + '…' : a.message;
      return `${a.severity}: ${escapeHtml(trimmed)}`;
    });
    items.push(
      `<li><code>(${rowId}, ${escapeHtml(col)})</code> → ${msgs.join(' · ')}</li>`,
    );
  }
  intersectionEl.innerHTML = items.join('') || '<li>(no annotated cells in view)</li>';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendEvent(payload: AnnotationChangePayload): void {
  const line = `${new Date().toLocaleTimeString()} — ${payload.kind} (${payload.ids.length} id${payload.ids.length === 1 ? '' : 's'})`;
  recentEvents.unshift(line);
  while (recentEvents.length > 20) recentEvents.pop();
  logEl.textContent = recentEvents.join('\n');
}

window.addEventListener('beforeunload', () => void table?.destroy());
