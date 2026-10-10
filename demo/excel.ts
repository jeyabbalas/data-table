/**
 * Excel workbooks in the demo: telling a workbook from a dataset, the sheet
 * picker, and the chosen sheet's conversion, which runs in a worker
 * (`excel.worker.ts`). SheetJS loads with that worker, the first time a
 * workbook is opened, so the page itself never downloads it.
 *
 * Demo-only: the library loads CSV, JSON and Parquet, and nothing here is
 * part of it.
 */

import type { ExcelRequest, ExcelResponse, SheetSummary } from './excel.worker';

export type { SheetSummary };

const WORKBOOK_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods']);

const WORKBOOK_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a file is a workbook: by its extension, else by its media type,
 * else by its first bytes, a ZIP (xlsx, xlsm, xlsb, ods) or an OLE2 compound
 * file (xls). `knownExtension` says the name ends in a dataset's extension,
 * which settles it: Windows gives a .csv file Excel's media type.
 */
export async function isWorkbook(
  blob: Blob,
  name: string,
  contentType = '',
  knownExtension = false,
): Promise<boolean> {
  if (WORKBOOK_EXTENSIONS.has(extensionOf(name))) return true;
  if (knownExtension) return false;
  if (WORKBOOK_TYPES.some((type) => contentType.toLowerCase().startsWith(type))) return true;
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const zip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => head[i] === b);
  return zip || ole;
}

/** An open workbook, parsed in its own worker until {@link Workbook.close}. */
export class Workbook {
  private constructor(
    private readonly worker: Worker,
    readonly sheets: SheetSummary[],
  ) {}

  /** Parse `file` and list its sheets that hold data. */
  static async open(file: Blob): Promise<Workbook> {
    const worker = new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' });
    try {
      const reply = await ask(worker, { type: 'open', file });
      if (reply.type !== 'sheets') throw new Error('The workbook reader answered out of turn');
      return new Workbook(worker, reply.sheets);
    } catch (err) {
      worker.terminate();
      throw err;
    }
  }

  /** The sheet named `sheet` as NDJSON, one object per row. */
  async convert(sheet: string): Promise<{ blob: Blob; rows: number; columns: number }> {
    const reply = await ask(this.worker, { type: 'convert', sheet });
    if (reply.type !== 'converted') throw new Error('The workbook reader answered out of turn');
    return reply;
  }

  close(): void {
    this.worker.terminate();
  }
}

/** Send one request and wait for its answer: the worker answers in order. */
function ask(worker: Worker, request: ExcelRequest): Promise<ExcelResponse> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ExcelResponse>) => {
      if (event.data.type === 'error') reject(new Error(event.data.message));
      else resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      reject(new Error(event.message || 'The workbook could not be read'));
    };
    worker.postMessage(request);
  });
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Ask which sheet to load, in the page's sheet picker. Resolves with the
 * sheet's name, or `null` when the picker is dismissed.
 */
export function pickSheet(fileName: string, sheets: SheetSummary[]): Promise<string | null> {
  const dialog = document.getElementById('sheet-dialog') as HTMLDialogElement;
  const list = document.getElementById('sheet-list')!;
  const text = document.getElementById('sheet-dialog-text')!;

  const name = document.createElement('strong');
  name.textContent = fileName;
  text.replaceChildren(name, ` has ${sheets.length} sheets with data. Pick the one to load.`);

  list.replaceChildren(
    ...sheets.map((sheet, index) => {
      const option = document.createElement('label');
      option.className = 'sheet-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'sheet';
      radio.value = String(index);
      radio.checked = index === 0;
      const title = document.createElement('span');
      title.className = 'sheet-name';
      title.textContent = sheet.name;
      const size = document.createElement('span');
      size.className = 'sheet-size';
      size.textContent =
        `${count(sheet.rows, 'row')} × ${count(sheet.columns, 'column')}` +
        (sheet.hidden ? ' · hidden' : '');
      const columns = document.createElement('span');
      columns.className = 'sheet-columns';
      columns.textContent = sheet.names.join(', ');
      // The spaces keep the parts apart in the radio's name; the grid
      // ignores them.
      option.append(radio, title, ' ', size, ' ', columns);
      return option;
    }),
  );

  return new Promise((resolve) => {
    const chosen = (): string | null => {
      const radio = list.querySelector<HTMLInputElement>('input[name="sheet"]:checked');
      return radio ? (sheets[Number(radio.value)]?.name ?? null) : null;
    };
    // Enter loads the sheet under the focus; a radio does not submit a form.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.target as Element).matches('input[name="sheet"]')) {
        event.preventDefault();
        dialog.close('load');
      }
    };
    const onDoubleClick = (event: MouseEvent) => {
      if ((event.target as Element).closest('.sheet-option')) dialog.close('load');
    };
    dialog.addEventListener('keydown', onKeyDown);
    list.addEventListener('dblclick', onDoubleClick);
    dialog.addEventListener(
      'close',
      () => {
        dialog.removeEventListener('keydown', onKeyDown);
        list.removeEventListener('dblclick', onDoubleClick);
        resolve(dialog.returnValue === 'load' ? chosen() : null);
      },
      { once: true },
    );
    dialog.returnValue = '';
    dialog.showModal();
    list.querySelector<HTMLInputElement>('input:checked')?.focus();
  });
}
