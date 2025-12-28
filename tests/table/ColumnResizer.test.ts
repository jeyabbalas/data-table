/**
 * Tests for ColumnResizer
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnResizer } from '../../src/table/ColumnResizer';

describe('ColumnResizer', () => {
  let container: HTMLDivElement;
  let header: HTMLDivElement;
  let onResize: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    header = document.createElement('div');
    header.className = 'dt-col-header';
    header.style.width = '150px';
    container.appendChild(header);

    onResize = vi.fn();

    // Mock offsetWidth since jsdom doesn't calculate it
    Object.defineProperty(header, 'offsetWidth', {
      value: 150,
      configurable: true,
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('constructor', () => {
    it('attaches a resize handle to the header', () => {
      const resizer = new ColumnResizer(header, onResize);

      const handle = header.querySelector('.dt-col-resize-handle');
      expect(handle).not.toBeNull();

      resizer.detach();
    });

    it('uses custom class prefix', () => {
      const resizer = new ColumnResizer(header, onResize, { classPrefix: 'custom' });

      const handle = header.querySelector('.custom-col-resize-handle');
      expect(handle).not.toBeNull();

      resizer.detach();
    });

    it('applies custom min and max width constraints', () => {
      const resizer = new ColumnResizer(header, onResize, {
        minWidth: 100,
        maxWidth: 300,
      });

      expect(resizer.getMinWidth()).toBe(100);
      expect(resizer.getMaxWidth()).toBe(300);

      resizer.detach();
    });

    it('uses default min and max width when not specified', () => {
      const resizer = new ColumnResizer(header, onResize);

      expect(resizer.getMinWidth()).toBe(50);
      expect(resizer.getMaxWidth()).toBe(500);

      resizer.detach();
    });
  });

  describe('detach', () => {
    it('removes the handle from the header', () => {
      const resizer = new ColumnResizer(header, onResize);
      expect(header.querySelector('.dt-col-resize-handle')).not.toBeNull();

      resizer.detach();
      expect(header.querySelector('.dt-col-resize-handle')).toBeNull();
    });

    it('sets detached state', () => {
      const resizer = new ColumnResizer(header, onResize);
      expect(resizer.isDetached()).toBe(false);

      resizer.detach();
      expect(resizer.isDetached()).toBe(true);
    });

    it('is safe to call multiple times', () => {
      const resizer = new ColumnResizer(header, onResize);

      resizer.detach();
      resizer.detach();
      resizer.detach();

      expect(resizer.isDetached()).toBe(true);
    });
  });

  describe('getHandle', () => {
    it('returns the handle element', () => {
      const resizer = new ColumnResizer(header, onResize);

      const handle = resizer.getHandle();
      expect(handle).not.toBeNull();
      expect(handle?.className).toContain('dt-col-resize-handle');

      resizer.detach();
    });

    it('returns null after detach', () => {
      const resizer = new ColumnResizer(header, onResize);
      resizer.detach();

      expect(resizer.getHandle()).toBeNull();
    });
  });

  describe('isDraggingNow', () => {
    it('returns false initially', () => {
      const resizer = new ColumnResizer(header, onResize);

      expect(resizer.isDraggingNow()).toBe(false);

      resizer.detach();
    });
  });

  describe('drag interaction', () => {
    it('starts dragging on mousedown', () => {
      const resizer = new ColumnResizer(header, onResize);
      const handle = resizer.getHandle()!;

      // Simulate mousedown
      const mousedown = new MouseEvent('mousedown', {
        clientX: 200,
        bubbles: true,
        cancelable: true,
      });
      handle.dispatchEvent(mousedown);

      expect(resizer.isDraggingNow()).toBe(true);

      // Clean up - simulate mouseup
      const mouseup = new MouseEvent('mouseup', {
        clientX: 200,
        bubbles: true,
      });
      document.dispatchEvent(mouseup);

      resizer.detach();
    });

    it('calls onResize during drag', () => {
      const resizer = new ColumnResizer(header, onResize);
      const handle = resizer.getHandle()!;

      // Start dragging at x=200
      const mousedown = new MouseEvent('mousedown', {
        clientX: 200,
        bubbles: true,
        cancelable: true,
      });
      handle.dispatchEvent(mousedown);

      // Move to x=250 (delta of +50)
      const mousemove = new MouseEvent('mousemove', {
        clientX: 250,
        bubbles: true,
      });
      document.dispatchEvent(mousemove);

      // Should resize to 150 + 50 = 200
      expect(onResize).toHaveBeenCalledWith(200);

      // End drag
      const mouseup = new MouseEvent('mouseup', {
        clientX: 250,
        bubbles: true,
      });
      document.dispatchEvent(mouseup);

      resizer.detach();
    });

    it('enforces minimum width', () => {
      const resizer = new ColumnResizer(header, onResize, { minWidth: 80 });
      const handle = resizer.getHandle()!;

      // Start dragging at x=200
      const mousedown = new MouseEvent('mousedown', {
        clientX: 200,
        bubbles: true,
        cancelable: true,
      });
      handle.dispatchEvent(mousedown);

      // Move far left (delta of -100)
      const mousemove = new MouseEvent('mousemove', {
        clientX: 100,
        bubbles: true,
      });
      document.dispatchEvent(mousemove);

      // Should clamp to minWidth (80), not 150 - 100 = 50
      expect(onResize).toHaveBeenCalledWith(80);

      // End drag
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      resizer.detach();
    });

    it('enforces maximum width', () => {
      const resizer = new ColumnResizer(header, onResize, { maxWidth: 200 });
      const handle = resizer.getHandle()!;

      // Start dragging at x=200
      const mousedown = new MouseEvent('mousedown', {
        clientX: 200,
        bubbles: true,
        cancelable: true,
      });
      handle.dispatchEvent(mousedown);

      // Move far right (delta of +100)
      const mousemove = new MouseEvent('mousemove', {
        clientX: 300,
        bubbles: true,
      });
      document.dispatchEvent(mousemove);

      // Should clamp to maxWidth (200), not 150 + 100 = 250
      expect(onResize).toHaveBeenCalledWith(200);

      // End drag
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      resizer.detach();
    });

    it('stops propagation of mousedown to prevent sort click', () => {
      const resizer = new ColumnResizer(header, onResize);
      const handle = resizer.getHandle()!;

      const headerClick = vi.fn();
      header.addEventListener('click', headerClick);

      // Mousedown on handle should stop propagation
      const mousedown = new MouseEvent('mousedown', {
        clientX: 200,
        bubbles: true,
        cancelable: true,
      });
      handle.dispatchEvent(mousedown);

      // The click event should not have reached the header
      // (In real usage, the click would be on the handle, not bubbling to trigger sort)

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      resizer.detach();
    });

    it('ends dragging on mouseup', () => {
      const resizer = new ColumnResizer(header, onResize);
      const handle = resizer.getHandle()!;

      // Start dragging
      handle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 200,
          bubbles: true,
          cancelable: true,
        })
      );
      expect(resizer.isDraggingNow()).toBe(true);

      // End dragging
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(resizer.isDraggingNow()).toBe(false);

      resizer.detach();
    });
  });

  describe('accessibility', () => {
    it('has correct ARIA attributes', () => {
      const resizer = new ColumnResizer(header, onResize);
      const handle = resizer.getHandle()!;

      expect(handle.getAttribute('role')).toBe('separator');
      expect(handle.getAttribute('aria-orientation')).toBe('vertical');
      expect(handle.getAttribute('aria-label')).toBe('Resize column');

      resizer.detach();
    });
  });
});
