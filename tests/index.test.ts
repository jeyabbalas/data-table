import { describe, it, expect } from 'vitest';
import * as rootModule from '../src/index';
import { VERSION } from '../src/index';

describe('Data Table Library', () => {
  it('should export VERSION', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('does not export getDefaultBridge (removed in Phase 3)', () => {
    expect(rootModule).not.toHaveProperty('getDefaultBridge');
  });

  it('exports VisualizationRegistry and defaultVisualizationRegistry (Phase 3)', () => {
    expect(rootModule).toHaveProperty('VisualizationRegistry');
    expect(rootModule).toHaveProperty('defaultVisualizationRegistry');
  });
});
