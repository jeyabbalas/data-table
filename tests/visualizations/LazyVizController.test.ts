/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnSchema } from '@/core/types';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';
import {
  LazyVizController,
  VIZ_CREATE_MARGIN_PX,
  VIZ_FIRST_REPORT_TIMEOUT_MS,
  VIZ_KEEP_MARGIN_PX,
  type LazyVizHost,
} from '@/visualizations/LazyVizController';
import { FakeIntersectionWorld } from '../helpers/fakeIntersectionObserver';

const COLUMN_WIDTH = 100;
const VIEWPORT = 1000;

interface StubViz {
  name: string;
  destroyed: boolean;
  release: () => void;
  waitForData: () => Promise<void>;
  destroy: () => void;
}

function column(name: string): ColumnSchema {
  return { name, type: 'integer', nullable: true, originalType: 'INTEGER' };
}

/**
 * A header row of `count` columns in jsdom, a controller over it, and a
 * world that places each column `COLUMN_WIDTH` wide from the left.
 */
function setup(count: number, options: { hold?: boolean; concurrency?: number } = {}) {
  const names = Array.from({ length: count }, (_, i) => `c${i}`);
  const root = document.createElement('div');
  const containers = new Map<string, HTMLElement>();
  for (const name of names) {
    const header = document.createElement('div');
    header.setAttribute('data-column', name);
    const viz = document.createElement('div');
    header.appendChild(viz);
    root.appendChild(header);
    containers.set(name, viz);
  }
  document.body.appendChild(root);

  const world = new FakeIntersectionWorld();
  world.viewportWidth = VIEWPORT;
  world.placeRow(names, COLUMN_WIDTH);

  const live = new Map<string, StubViz>();
  const created: string[] = [];
  const events: string[] = [];
  const host: LazyVizHost = {
    createViz: vi.fn((col: ColumnSchema) => {
      let release!: () => void;
      const data = options.hold
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : Promise.resolve();
      const viz: StubViz = {
        name: col.name,
        destroyed: false,
        release: () => release?.(),
        waitForData: () => data,
        destroy: () => {
          viz.destroyed = true;
        },
      };
      created.push(col.name);
      return viz as unknown as BaseVisualization;
    }),
    getVizContainer: (name) => containers.get(name) ?? null,
    onVizCreated: (name, viz) => {
      live.set(name, viz as unknown as StubViz);
      events.push(`+${name}`);
    },
    onVizDestroyed: (name) => {
      live.delete(name);
      events.push(`-${name}`);
    },
    onError: vi.fn(),
  };
  const controller = new LazyVizController({
    host,
    getRoot: () => root,
    intersectionObserverFactory: world.factory,
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  });
  return { names, root, world, controller, host, live, created, events, containers };
}

/** Columns at least partly inside the viewport at the world's scroll offset. */
function onScreen(world: FakeIntersectionWorld, names: string[]): string[] {
  return names.filter((_, i) => {
    const left = i * COLUMN_WIDTH - world.scrollLeft;
    return left + COLUMN_WIDTH > 0 && left < world.viewportWidth;
  });
}

