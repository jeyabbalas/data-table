/**
 * @vitest-environment jsdom
 *
 * Phase 1 — TableContainer fallback header XSS regression test.
 *
 * The pre-Phase-1 fallback header (`TableContainer.ts:1011`, used when no
 * `actions` is supplied) interpolated raw `colSchema.name` and `colSchema.type`
 * into `innerHTML`. A hostile column name (e.g. an attacker-controlled CSV
 * header) could inject markup. Replaced with `textContent` + DOM construction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { TableContainer } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TableContainer fallback header — XSS', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    state = createTableState();
  });

  it('renders an attacker-controlled column name as text, not HTML', () => {
    const malicious = '<img src=x onerror="window.__pwned=true">';
    state.tableName.set('test_table');
    const schema: ColumnSchema[] = [
      { name: malicious, type: 'string', nullable: true, originalType: 'VARCHAR' },
    ];
    initializeColumnsFromSchema(state, schema);
    state.totalRows.set(1);

    const tc = new TableContainer(container, state);
    tc.render();

    const header = tc.getHeaderRow();
    // Text appears literally (in the strong/small wrappers), not parsed.
    expect(header.textContent).toContain(malicious);
    // No injected <img> element anywhere in the header subtree.
    expect(header.querySelector('img')).toBeNull();
    // Side-effect proof: the fake onerror handler must not have run.
    expect((globalThis as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();

    tc.destroy();
  });

  it('renders an attacker-controlled column type as text, not HTML', () => {
    const maliciousType = '"><script>window.__pwned2=1</script>' as ColumnSchema['type'];
    state.tableName.set('test_table');
    const schema: ColumnSchema[] = [
      // Force a hostile type string through the cast — DataType is a TS-level
      // narrowing only; the runtime carries whatever the loader produces.
      { name: 'col', type: maliciousType, nullable: true, originalType: 'X' },
    ];
    initializeColumnsFromSchema(state, schema);
    state.totalRows.set(1);

    const tc = new TableContainer(container, state);
    tc.render();

    const header = tc.getHeaderRow();
    expect(header.querySelector('script')).toBeNull();
    expect((globalThis as unknown as { __pwned2?: number }).__pwned2).toBeUndefined();

    tc.destroy();
  });
});
