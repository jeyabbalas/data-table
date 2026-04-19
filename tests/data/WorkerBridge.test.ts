import { describe, it, expect } from 'vitest';
import { WorkerBridge } from '@/data/WorkerBridge';

describe('WorkerBridge', () => {
  it('should define WorkerBridge class', () => {
    expect(WorkerBridge).toBeDefined();
  });

  it('should have required methods', () => {
    const bridge = new WorkerBridge();
    expect(typeof bridge.initialize).toBe('function');
    expect(typeof bridge.query).toBe('function');
    expect(typeof bridge.loadData).toBe('function');
    expect(typeof bridge.terminate).toBe('function');
    expect(typeof bridge.isInitialized).toBe('function');
    expect(typeof bridge.clearQueryCache).toBe('function');
  });

  it('should accept cache options in constructor', () => {
    const bridge = new WorkerBridge({ cache: { maxEntries: 50, ttlMs: 10_000 } });
    expect(bridge).toBeInstanceOf(WorkerBridge);
    // clearQueryCache should work without error
    expect(() => bridge.clearQueryCache()).not.toThrow();
  });

  it('should accept initializeTimeoutMs in constructor', () => {
    const bridge = new WorkerBridge({ initializeTimeoutMs: 5_000 });
    expect(bridge).toBeInstanceOf(WorkerBridge);
  });

  it('should throw if query called before initialize', async () => {
    const bridge = new WorkerBridge();
    await expect(bridge.query('SELECT 1')).rejects.toThrow('not initialized');
  });

  it('should throw if loadData called before initialize', async () => {
    const bridge = new WorkerBridge();
    await expect(
      bridge.loadData('test data', { format: 'csv' })
    ).rejects.toThrow('not initialized');
  });

  it('should report not initialized before initialize is called', () => {
    const bridge = new WorkerBridge();
    expect(bridge.isInitialized()).toBe(false);
  });

  it('should handle terminate on uninitialized bridge gracefully', () => {
    const bridge = new WorkerBridge();
    expect(() => bridge.terminate()).not.toThrow();
  });
});

describe('WorkerBridge configuration', () => {
  it('should accept workerFactory in constructor', () => {
    const bridge = new WorkerBridge({ workerFactory: () => new Worker('data:,') });
    expect(bridge).toBeInstanceOf(WorkerBridge);
  });

  it('should accept workerUrl in constructor', () => {
    const bridge = new WorkerBridge({ workerUrl: 'data:,' });
    expect(bridge).toBeInstanceOf(WorkerBridge);
  });
});
