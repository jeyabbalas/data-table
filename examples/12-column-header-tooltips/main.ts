import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  type DataTable,
  type ColumnHeaderTooltipContent,
} from '@jeyabbalas/data-table';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/nyc_taxi.csv';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const container = $<HTMLElement>('table');

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'nyc_taxi_tooltips',
    // Stateless demo. Reload wipes every tooltip; nothing is written to
    // IndexedDB. Recommended pattern for apps that already own column
    // metadata (JSON Schema, registry) and apply it at startup.
    persistence: false,
  });

  await table.loadData(DATA_URL, {
    sourceFormat: 'csv',
    tableName: 'nyc_taxi_tooltips',
  });

  // JSON-Schema-style metadata catalogue. The "Set all" button walks this
  // record once — the same shape an embedding app would use to apply
  // column metadata at mount time.
  const ALL_TOOLTIPS: Record<string, ColumnHeaderTooltipContent> = {
    total_amount: {
      title: 'Total fare paid (USD)',
      description:
        'Sum of fare, surcharge, MTA tax, tip, and tolls.\n' +
        'Equals the credit-card receipt amount for card-paying riders.',
      items: [
        { label: 'Units', value: 'USD' },
        {
          label: 'Components',
          value: ['fare', 'surcharge', 'mta_tax', 'tip', 'tolls'],
        },
      ],
    },
    fare_amount: {
      title: 'Metered fare',
      description: 'Metered fare component, before surcharges and tip.',
      items: [
        { label: 'Units', value: 'USD' },
        { label: 'Type', value: 'numeric (2 decimals)' },
      ],
    },
    passenger_count: {
      title: 'Passenger count',
      description: 'Number of passengers reported by the driver at trip start.',
      items: [
        { label: 'Type', value: 'integer' },
        { label: 'Range', value: '0 to 9' },
        {
          label: 'Notes',
          value: 'A value of 0 typically indicates missing or unentered data.',
        },
      ],
    },
    payment_type: {
      title: 'Payment method',
      description: 'How the rider paid for the trip.',
      items: [
        {
          label: 'Allowed values',
          value: ['Credit card', 'Cash', 'No charge', 'Dispute', 'Unknown'],
        },
        { label: 'Source', value: 'TLC trip-record schema v1.0' },
      ],
    },
    tpep_pickup_datetime: {
      title: 'Pickup timestamp',
      description: 'Local civil time the meter started, as recorded by the TPEP device.',
      items: [
        { label: 'Type', value: 'TIMESTAMP' },
        { label: 'Timezone', value: 'America/New_York (local)' },
      ],
    },
  };

  // =========================================
  // One-click setup — the realistic harmonization-app workflow
  // =========================================
  $<HTMLButtonElement>('btn-set-all').onclick = () => {
    for (const [col, content] of Object.entries(ALL_TOOLTIPS)) {
      table!.actions.setColumnHeaderTooltip(col, content);
    }
  };

  // =========================================
  // Per-column shape demos — each focuses on one variant
  // =========================================
  $<HTMLButtonElement>('btn-rich-total').onclick = () => {
    table!.actions.setColumnHeaderTooltip('total_amount', ALL_TOOLTIPS.total_amount);
  };

  $<HTMLButtonElement>('btn-enum-payment').onclick = () => {
    table!.actions.setColumnHeaderTooltip('payment_type', ALL_TOOLTIPS.payment_type);
  };

  $<HTMLButtonElement>('btn-string-fare').onclick = () => {
    table!.actions.setColumnHeaderTooltip(
      'fare_amount',
      'Metered fare component, before surcharges and tip.',
    );
  };

  // =========================================
  // Clear — pass null to remove an override
  // =========================================
  $<HTMLButtonElement>('btn-clear').onclick = () => {
    for (const col of Object.keys(ALL_TOOLTIPS)) {
      table!.actions.setColumnHeaderTooltip(col, null);
    }
  };

  // =========================================
  // XSS-safety demo — every string here would be dangerous if interpolated
  // as HTML. The popover renders them via .textContent, so no alert fires
  // and no <img>/<script>/<iframe>/<svg> nodes are created.
  // =========================================
  $<HTMLButtonElement>('btn-xss').onclick = () => {
    table!.actions.setColumnHeaderTooltip('passenger_count', {
      title: '<img src=x onerror=alert(1)>',
      description: '<script>alert("description")</script>',
      items: [
        { label: '<b>label-html</b>', value: '<i>value-html</i>' },
        { label: 'enum-html', value: ['<svg/>', '<iframe>'] },
      ],
    });
  };
})();

window.addEventListener('beforeunload', () => void table?.destroy());
