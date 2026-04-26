import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  ROWID_COLUMN,
  type DataTable,
  type GetColumnValuesOptions,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const container = $<HTMLElement>('table');
const colSelect = $<HTMLSelectElement>('col');
const scopeSelect = $<HTMLSelectElement>('scope');
const limitInput = $<HTMLInputElement>('limit');
const offsetInput = $<HTMLInputElement>('offset');
const showRowidCb = $<HTMLInputElement>('show-rowid');
const resultEl = $<HTMLElement>('result');

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'nyc_taxi',
    persistence: false,
  });

  table.on('loadComplete', () => {
    populateColumnDropdown();
  });

  await table.loadData(DATA_URL, { sourceFormat: 'parquet', tableName: 'nyc_taxi' });

  // __rowid__ is hidden by default. Toggle its visibility in the grid.
  showRowidCb.checked = table.state.visibleColumns.get().includes(ROWID_COLUMN);
  showRowidCb.addEventListener('change', () => {
    if (showRowidCb.checked) {
      table!.actions.showColumn(ROWID_COLUMN);
    } else {
      table!.actions.hideColumn(ROWID_COLUMN);
    }
  });

  $<HTMLButtonElement>('btn-filter').onclick = () => {
    // Open upper bound is expressed as Infinity (see FilterSQL open-bound
    // detection). `minExclusive: true` makes the lower bound strict (>).
    table!.actions.addFilter({
      column: 'fare_amount',
      type: 'range',
      min: 20,
      max: Infinity,
      minExclusive: true,
    });
  };

  $<HTMLButtonElement>('btn-clear').onclick = () => {
    table!.actions.clearFilters();
  };

  $<HTMLButtonElement>('btn-fetch').onclick = async () => {
    await runFetch();
  };
})();

function populateColumnDropdown(): void {
  if (!table) return;
  const schema = table.state.schema.get();
  colSelect.innerHTML = '';
  // Include __rowid__ so reviewers can fetch it even when it's hidden in
  // the grid; flag system columns so they are easy to recognize.
  for (const col of schema) {
    const option = document.createElement('option');
    option.value = col.name;
    option.textContent = col.system ? `${col.name} (system)` : col.name;
    colSelect.appendChild(option);
  }
}

async function runFetch(): Promise<void> {
  if (!table) return;
  const name = colSelect.value;
  const scope = scopeSelect.value as GetColumnValuesOptions['scope'];
  const limit = parseIntOrUndefined(limitInput.value);
  const offset = parseIntOrUndefined(offsetInput.value);

  if (scope === 'selected' && table.state.selectedRows.get().size === 0) {
    resultEl.textContent =
      'Scope is "selected" but no rows are selected.\n' +
      'Click a row in the grid (Shift+click for a range) and try again.';
    return;
  }

  try {
    const t0 = performance.now();
    const values = await table.actions.getColumnValues(name, { scope, limit, offset });
    const elapsed = (performance.now() - t0).toFixed(1);
    const asArray = Array.from(values as ArrayLike<unknown>);
    const preview = asArray.slice(0, 50).map(stringifyCell).join(', ');
    const ctor = values?.constructor?.name ?? typeof values;
    resultEl.textContent =
      `Return: ${ctor}\n` +
      `Length: ${asArray.length.toLocaleString()}\n` +
      `Time:   ${elapsed} ms\n` +
      `Scope:  ${scope ?? 'all'}\n` +
      `Column: ${name}\n\n` +
      `First 50:\n${preview}`;
  } catch (err) {
    resultEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function parseIntOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function stringifyCell(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint') return `${v.toString()}n`;
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

window.addEventListener('beforeunload', () => void table?.destroy());