/** Let settled `waitForData` promises free their creation slots. */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LazyVizController', () => {
  it('creates charts only for columns within the create margin', async () => {
    const { names, world, controller, live } = setup(50);
    controller.sync(names.map(column));
    expect(live.size).toBe(0);

    world.flush();
    await drain();

    // 1000 px of viewport plus 200 px of margin: columns 0–11.
    const expected = names.slice(0, (VIEWPORT + VIZ_CREATE_MARGIN_PX) / COLUMN_WIDTH);
    expect([...live.keys()].sort()).toEqual([...expected].sort());
  });

  it('creates a chart for every column scrolled into view in small steps', async () => {
    const { names, world, controller, live } = setup(80);
    controller.sync(names.map(column));
    world.flush();
    await drain();

    // One wheel notch at a time. An observer reports a column only when it
    // crosses the observer's edge, so each column gets exactly one report
    // on the way in from each observer.
    for (let left = 0; left <= 80 * COLUMN_WIDTH - VIEWPORT; left += 30) {
      world.scrollTo(left);
      await drain();
      const missing = onScreen(world, names).filter((name) => !live.has(name));
      expect(missing, `at scrollLeft ${left}`).toEqual([]);
    }
  });

  it('keeps a chart until its column passes the keep margin', async () => {
    const { names, world, controller, live } = setup(50);
    controller.sync(names.map(column));
    world.flush();
    await drain();
    expect(live.has('c0')).toBe(true);

    // c0 spans [0, 100). Scrolled 300 px past its right edge it is outside
    // the create band but inside the keep band: kept.
    world.scrollTo(COLUMN_WIDTH + VIZ_CREATE_MARGIN_PX + 100);
    expect(live.has('c0')).toBe(true);

    // Coming back inside the create band creates nothing new for it.
    world.scrollTo(0);
    await drain();
    expect(live.get('c0')?.destroyed).toBe(false);

    // Past the keep margin it is destroyed.
    world.scrollTo(COLUMN_WIDTH + VIZ_KEEP_MARGIN_PX + 1);
    expect(live.has('c0')).toBe(false);
  });

  it('bounds charts at the width of the view plus both margins after a sweep', async () => {
    const { names, world, controller, live, created } = setup(300);
    controller.sync(names.map(column));
    world.flush();
    await drain();
    for (let left = 0; left <= 300 * COLUMN_WIDTH - VIEWPORT; left += 50) {
      world.scrollTo(left);
      await drain();
    }
    const band = VIEWPORT + 2 * VIZ_KEEP_MARGIN_PX;
    expect(live.size).toBeLessThanOrEqual(band / COLUMN_WIDTH + 2);
    expect(created.length).toBeGreaterThan(250);
  });

  it('creates at most `concurrency` charts at once and skips columns left behind', async () => {
    const { names, world, controller, live, created } = setup(100, {
      hold: true,
      concurrency: 2,
    });
    controller.sync(names.map(column));
    world.flush();
    expect(created).toEqual(['c0', 'c1']);

    // Jump far away before the first two finish: the columns still queued
    // are no longer wanted and must not be created.
    world.scrollTo(5000);
    live.get('c0')?.release();
    live.get('c1')?.release();
    for (const viz of live.values()) viz.release();
    await drain();
    expect(created.slice(0, 2)).toEqual(['c0', 'c1']);
    expect(created.slice(2).every((name) => Number(name.slice(1)) >= 48)).toBe(true);
  });

  it('settles the wave once every chart in view has its first data', async () => {
    const { names, world, controller, live } = setup(40, { hold: true, concurrency: 3 });
    controller.sync(names.map(column));
    let settled = false;
    void controller.whenWaveSettled().then(() => {
      settled = true;
    });
    world.flush();

    // Twelve columns in reach, three at a time.
    for (let round = 0; round < 4; round++) {
      await drain();
      expect(settled).toBe(false);
      for (const viz of [...live.values()]) viz.release();
      await drain();
    }
    expect(live.size).toBe(12);
    expect(settled).toBe(true);
  });

  it('does not wait for charts created by later scrolling', async () => {
    const { names, world, controller, live } = setup(40, { hold: true });
    controller.sync(names.map(column));
    world.flush();
    for (const viz of live.values()) viz.release();
    await drain();
    for (const viz of live.values()) viz.release();
    await drain();
    for (const viz of live.values()) viz.release();
    await drain();
    await controller.whenWaveSettled();

    world.scrollTo(2000);
    await drain();
    // New charts are pending; the settled wave stays settled.
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
  });

  it('destroys every chart on sync and creates the ones in view again', async () => {
    const { names, world, controller, live, events } = setup(30);
    controller.sync(names.map(column));
    world.flush();
    await drain();
    const first = new Map(live);
    events.length = 0;

    controller.sync(names.map(column));
    expect(live.size).toBe(0);
    expect([...first.values()].every((viz) => viz.destroyed)).toBe(true);

    world.flush();
    await drain();
    expect([...live.keys()].sort()).toEqual([...first.keys()].sort());
    expect(events.filter((e) => e.startsWith('-'))).toHaveLength(first.size);
  });

  it('keeps the charts of the columns kept through a sync, and creates only the others', async () => {
    const { names, world, controller, live, events } = setup(30);
    const columns = names.map(column);
    controller.sync(columns);
    world.flush();
    await drain();
    const first = new Map(live);
    expect(first.has('c3')).toBe(true);
    events.length = 0;

    // The same columns, c3 among them with a new header: every other chart
    // outlives the sync.
    controller.sync(columns, (name) => name !== 'c3');
    expect(events).toEqual(['-c3']);
    world.flush();
    await drain();
    expect(events).toEqual(['-c3', '+c3']);
    for (const [name, viz] of first) {
      if (name === 'c3') continue;
      expect(live.get(name)).toBe(viz);
      expect(viz.destroyed).toBe(false);
    }
  });

  it('keeps a column only with its schema entry, and only in the container it was built in', async () => {
    const { names, world, controller, live, containers } = setup(10);
    const columns = names.map(column);
    controller.sync(columns);
    world.flush();
    await drain();
    const before = new Map(live);

    // c1 gets a new schema entry, and c2 a new chart container.
    const moved = document.createElement('div');
    containers.get('c2')!.parentElement!.appendChild(moved);
    containers.set('c2', moved);
    controller.sync(
      columns.map((c) => (c.name === 'c1' ? column('c1') : c)),
      () => true,
    );
    expect(before.get('c1')!.destroyed).toBe(true);
    expect(before.get('c2')!.destroyed).toBe(true);
    expect(before.get('c0')!.destroyed).toBe(false);
    world.flush();
    await drain();
    expect(live.has('c1')).toBe(true);
    expect(live.has('c2')).toBe(true);
  });

  it('waits after a keeping sync for kept charts still on their first fetch, and no others', async () => {
    const { names, world, controller, live } = setup(30, { hold: true });
    const columns = names.map(column);
    controller.sync(columns);
    world.flush();
    await drain();

    // Kept while their first fetches run: the new wave waits for them, as
    // the load that started them does.
    controller.sync(columns, () => true);
    let settled = false;
    void controller.whenWaveSettled().then(() => {
      settled = true;
    });
    await drain();
    expect(settled).toBe(false);
    // Four at a time: each release lets the next ones be created.
    for (let round = 0; round < 10 && !settled; round++) {
      for (const viz of live.values()) viz.release();
      await drain();
    }
    expect(settled).toBe(true);

    // Kept once their data is in: nothing to wait for, and nothing new to
    // observe.
    controller.sync(columns, () => true);
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
    expect(world.observers.map((o) => o.observedCount)).toEqual([30, 30]);
  });

  it('drops columns removed by a sync', async () => {
    const { names, world, controller, live } = setup(10);
    controller.sync(names.map(column));
    world.flush();
    await drain();
    controller.sync(names.slice(5).map(column));
    world.flush();
    await drain();
    expect([...live.keys()].sort()).toEqual(names.slice(5).sort());
    expect(controller.hasLiveViz('c0')).toBe(false);
  });

  it('settles a superseded wave instead of leaving it pending', async () => {
    const { names, world, controller } = setup(10, { hold: true });
    controller.sync(names.map(column));
    world.flush();
    const first = controller.whenWaveSettled();
    controller.sync(names.map(column));
    await expect(first).resolves.toBeUndefined();
  });

  it('settles at once when there is nothing to observe', async () => {
    const { controller } = setup(0);
    controller.sync([]);
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
  });

  it('settles at once in a hidden document, and creates charts when shown', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { names, world, controller, live } = setup(20, { hold: true });
    controller.sync(names.map(column));
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
    expect(live.size).toBe(0);

    visibility.mockReturnValue('visible');
    world.flush();
    await drain();
    expect(live.size).toBeGreaterThan(0);
  });

  it('settles without charts when the page never renders, and creates them if it does', async () => {
    vi.useFakeTimers();
    try {
      const { names, world, controller, live } = setup(20, { hold: true });
      controller.sync(names.map(column));
      let settled = false;
      void controller.whenWaveSettled().then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(VIZ_FIRST_REPORT_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);

      world.flush();
      expect(live.size).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits past the timeout for charts the first report asked for', async () => {
    vi.useFakeTimers();
    try {
      const { names, world, controller, live } = setup(20, { hold: true });
      controller.sync(names.map(column));
      let settled = false;
      void controller.whenWaveSettled().then(() => {
        settled = true;
      });
      world.flush();
      await vi.advanceTimersByTimeAsync(VIZ_FIRST_REPORT_TIMEOUT_MS * 5);
      expect(settled).toBe(false);
      for (let round = 0; round < 4; round++) {
        for (const viz of [...live.values()]) viz.release();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates every chart during sync when no observer exists', async () => {
    const names = ['a', 'b', 'c'];
    const root = document.createElement('div');
    for (const name of names) {
      const header = document.createElement('div');
      header.setAttribute('data-column', name);
      header.appendChild(document.createElement('div'));
      root.appendChild(header);
    }
    const createViz = vi.fn(
      () =>
        ({
          waitForData: () => Promise.resolve(),
          destroy: () => {},
        }) as unknown as BaseVisualization,
    );
    const controller = new LazyVizController({
      host: {
        createViz,
        getVizContainer: (name) => root.querySelector<HTMLElement>(`[data-column="${name}"] > div`),
      },
      getRoot: () => root,
    });
    expect(typeof IntersectionObserver).toBe('undefined');
    controller.sync(names.map(column));
    expect(createViz).toHaveBeenCalledTimes(3);
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
  });

  it('reports a chart that throws while being built and carries on', async () => {
    const { names, world, controller, host, live } = setup(5);
    const create = host.createViz as ReturnType<typeof vi.fn>;
    const original = create.getMockImplementation()!;
    create.mockImplementation((col: ColumnSchema, container: HTMLElement) => {
      if (col.name === 'c1') throw new Error('boom');
      return original(col, container);
    });
    controller.sync(names.map(column));
    world.flush();
    await drain();
    expect(host.onError).toHaveBeenCalledWith(expect.any(Error), 'c1');
    expect([...live.keys()].sort()).toEqual(['c0', 'c2', 'c3', 'c4']);
    await expect(controller.whenWaveSettled()).resolves.toBeUndefined();
  });

  it('destroys every chart and disconnects on destroy', async () => {
    const { names, world, controller, live } = setup(20, { hold: true });
    controller.sync(names.map(column));
    world.flush();
    const charts = [...live.values()];
    const wave = controller.whenWaveSettled();
    controller.destroy();
    await expect(wave).resolves.toBeUndefined();
    expect(charts.every((viz) => viz.destroyed)).toBe(true);
    expect(world.observers.every((o) => o.observedCount === 0)).toBe(true);

    world.scrollTo(500);
    expect(live.size).toBe(0);
  });
});
