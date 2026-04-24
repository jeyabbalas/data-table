import { describe, it, expect } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';

describe('AnnotationStore — scale (soft performance targets)', () => {
  it('getByCell lookups over 10k annotations stay < ~2ms p95', () => {
    const store = new AnnotationStore();
    const totalRows = 100_000;
    const columns = Array.from({ length: 20 }, (_, i) => `c${i}`);
    for (let i = 0; i < 10_000; i++) {
      const rowId = Math.floor(Math.random() * totalRows);
      const column = columns[Math.floor(Math.random() * columns.length)];
      store.add({ scope: 'cell', rowId, column, severity: 'info', message: `m${i}` });
    }
    expect(store.count()).toBe(10_000);

    const lookups = 1_000;
    const samples: number[] = [];
    for (let i = 0; i < lookups; i++) {
      const rowId = Math.floor(Math.random() * totalRows);
      const column = columns[Math.floor(Math.random() * columns.length)];
      const t0 = performance.now();
      store.getByCell(rowId, column);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    // Generous CI headroom; typical run completes well under 1ms.
    expect(p95).toBeLessThan(10);
  });

  it('toJSON on 10k annotations completes quickly', () => {
    const store = new AnnotationStore({ tableName: 'scale_test' });
    for (let i = 0; i < 10_000; i++) {
      store.add({
        scope: 'row',
        rowId: i,
        severity: i % 3 === 0 ? 'error' : i % 3 === 1 ? 'warning' : 'info',
        message: `m${i}`,
      });
    }
    const t0 = performance.now();
    const file = store.toJSON();
    const elapsed = performance.now() - t0;
    expect(file.annotations).toHaveLength(10_000);
    // Generous headroom; typical Node run is well under 50ms.
    expect(elapsed).toBeLessThan(300);
  });
});
