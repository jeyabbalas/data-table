/**
 * VisualizationRegistry — per-instance isolation tests (Phase 3)
 *
 * Proves that two registries do not leak custom registrations into each
 * other and that the deprecated static `VisualizationFactory` wrapper
 * forwards to the shared `defaultVisualizationRegistry`.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// BaseVisualization allocates a canvas + 2D context eagerly; JSDOM
// doesn't implement getContext, so stub it for the create-path test.
const mockCanvasContext = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setTransform: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
};
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCanvasContext);

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Visualization data-fetchers issue DuckDB queries; stub them so the
// registry's `create()` path can run without a real worker.
vi.mock('../../src/data/WorkerBridge', () => ({
  WorkerBridge: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  })),
}));

import {
  VisualizationRegistry,
  defaultVisualizationRegistry,
} from '../../src/visualizations/VisualizationRegistry';
import { VisualizationFactory } from '../../src/visualizations/VisualizationFactory';
import { BaseVisualization } from '../../src/visualizations/BaseVisualization';
import type { ColumnSchema, DataType } from '../../src/core/types';
import type { VisualizationOptions } from '../../src/visualizations/BaseVisualization';

function makeColumn(type: DataType, name = 'col'): ColumnSchema {
  return { name, type, nullable: true, originalType: type.toUpperCase() };
}

function makeOptions(): VisualizationOptions {
  return {
    tableName: 't',
    bridge: {
      query: vi.fn().mockResolvedValue([]),
      initialize: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
    } as unknown as VisualizationOptions['bridge'],
    filters: [],
  };
}

class FakeViz extends BaseVisualization {
  async fetchData() {}
  render() {}
  protected handleMouseMove() {}
  protected handleClick() {}
  protected handleMouseLeave() {}
  protected handleMouseDown() {}
  protected handleMouseUp() {}
  protected handleKeyDown() {}
}

describe('VisualizationRegistry (Phase 3)', () => {
  beforeEach(() => {
    // Suppress deprecation warn from static wrapper calls.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    defaultVisualizationRegistry.resetToDefaults();
  });

  it('seeds the 5 built-in registrations on construction', () => {
    const reg = new VisualizationRegistry();
    const types = reg.getRegisteredTypes();
    expect(types).toContain('histogram');
    expect(types).toContain('date-histogram');
    expect(types).toContain('time-histogram');
    expect(types).toContain('interval-histogram');
    expect(types).toContain('value-counts');
    expect(types).toHaveLength(5);
  });

  it('isolates custom registrations between two registries', () => {
    const a = new VisualizationRegistry();
    const b = new VisualizationRegistry();

    a.register({
      name: 'custom-a',
      isApplicable: (t) => t === 'integer',
      constructor: FakeViz,
      priority: 10,
    });

    expect(a.getRegisteredTypes()).toContain('custom-a');
    expect(b.getRegisteredTypes()).not.toContain('custom-a');
  });

  it('isolates unregister calls between registries', () => {
    const a = new VisualizationRegistry();
    const b = new VisualizationRegistry();

    expect(a.unregister('histogram')).toBe(true);
    expect(a.getRegisteredTypes()).not.toContain('histogram');
    expect(b.getRegisteredTypes()).toContain('histogram');
  });

  it('resetToDefaults on one instance does not affect another', () => {
    const a = new VisualizationRegistry();
    const b = new VisualizationRegistry();

    a.register({
      name: 'custom-a',
      isApplicable: () => true,
      constructor: FakeViz,
      priority: 0,
    });
    b.register({
      name: 'custom-b',
      isApplicable: () => true,
      constructor: FakeViz,
      priority: 0,
    });

    a.resetToDefaults();

    expect(a.getRegisteredTypes()).not.toContain('custom-a');
    expect(b.getRegisteredTypes()).toContain('custom-b');
  });

  it('priority override picks the higher-priority registration', () => {
    const reg = new VisualizationRegistry();
    reg.register({
      name: 'custom-integer',
      isApplicable: (t) => t === 'integer',
      constructor: FakeViz,
      priority: 10,
    });

    const container = document.createElement('div');
    const viz = reg.create(container, makeColumn('integer'), makeOptions());
    expect(viz).toBeInstanceOf(FakeViz);
  });

  it('isApplicable returns false when no registration matches', () => {
    const reg = new VisualizationRegistry();
    // Start from an empty registry to exercise the negative path.
    for (const name of reg.getRegisteredTypes()) reg.unregister(name);
    expect(reg.isApplicable(makeColumn('integer'))).toBe(false);
  });

  // ---- Phase 6 additions: tie-break determinism, fall-through, sync contract ----

  it('priority tie-break: among registrations with identical priority, earliest-registered wins (stable sort)', () => {
    class FirstViz extends FakeViz {}
    class SecondViz extends FakeViz {}
    class ThirdViz extends FakeViz {}

    const reg = new VisualizationRegistry();
    // Empty out built-ins so only our three registrations matter.
    for (const name of reg.getRegisteredTypes()) reg.unregister(name);

    reg.register({
      name: 'first',
      isApplicable: (t) => t === 'integer',
      constructor: FirstViz,
      priority: 5,
    });
    reg.register({
      name: 'second',
      isApplicable: (t) => t === 'integer',
      constructor: SecondViz,
      priority: 5,
    });
    reg.register({
      name: 'third',
      isApplicable: (t) => t === 'integer',
      constructor: ThirdViz,
      priority: 5,
    });

    const container = document.createElement('div');
    const viz = reg.create(container, makeColumn('integer'), makeOptions());
    // Stable sort preserves insertion order among ties → FirstViz wins.
    expect(viz).toBeInstanceOf(FirstViz);
  });

  it('higher-priority later registration beats earlier lower-priority one', () => {
    class LowViz extends FakeViz {}
    class HighViz extends FakeViz {}
    const reg = new VisualizationRegistry();
    for (const name of reg.getRegisteredTypes()) reg.unregister(name);

    reg.register({
      name: 'low',
      isApplicable: (t) => t === 'integer',
      constructor: LowViz,
      priority: 1,
    });
    reg.register({
      name: 'high',
      isApplicable: (t) => t === 'integer',
      constructor: HighViz,
      priority: 10,
    });

    const container = document.createElement('div');
    const viz = reg.create(container, makeColumn('integer'), makeOptions());
    expect(viz).toBeInstanceOf(HighViz);
  });

  it('create() returns null when every registration rejects the column (full fall-through)', () => {
    const reg = new VisualizationRegistry();
    for (const name of reg.getRegisteredTypes()) reg.unregister(name);
    reg.register({
      name: 'never',
      isApplicable: () => false,
      constructor: FakeViz,
      priority: 100,
    });

    const container = document.createElement('div');
    const viz = reg.create(container, makeColumn('integer'), makeOptions());
    // Returning null is the contract; the facade then renders a
    // PlaceholderVisualization in the column header.
    expect(viz).toBeNull();
  });

  it('isApplicable contract is sync: a Promise-returning predicate is treated as truthy and matches every column', () => {
    // Documents current behavior: the registry does NOT await isApplicable.
    // A Promise object is truthy, so a Promise-returning predicate matches
    // every column. Custom registrants must keep isApplicable synchronous.
    class AsyncViz extends FakeViz {}
    const reg = new VisualizationRegistry();
    for (const name of reg.getRegisteredTypes()) reg.unregister(name);
    reg.register({
      name: 'async',
      // Lying about the contract just to exercise the check; cast through.
      isApplicable: (() => Promise.resolve(false)) as unknown as (type: DataType) => boolean,
      constructor: AsyncViz,
      priority: 1,
    });

    const container = document.createElement('div');
    const viz = reg.create(container, makeColumn('integer'), makeOptions());
    expect(viz).toBeInstanceOf(AsyncViz);
  });
});

describe('VisualizationFactory — deprecated static wrapper (Phase 3)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    defaultVisualizationRegistry.resetToDefaults();
  });

  it('forwards register/unregister/isApplicable to defaultVisualizationRegistry', () => {
    VisualizationFactory.register({
      name: 'wrapper-custom',
      isApplicable: (t) => t === 'integer',
      constructor: FakeViz,
      priority: 5,
    });

    expect(defaultVisualizationRegistry.getRegisteredTypes()).toContain('wrapper-custom');

    VisualizationFactory.unregister('wrapper-custom');
    expect(defaultVisualizationRegistry.getRegisteredTypes()).not.toContain('wrapper-custom');
  });

  it('forwards resetToDefaults to defaultVisualizationRegistry', () => {
    defaultVisualizationRegistry.register({
      name: 'temp',
      isApplicable: () => true,
      constructor: FakeViz,
      priority: 0,
    });
    expect(defaultVisualizationRegistry.getRegisteredTypes()).toContain('temp');

    VisualizationFactory.resetToDefaults();
    expect(defaultVisualizationRegistry.getRegisteredTypes()).not.toContain('temp');
  });
});
