import { describe, it, expect } from 'vitest';
import { WorkerBridge, getDefaultBridge } from '@/data/WorkerBridge';

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

describe('getDefaultBridge', () => {
  it('should return a WorkerBridge instance', () => {
    const bridge = getDefaultBridge();
    expect(bridge).toBeInstanceOf(WorkerBridge);
  });

  it('should return the same instance on multiple calls', () => {
    const bridge1 = getDefaultBridge();
    const bridge2 = getDefaultBridge();
    expect(bridge1).toBe(bridge2);
  });
});
