/**
 * StatsPanelRegistry — registry semantics tests.
 *
 * Mirrors `tests/visualizations/VisualizationRegistry.test.ts` so the two
 * registries stay parallel (the only intentional behavioral difference is
 * that `StatsPanelRegistry` starts empty — no library built-ins).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  StatsPanelRegistry,
  defaultStatsPanelRegistry,
} from '../../src/visualizations/StatsPanelRegistry';
import {
  BaseStatsPanel,
  type StatsPanelOptions,
} from '../../src/visualizations/BaseStatsPanel';
import type { ColumnSchema, DataType } from '../../src/core/types';
import type { ColumnStatsData } from '../../src/statistics/ColumnStatsTypes';
import type { WorkerBridge } from '../../src/data/WorkerBridge';
import { defaultStrings } from '../../src/core/Strings';

function makeColumn(type: DataType, name = 'col'): ColumnSchema {
  return { name, type, nullable: true, originalType: type.toUpperCase() };
}

function makeOptions(): StatsPanelOptions {
  return {
    tableName: 't',
    bridge: {} as unknown as WorkerBridge,
    filters: [],
    messages: defaultStrings,
  };
}

class FakePanel extends BaseStatsPanel {
  update(_stats: ColumnStatsData | null): void {}
}

class OtherPanel extends BaseStatsPanel {
  update(_stats: ColumnStatsData | null): void {}
}

describe('StatsPanelRegistry', () => {
  beforeEach(() => {
    // Module-scoped default is shared across tests — clear it so we don't
    // see leakage from other test files that imported and registered on it.
    defaultStatsPanelRegistry.resetToDefaults();
  });

  it('starts empty (no library built-ins)', () => {
    const reg = new StatsPanelRegistry();
    expect(reg.getRegisteredTypes()).toEqual([]);
  });

  it('register / unregister round-trips', () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'integer',
      constructor: FakePanel,
      priority: 10,
    });
    expect(reg.getRegisteredTypes()).toEqual(['mean-std']);
    expect(reg.unregister('mean-std')).toBe(true);
    expect(reg.getRegisteredTypes()).toEqual([]);
    expect(reg.unregister('mean-std')).toBe(false);
  });

  it('same-name re-register replaces in place (no duplicate entries)', () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'integer',
      constructor: FakePanel,
      priority: 5,
    });
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'float',
      constructor: OtherPanel,
      priority: 20,
    });
    const types = reg.getRegisteredTypes();
    expect(types).toEqual(['mean-std']);

    // The new constructor wins, and the predicate is the new one.
    const container = document.createElement('div');
    const intResult = reg.create(container, makeColumn('integer'), makeOptions());
    expect(intResult).toBeNull();
    const floatResult = reg.create(container, makeColumn('float'), makeOptions());
    expect(floatResult).toBeInstanceOf(OtherPanel);
  });

  it('create() returns null when no registration matches', () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'integer',
      constructor: FakePanel,
      priority: 0,
    });

    const container = document.createElement('div');
    expect(reg.create(container, makeColumn('string'), makeOptions())).toBeNull();
  });

  it('create() returns highest-priority match when multiple apply', () => {
    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'low',
      isApplicable: () => true,
      constructor: FakePanel,
      priority: 1,
    });
    reg.register({
      name: 'high',
      isApplicable: () => true,
      constructor: OtherPanel,
      priority: 99,
    });

    const container = document.createElement('div');
    const result = reg.create(container, makeColumn('string'), makeOptions());
    expect(result).toBeInstanceOf(OtherPanel);
  });

  it('isApplicable() reflects whether any registration matches', () => {
    const reg = new StatsPanelRegistry();
    expect(reg.isApplicable(makeColumn('integer'))).toBe(false);
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'integer',
      constructor: FakePanel,
      priority: 0,
    });
    expect(reg.isApplicable(makeColumn('integer'))).toBe(true);
    expect(reg.isApplicable(makeColumn('string'))).toBe(false);
  });

  it('isolates custom registrations between two registries', () => {
    const a = new StatsPanelRegistry();
    const b = new StatsPanelRegistry();
    a.register({
      name: 'mean-std',
      isApplicable: () => true,
      constructor: FakePanel,
      priority: 0,
    });
    expect(a.getRegisteredTypes()).toContain('mean-std');
    expect(b.getRegisteredTypes()).not.toContain('mean-std');
  });

  it('resetToDefaults() empties this registry without touching others', () => {
    const a = new StatsPanelRegistry();
    const b = new StatsPanelRegistry();
    a.register({ name: 'x', isApplicable: () => true, constructor: FakePanel, priority: 0 });
    b.register({ name: 'y', isApplicable: () => true, constructor: OtherPanel, priority: 0 });

    a.resetToDefaults();

    expect(a.getRegisteredTypes()).toEqual([]);
    expect(b.getRegisteredTypes()).toEqual(['y']);
  });

  it('subclass override of create() supports per-column-name routing', () => {
    class NameAwareRegistry extends StatsPanelRegistry {
      create(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
        if (column.name === 'special') {
          return new OtherPanel(container, column, options);
        }
        return super.create(container, column, options);
      }
    }

    const reg = new NameAwareRegistry();
    reg.register({
      name: 'mean-std',
      isApplicable: (t) => t === 'integer',
      constructor: FakePanel,
      priority: 0,
    });

    const container = document.createElement('div');
    const a = reg.create(container, makeColumn('integer', 'normal'), makeOptions());
    const b = reg.create(container, makeColumn('integer', 'special'), makeOptions());
    expect(a).toBeInstanceOf(FakePanel);
    expect(b).toBeInstanceOf(OtherPanel);
  });

  it('defaultStatsPanelRegistry is a separate StatsPanelRegistry instance, empty by default', () => {
    expect(defaultStatsPanelRegistry).toBeInstanceOf(StatsPanelRegistry);
    expect(defaultStatsPanelRegistry.getRegisteredTypes()).toEqual([]);
  });

  it('passes container, column, and options through to the constructor', () => {
    const seen: Array<{ container: HTMLElement; column: ColumnSchema; options: StatsPanelOptions }> = [];

    class CapturingPanel extends BaseStatsPanel {
      constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
        super(container, column, options);
        seen.push({ container, column, options });
      }
      update(_stats: ColumnStatsData | null): void {}
    }

    const reg = new StatsPanelRegistry();
    reg.register({
      name: 'capturing',
      isApplicable: () => true,
      constructor: CapturingPanel,
      priority: 0,
    });

    const container = document.createElement('div');
    const column = makeColumn('integer', 'amount');
    const options = makeOptions();
    reg.create(container, column, options);

    expect(seen).toHaveLength(1);
    expect(seen[0].container).toBe(container);
    expect(seen[0].column).toBe(column);
    expect(seen[0].options).toBe(options);
  });
});
