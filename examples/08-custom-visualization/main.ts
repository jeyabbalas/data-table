import '@jeyabbalas/data-table/styles';
import {
  createDataTable,
  filtersToWhereClause,
  VisualizationRegistry,
  type DataTable,
} from '@jeyabbalas/data-table';
import {
  BaseVisualization,
  type VisualizationOptions,
} from '@jeyabbalas/data-table/advanced';
import type { ColumnSchema } from '@jeyabbalas/data-table';
import * as Plot from '@observablehq/plot';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

const DATA_URL = 'https://raw.githubusercontent.com/jeyabbalas/data-table/refs/heads/main/tests/fixtures/datasets/csv/us_customer_orders.csv';
const TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// USPS 2-letter → FIPS string, needed to join customer rows against us-atlas
// features (whose `id` is the FIPS code).
const ABBR_TO_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08',
  CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15',
  ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21',
  LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27',
  MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39',
  OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53',
  WV: '54', WI: '55', WY: '56', PR: '72',
};

// Module-level cache: multiple StateChoropleth instances share a single fetch.
let statesPromise: Promise<FeatureCollection<Geometry>> | null = null;
function loadStates(): Promise<FeatureCollection<Geometry>> {
  if (!statesPromise) {
    statesPromise = fetch(TOPOJSON_URL)
      .then((r) => r.json() as Promise<Topology>)
      .then((topo) => feature(topo, topo.objects.states as GeometryCollection));
  }
  return statesPromise;
}

/**
 * StateChoropleth — a US-states map shaded by frequency of occurrence.
 *
 * Demonstrates the **canvas-escape pattern** for custom visualizations:
 * `BaseVisualization` always creates a `<canvas>` in the container, so we
 * can't opt out — we simply hide it and append an SVG sibling (rendered by
 * Observable Plot). `destroy()` must be overridden to clean up the SVG.
 *
 * No interactions are wired; the six abstract handlers stay as no-ops.
 */
class StateChoropleth extends BaseVisualization {
  private svg: Element | null = null;
  private counts = new Map<string, number>(); // keyed by FIPS string
  private states: FeatureCollection<Geometry> | null = null;

  constructor(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    super(container, column, options);
    // Hide the forced canvas; we render into an SVG sibling.
    this.canvas.style.display = 'none';
    void this.fetchData();
  }

  async fetchData(): Promise<void> {
    if (this.destroyed) return;
    const col = this.column.name;

    // Compose active filters into the WHERE clause so the choropleth
    // rescopes whenever the user filters elsewhere in the table. The base
    // class already calls `fetchData()` on every filter change; we just
    // need to consult `this.options.filters` here.
    const notNull = `"${col}" IS NOT NULL AND "${col}" <> ''`;
    const filterWhere = filtersToWhereClause(this.options.filters);
    const where = filterWhere ? `${notNull} AND (${filterWhere})` : notNull;

    const [rows, states] = await Promise.all([
      this.options.bridge.query<{ state: string; n: number }>(
        `SELECT "${col}" AS state, COUNT(*) AS n
         FROM "${this.options.tableName}"
         WHERE ${where}
         GROUP BY 1`,
      ),
      loadStates(),
    ]);
    if (this.destroyed) return;
    this.counts = new Map(
      rows
        .map((r): [string, number] => [
          ABBR_TO_FIPS[String(r.state).toUpperCase()] ?? '',
          Number(r.n),
        ])
        .filter(([k]) => k.length > 0),
    );
    this.states = states;
    this.render();
  }

  render(): void {
    if (!this.states) return;

    const scope = this.canvas.closest('.dt-root') as HTMLElement | null;
    const primary =
      (scope && getComputedStyle(scope).getPropertyValue('--dt-primary').trim()) ||
      '#2563eb';
    const surface =
      (scope && getComputedStyle(scope).getPropertyValue('--dt-bg').trim()) ||
      '#fafafa';

    const max = Math.max(1, ...this.counts.values());

    const chart = Plot.plot({
      width: this.width,
      height: this.height,
      margin: 0,
      projection: { type: 'albers-usa', inset: 2 },
      color: {
        type: 'linear',
        domain: [0, max],
        range: [surface, primary],
        unknown: '#e7e5e4',
      },
      marks: [
        Plot.geo(this.states.features as Feature<Geometry>[], {
          fill: (d) => this.counts.get(String((d as Feature).id ?? '')) ?? 0,
          stroke: '#fff',
          strokeWidth: 0.3,
          title: (d) => {
            const f = d as Feature & { properties?: { name?: string } };
            const n = this.counts.get(String(f.id ?? '')) ?? 0;
            return `${f.properties?.name ?? ''}: ${n}`;
          },
        }),
      ],
    });

    // Replace any prior SVG; do NOT clear the container (that would kill
    // the hidden canvas and break BaseVisualization's lifecycle).
    if (this.svg?.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.svg = chart;
    this.container.appendChild(chart);
  }

  destroy(): void {
    if (this.svg?.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.svg = null;
    super.destroy();
  }

  // No interactions for this demo; handlers must exist as no-ops or
  // TypeScript refuses to compile (abstract in BaseVisualization).
  protected handleMouseMove(): void {}
  protected handleClick(): void {}
  protected handleMouseLeave(): void {}
  protected handleMouseDown(): void {}
  protected handleMouseUp(): void {}
  protected handleKeyDown(): void {}
}

/**
 * Column-scoped registry override: the built-in `isApplicable(type)` hook
 * can't see column names, so we subclass and override `create()` directly.
 * Only the `state` column gets the choropleth; all other columns — numeric,
 * date, category — fall through to their default visualization.
 */
class StateAwareRegistry extends VisualizationRegistry {
  create(container: HTMLElement, column: ColumnSchema, options: VisualizationOptions) {
    if (column.name === 'state') {
      return new StateChoropleth(container, column, options);
    }
    return super.create(container, column, options);
  }
}

const container = document.getElementById('table') as HTMLElement;
const registry = new StateAwareRegistry();

let table: DataTable | undefined;
(async () => {
  table = await createDataTable({
    container,
    tableName: 'orders',
    visualizationRegistry: registry,
  });
  await table.loadData(DATA_URL, { sourceFormat: 'csv' });
})();

window.addEventListener('beforeunload', () => void table?.destroy());
