// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { isStylesheetLoaded } from '@/core/stylesheet';

describe('isStylesheetLoaded', () => {
  const originalValue = document.documentElement.style.getPropertyValue('--dt-stylesheet-loaded');

  afterEach(() => {
    if (originalValue) {
      document.documentElement.style.setProperty('--dt-stylesheet-loaded', originalValue);
    } else {
      document.documentElement.style.removeProperty('--dt-stylesheet-loaded');
    }
  });

  it('returns false when the marker is unset', () => {
    document.documentElement.style.removeProperty('--dt-stylesheet-loaded');
    expect(isStylesheetLoaded()).toBe(false);
  });

  it('returns true when the marker is set', () => {
    document.documentElement.style.setProperty('--dt-stylesheet-loaded', '1');
    expect(isStylesheetLoaded()).toBe(true);
  });

  it('treats whitespace-only values as absent', () => {
    document.documentElement.style.setProperty('--dt-stylesheet-loaded', '   ');
    expect(isStylesheetLoaded()).toBe(false);
  });

  it('honors a custom root argument', () => {
    const root = document.createElement('div');
    root.style.setProperty('--dt-stylesheet-loaded', '1');
    document.body.appendChild(root);
    try {
      expect(isStylesheetLoaded(root)).toBe(true);
    } finally {
      root.remove();
    }
  });

  it('with a custom root that lacks the marker, returns false', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    try {
      // Ensure the document root also lacks the marker so inheritance does not
      // accidentally satisfy the check.
      document.documentElement.style.removeProperty('--dt-stylesheet-loaded');
      expect(isStylesheetLoaded(root)).toBe(false);
    } finally {
      root.remove();
    }
  });
});
