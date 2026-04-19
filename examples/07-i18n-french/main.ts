import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

const DATA_URL = 'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/csv/vins_de_france.csv';

const container = document.getElementById('table') as HTMLElement;

let table: DataTable | undefined;

(async () => {
  table = await createDataTable({
    container,
    tableName: 'vins',
    messages: {
      common: {
        close: 'Fermer',
        cancel: 'Annuler',
        apply: 'Appliquer',
        confirm: 'Confirmer',
      },
      filters: {
        panelTitle: 'Filtres',
        clearButton: 'Effacer',
        clearAllButton: 'Tout effacer',
        applyButton: 'Appliquer',
        activeFiltersLabel: 'Filtres actifs',
        expressionFilterLabel: 'Expression SQL',
      },
      export: {
        title: 'Exporter',
        downloadButton: 'Télécharger',
        copyButton: 'Copier',
      },
      presets: {
        title: 'Préréglages',
        saveButton: 'Enregistrer',
        loadButton: 'Charger',
      },
    },
  });
  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
