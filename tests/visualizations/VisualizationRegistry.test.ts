/**
 * VisualizationRegistry — per-instance isolation tests (Phase 3)
 *
 * Proves that two registries do not leak custom registrations into each
 * other, and that the shared `defaultVisualizationRegistry` is a registry
 * like any other.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  isCategoricalType,
  isNestedType,
  needsVisualization,
} from '../../src/visualizations/VisualizationRegistry';
import { BaseVisualization } from '../../src/visualizations/BaseVisualization';
import { NestedSummaryVisualization } from '../../src/visualizations/nested';
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
  it('seeds the 6 built-in registrations on construction', () => {
    const reg = new VisualizationRegistry();
    const types = reg.getRegisteredTypes();
    expect(types).toContain('histogram');
    expect(types).toContain('date-histogram');
    expect(types).toContain('time-histogram');
    expect(types).toContain('interval-histogram');
    expect(types).toContain('value-counts');
    expect(types).toContain('nested-summary');
    expect(types).toHaveLength(6);
  });

  it('treats nested columns as nested, not categorical', () => {
    expect(isNestedType('nested')).toBe(true);
    expect(isNestedType('string')).toBe(false);
    expect(isCategoricalType('nested')).toBe(false);

    // A registration for text columns does not receive a nested column.
    const reg = new VisualizationRegistry();
    reg.register({
      name: 'text-only',
      isApplicable: (t) => t === 'string',
      constructor: FakeViz,
      priority: 10,
    });
    const nested: ColumnSchema = {
      name: 'tags',
      type: 'nested',
      nullable: true,
      originalType: 'VARCHAR[]',
    };
    const viz = reg.create(document.createElement('div'), nested, makeOptions());
    expect(viz).not.toBeInstanceOf(FakeViz);
    viz?.destroy();
  });

  it('gives a nested column the nested summary chart', () => {
    const reg = new VisualizationRegistry();
    for (const originalType of ['INTEGER[]', 'FLOAT[768]', 'STRUCT(x DOUBLE)', 'VARIANT']) {
      const column: ColumnSchema = { name: 'n', type: 'nested', nullable: true, originalType };
      expect(reg.isApplicable(column)).toBe(true);
      const viz = reg.create(document.createElement('div'), column, makeOptions());
      expect(viz).toBeInstanceOf(NestedSummaryVisualization);
      viz?.destroy();
    }
    // Text columns keep the value counts, JSON ones included.
    const json: ColumnSchema = {
      name: 'doc',
      type: 'string',
      nullable: true,
      originalType: 'JSON',
    };
    const viz = reg.create(document.createElement('div'), json, makeOptions());
    expect(viz).not.toBeInstanceOf(NestedSummaryVisualization);
    viz?.destroy();
  });

  it('lets a higher-priority registration for nested columns replace the summary', () => {
    const reg = new VisualizationRegistry();
    reg.register({
      name: 'list-length',
      isApplicable: isNestedType,
      constructor: FakeViz,
      priority: 10,
    });
    const column: ColumnSchema = {
      name: 'tags',
      type: 'nested',
      nullable: true,
      originalType: 'VARCHAR[]',
    };
    const viz = reg.create(document.createElement('div'), column, makeOptions());
    expect(viz).toBeInstanceOf(FakeViz);
    viz?.destroy();

    // Unregistering the built-in leaves nested columns without a chart.
    const bare = new VisualizationRegistry();
    expect(bare.unregister('nested-summary')).toBe(true);
    expect(bare.isApplicable(column)).toBe(false);
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
    // Returning null is the contract; the facade then leaves the column
    // header without a chart, its stats slot showing the table-wide count.
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

describe('defaultVisualizationRegistry', () => {
  // The default registry is shared by every test in the file: start from the
  // built-ins whatever an earlier test registered, and leave them for the next.
  beforeEach(() => {
    defaultVisualizationRegistry.resetToDefaults();
  });
  afterEach(() => {
    defaultVisualizationRegistry.resetToDefaults();
  });

  it('is a seeded VisualizationRegistry, the one needsVisualization reads', () => {
    expect(defaultVisualizationRegistry).toBeInstanceOf(VisualizationRegistry);
    expect(defaultVisualizationRegistry.getRegisteredTypes()).toHaveLength(6);

    expect(needsVisualization('integer')).toBe(true);
    defaultVisualizationRegistry.unregister('histogram');
    expect(needsVisualization('integer')).toBe(false);
  });
});
