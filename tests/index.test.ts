import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as rootModule from '../src/index';
import { VERSION } from '../src/index';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
) as { version: string };

describe('Data Table Library', () => {
  it('exports VERSION matching package.json#version', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('does not export getDefaultBridge (removed in Phase 3)', () => {
    expect(rootModule).not.toHaveProperty('getDefaultBridge');
  });

  it('exports VisualizationRegistry and defaultVisualizationRegistry (Phase 3)', () => {
    expect(rootModule).toHaveProperty('VisualizationRegistry');
    expect(rootModule).toHaveProperty('defaultVisualizationRegistry');
  });
});
