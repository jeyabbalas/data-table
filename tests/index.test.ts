import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index';

describe('Data Table Library', () => {
  it('should export VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
