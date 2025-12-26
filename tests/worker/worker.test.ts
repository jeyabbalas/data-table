import { describe, it, expect } from 'vitest';
import type { WorkerMessage, WorkerResponse } from '@/worker/types';

describe('Worker Types', () => {
  it('should define valid WorkerMessage structure', () => {
    const message: WorkerMessage = {
      id: 'test-1',
      type: 'init',
      payload: {},
    };
    expect(message.id).toBe('test-1');
    expect(message.type).toBe('init');
  });

  it('should define valid WorkerResponse structure', () => {
    const response: WorkerResponse = {
      id: 'test-1',
      type: 'result',
      payload: { data: [] },
    };
    expect(response.id).toBe('test-1');
    expect(response.type).toBe('result');
  });

  it('should support all message types', () => {
    const types: WorkerMessage['type'][] = ['init', 'query', 'load', 'cancel'];
    expect(types).toHaveLength(4);
  });

  it('should support all response types', () => {
    const types: WorkerResponse['type'][] = ['result', 'error', 'progress'];
    expect(types).toHaveLength(3);
  });
});
