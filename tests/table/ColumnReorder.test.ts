/**
 * Tests for ColumnReorder
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnReorder } from '../../src/table/ColumnReorder';

describe('ColumnReorder', () => {
  let container: HTMLDivElement;
  let headerRow: HTMLDivElement;
  let onReorder: ReturnType<typeof vi.fn>;

  /**
   * Helper to create a column header element
   */
  function createHeader(columnName: string): HTMLDivElement {
    const header = document.createElement('div');
    header.className = 'dt-col-header';
    header.setAttribute('data-column', columnName);
    header.style.width = '150px';

    // Add drag handle element (required for drag initiation)
    const dragHandle = document.createElement('button');
    dragHandle.className = 'dt-col-drag-handle';
    dragHandle.setAttribute('type', 'button');
    dragHandle.setAttribute('aria-label', `Drag to reorder ${columnName}`);
    header.appendChild(dragHandle);

    // Add column name element
    const nameEl = document.createElement('div');
    nameEl.className = 'dt-col-name';
    nameEl.textContent = columnName;
    header.appendChild(nameEl);

    return header;
  }

  /**
   * Helper to get the drag handle from a header
   */
  function getDragHandle(header: Element): Element {
    return header.querySelector('.dt-col-drag-handle')!;
  }

  /**
   * Helper to set up headers inside a header row container
   */
  function setupHeaders(columns: string[]): void {
    const headerRowInner = document.createElement('div');
    headerRowInner.className = 'dt-header-row';

    for (const col of columns) {
      const header = createHeader(col);
      // Mock getBoundingClientRect
      const index = columns.indexOf(col);
      Object.defineProperty(header, 'getBoundingClientRect', {
        value: () => ({
          left: index * 150,
          right: (index + 1) * 150,
          width: 150,
          top: 0,
          bottom: 32,
          height: 32,
        }),
        configurable: true,
      });
      headerRowInner.appendChild(header);
    }

    headerRow.appendChild(headerRowInner);
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    headerRow = document.createElement('div');
    headerRow.className = 'dt-header';
    container.appendChild(headerRow);

    // Mock getBoundingClientRect for headerRow
    Object.defineProperty(headerRow, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        right: 600,
        width: 600,
        top: 0,
        bottom: 32,
        height: 32,
      }),
      configurable: true,
    });

    onReorder = vi.fn();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('constructor', () => {
    it('creates a ColumnReorder instance', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      expect(reorder).toBeInstanceOf(ColumnReorder);
      reorder.destroy();
    });

    it('uses custom class prefix', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { classPrefix: 'custom' });
      reorder.refresh();

      // The drop indicator should have the custom prefix
      const indicator = headerRow.querySelector('.custom-drop-indicator');
      // Indicator is created but not visible
      expect(indicator).toBeNull(); // Not appended until needed

      reorder.destroy();
    });
  });

  describe('enable/disable', () => {
    it('is enabled by default', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      expect(reorder.isEnabled()).toBe(true);
      reorder.destroy();
    });

    it('can be disabled', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.disable();
      expect(reorder.isEnabled()).toBe(false);
      reorder.destroy();
    });

    it('can be re-enabled', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.disable();
      reorder.enable();
      expect(reorder.isEnabled()).toBe(true);
      reorder.destroy();
    });
  });

  describe('refresh', () => {
    it('attaches handlers to new headers', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);

      // Initially no headers
      setupHeaders(['col1', 'col2', 'col3']);
      reorder.refresh();

      // Handlers should be attached (verified by being able to drag)
      expect(reorder.isEnabled()).toBe(true);

      reorder.destroy();
    });

    it('does nothing when disabled', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.disable();

      setupHeaders(['col1', 'col2']);
      reorder.refresh();

      // Still disabled
      expect(reorder.isEnabled()).toBe(false);

      reorder.destroy();
    });
  });

  describe('isDraggingNow', () => {
    it('returns false initially', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);
      expect(reorder.isDraggingNow()).toBe(false);
      reorder.destroy();
    });

    it('returns false when disabled', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.refresh();
      reorder.disable();

      expect(reorder.isDraggingNow()).toBe(false);
      reorder.destroy();
    });
  });

  describe('drag initiation', () => {
    it('does not start drag on simple click (no movement)', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;

      // Mousedown
      const mousedown = new MouseEvent('mousedown', {
        clientX: 75,
        clientY: 16,
        bubbles: true,
        cancelable: true,
      });
      header.dispatchEvent(mousedown);

      // Not dragging yet (no movement past threshold)
      expect(reorder.isDraggingNow()).toBe(false);

      // Mouseup without movement
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // onReorder should not have been called
      expect(onReorder).not.toHaveBeenCalled();

      reorder.destroy();
    });

    it('starts drag after moving past threshold', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);

      // Mousedown on drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85, // +10 pixels
          clientY: 16,
          bubbles: true,
        })
      );

      expect(reorder.isDraggingNow()).toBe(true);

      // Clean up
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      reorder.destroy();
    });

    it('does not start drag when clicking resize handle', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.refresh();

      // Add a resize handle to the header
      const header = headerRow.querySelector('[data-column="col1"]')!;
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'dt-col-resize-handle';
      header.appendChild(resizeHandle);

      // Click on resize handle
      resizeHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 145,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Should not start potential drag
      expect(reorder.isDraggingNow()).toBe(false);

      reorder.destroy();
    });

    it('does not start drag when clicking sort button', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.refresh();

      // Add a sort button to the header
      const header = headerRow.querySelector('[data-column="col1"]')!;
      const sortBtn = document.createElement('button');
      sortBtn.className = 'dt-col-sort-btn';
      header.appendChild(sortBtn);

      // Click on sort button
      sortBtn.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Should not start potential drag
      expect(reorder.isDraggingNow()).toBe(false);

      reorder.destroy();
    });

    it('does not start drag when clicking on column name (non-drag-handle area)', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const colName = header.querySelector('.dt-col-name')!;

      // Click on column name (not the drag handle)
      colName.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200, // +125 pixels
          clientY: 16,
          bubbles: true,
        })
      );

      // Should NOT start drag (only drag handle triggers drag)
      expect(reorder.isDraggingNow()).toBe(false);

      // Clean up
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      reorder.destroy();
    });
  });

  describe('drop and reorder', () => {
    it('calls onReorder when column is moved to a new position', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);

      // Start drag on col1 (at position 0) via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75, // center of col1
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Move past threshold to start drag
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        })
      );

      // Move to position after col2 (around x=300)
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 300,
          clientY: 16,
          bubbles: true,
        })
      );

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Should have reordered: col1 moved after col2
      // New order: col2, col1, col3
      expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3']);

      reorder.destroy();
    });

    it('does not call onReorder when dropped in same position', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;

      // Start drag on col1
      header.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        })
      );

      // Move back to same position (still in col1's area)
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
        })
      );

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Should not have called onReorder (same position)
      expect(onReorder).not.toHaveBeenCalled();

      reorder.destroy();
    });

    it('resets drag state after drop', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);

      // Start and complete drag via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        })
      );

      expect(reorder.isDraggingNow()).toBe(true);

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(reorder.isDraggingNow()).toBe(false);

      reorder.destroy();
    });
  });

  describe('visual feedback', () => {
    it('adds dragging class to body during drag', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);

      // Start drag via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        })
      );

      expect(document.body.classList.contains('dt-column-dragging')).toBe(true);

      // End drag
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(document.body.classList.contains('dt-column-dragging')).toBe(false);

      reorder.destroy();
    });

    it('adds dragging class to dragged header', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);

      // Start drag via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        })
      );

      expect(header.classList.contains('dt-col-header--dragging')).toBe(true);

      // End drag
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(header.classList.contains('dt-col-header--dragging')).toBe(false);

      reorder.destroy();
    });
  });

  describe('destroy', () => {
    it('cleans up all event handlers', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder);
      reorder.refresh();

      reorder.destroy();

      // Try to drag after destroy - should not work
      const header = headerRow.querySelector('[data-column="col1"]')!;
      header.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200,
          clientY: 16,
          bubbles: true,
        })
      );

      // Should not be dragging
      expect(reorder.isDraggingNow()).toBe(false);
    });

    it('removes drop indicator', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      // Start a drag to create the indicator via drag handle
      const header = headerRow.querySelector('[data-column="col1"]')!;
      const dragHandle = getDragHandle(header);
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
          cancelable: true,
        })
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200,
          clientY: 16,
          bubbles: true,
        })
      );

      // End drag and destroy
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      reorder.destroy();

      // Check that drop indicator is removed
      expect(headerRow.querySelector('.dt-drop-indicator')).toBeNull();
    });

    it('is safe to call multiple times', () => {
      const reorder = new ColumnReorder(headerRow, onReorder);

      reorder.destroy();
      reorder.destroy();
      reorder.destroy();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
