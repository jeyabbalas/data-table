/**
 * Tests for ColumnReorder
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnLayout } from '../../src/table/ColumnLayout';
import { ColumnReorder, clampUnpinnedIndex } from '../../src/table/ColumnReorder';

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
    // Add dt-root class so ColumnReorder can scope drag classes to the
    // table root instead of polluting <body>.
    container.className = 'dt-root';
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
        }),
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85, // +10 pixels
          clientY: 16,
          bubbles: true,
        }),
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
        }),
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
        }),
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
        }),
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200, // +125 pixels
          clientY: 16,
          bubbles: true,
        }),
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
        }),
      );

      // Move past threshold to start drag
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Move to position after col2 (around x=300)
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 300,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Should have reordered: col1 moved after col2
      // New order: col2, col1, col3
      expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3'], 'col1');

      reorder.destroy();
    });

    it('drops where the pointer is after the headers scroll under it', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col1"]')!;
      getDragHandle(header).dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 85, clientY: 16 }));
      // Past col2's middle: before the scroll, the drop is between col2 and col3.
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 16 }));

      // The headers scroll 150px left under the still pointer, which is then
      // past col3's middle.
      for (const [i, name] of ['col1', 'col2', 'col3'].entries()) {
        Object.defineProperty(
          headerRow.querySelector(`[data-column="${name}"]`)!,
          'getBoundingClientRect',
          {
            value: () => ({
              left: i * 150 - 150,
              right: i * 150,
              width: 150,
              top: 0,
              bottom: 32,
              height: 32,
            }),
            configurable: true,
          },
        );
      }
      headerRow.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(onReorder).toHaveBeenCalledWith(['col2', 'col3', 'col1'], 'col1');
      reorder.destroy();
    });

    /** Move every header's rect `dx` px, as a scroll or resize would. */
    function shiftHeaders(root: ParentNode, dx: number): void {
      for (const [i, name] of ['col1', 'col2', 'col3'].entries()) {
        Object.defineProperty(
          root.querySelector(`[data-column="${name}"]`)!,
          'getBoundingClientRect',
          {
            value: () => ({
              left: i * 150 + dx,
              right: (i + 1) * 150 + dx,
              width: 150,
              top: 0,
              bottom: 32,
              height: 32,
            }),
            configurable: true,
          },
        );
      }
    }

    /** Drag col1 by its handle to x = 240, past col2's middle. */
    function dragCol1To240(root: ParentNode): void {
      getDragHandle(root.querySelector('[data-column="col1"]')!).dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 85, clientY: 16 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 16 }));
    }

    function indicatorLeft(root: ParentNode): string {
      return root.querySelector<HTMLElement>('.dt-drop-indicator')!.style.left;
    }

    it('moves the indicator on a scroll of the headers, and not of anything else', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();
      dragCol1To240(headerRow);
      expect(indicatorLeft(headerRow)).toBe('300px');

      // 100px left: the pointer is now before col3's middle, at 200.
      shiftHeaders(headerRow, -100);
      const sidebar = document.createElement('div');
      document.body.appendChild(sidebar);
      sidebar.dispatchEvent(new Event('scroll'));
      expect(indicatorLeft(headerRow)).toBe('300px');
      headerRow.dispatchEvent(new Event('scroll'));
      expect(indicatorLeft(headerRow)).toBe('200px');

      sidebar.remove();
      reorder.destroy();
    });

    it('takes the drop from the headers as they are at release', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();
      dragCol1To240(headerRow);

      // Moved without a scroll event, as a resize or a rebuild would.
      shiftHeaders(headerRow, -150);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(onReorder).toHaveBeenCalledWith(['col2', 'col3', 'col1'], 'col1');
      reorder.destroy();
    });

    it('hears the header scroller inside a shadow root', () => {
      const shadowHost = document.createElement('div');
      document.body.appendChild(shadowHost);
      const shadow = shadowHost.attachShadow({ mode: 'open' });
      shadow.appendChild(container);
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      reorder.refresh();
      dragCol1To240(shadow);
      expect(indicatorLeft(shadow)).toBe('300px');

      shiftHeaders(shadow, -100);
      // A scroll event does not leave the shadow root.
      headerRow.dispatchEvent(new Event('scroll'));
      expect(indicatorLeft(shadow)).toBe('200px');

      reorder.destroy();
      document.body.appendChild(container);
      shadowHost.remove();
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
        }),
      );

      // Move past threshold
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Move back to same position (still in col1's area)
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 75,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Should not have called onReorder (same position)
      expect(onReorder).not.toHaveBeenCalled();

      reorder.destroy();
    });

    it('clamps a drop inside the pinned block to the first unpinned position', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, {
        dragThreshold: 5,
        getPinnedColumns: () => ['col1'],
      });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col3"]')!;
      const dragHandle = getDragHandle(header);

      // Start drag on col3 (at position 2) via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 375, // center of col3
          clientY: 16,
          bubbles: true,
          cancelable: true,
        }),
      );

      // Move past threshold to start drag
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 365,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Move to the far left, which is left of col1's midpoint and so drops
      // at index 0 — inside the pinned block.
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 10,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Sticky `left` offsets are computed by walking the pinned columns in
      // order, so a pinned column landing anywhere but the front desyncs every
      // offset after it. col3 goes to index 1, the first unpinned slot.
      expect(onReorder).toHaveBeenCalledWith(['col1', 'col3', 'col2'], 'col3');

      reorder.destroy();
    });

    it('does not call onReorder when the clamped drop is the column’s own position', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const reorder = new ColumnReorder(headerRow, onReorder, {
        dragThreshold: 5,
        getPinnedColumns: () => ['col1'],
      });
      reorder.refresh();

      const header = headerRow.querySelector('[data-column="col2"]')!;
      const dragHandle = getDragHandle(header);

      // Start drag on col2 (at position 1) via drag handle
      dragHandle.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 225, // center of col2
          clientY: 16,
          bubbles: true,
          cancelable: true,
        }),
      );

      // Move past threshold to start drag
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 215,
          clientY: 16,
          bubbles: true,
        }),
      );

      // Move to the far left (index 0)
      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 10,
          clientY: 16,
          bubbles: true,
        }),
      );

      // A live drag, so the silence below is the clamp deciding there is
      // nothing to do rather than the drag never having started.
      expect(reorder.isDraggingNow()).toBe(true);

      // Drop
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // col2 is already the first unpinned column, so the clamp sends the drop
      // straight back to where it started. The raw drop index (0) is not the
      // dragged index (1), so only checking after the clamp keeps this from
      // announcing and undo-logging a reorder that reorders nothing.
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
        }),
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        }),
      );

      expect(reorder.isDraggingNow()).toBe(true);

      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(reorder.isDraggingNow()).toBe(false);

      reorder.destroy();
    });
  });

  describe('holding the dragged column', () => {
    /** A `holdColumn` that records what is held right now. */
    function holdRecorder(): {
      holdColumn: (column: string) => () => void;
      held: () => string[];
    } {
      const holds: string[] = [];
      return {
        holdColumn: (column) => {
          holds.push(column);
          return () => {
            const at = holds.indexOf(column);
            if (at >= 0) holds.splice(at, 1);
          };
        },
        held: () => [...holds],
      };
    }

    function press(column: string, clientX = 75): void {
      getDragHandle(headerRow.querySelector(`[data-column="${column}"]`)!).dispatchEvent(
        new MouseEvent('mousedown', { clientX, clientY: 16, bubbles: true, cancelable: true }),
      );
    }

    it('holds the column from the press on its handle to the drop', () => {
      setupHeaders(['col1', 'col2', 'col3']);
      const recorder = holdRecorder();
      const reorder = new ColumnReorder(headerRow, onReorder, {
        dragThreshold: 5,
        holdColumn: recorder.holdColumn,
      });
      reorder.refresh();

      press('col1');
      expect(recorder.held()).toEqual(['col1']);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 16 }));
      expect(reorder.isDraggingNow()).toBe(true);
      expect(recorder.held()).toEqual(['col1']);
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, clientY: 16 }));
      expect(onReorder).toHaveBeenCalledWith(['col2', 'col3', 'col1'], 'col1');
      expect(recorder.held()).toEqual([]);

      reorder.destroy();
    });

    it('lets go on a click that never became a drag, on a second press, and on destroy', () => {
      setupHeaders(['col1', 'col2']);
      const recorder = holdRecorder();
      const reorder = new ColumnReorder(headerRow, onReorder, {
        holdColumn: recorder.holdColumn,
      });
      reorder.refresh();

      press('col1');
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 75, clientY: 16 }));
      expect(recorder.held()).toEqual([]);

      // A press whose release never arrived (lost outside the window), then
      // another: one hold, on the column pressed last.
      press('col1');
      press('col2', 225);
      expect(recorder.held()).toEqual(['col2']);

      reorder.destroy();
      expect(recorder.held()).toEqual([]);
    });
  });

  describe('the header row', () => {
    it('hears a press on a header added after it was made', () => {
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      setupHeaders(['col1', 'col2']);

      getDragHandle(headerRow.querySelector('[data-column="col1"]')!).dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 16 }));
      expect(reorder.isDraggingNow()).toBe(true);
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 90, clientY: 16 }));

      reorder.destroy();
    });

    it('holds the drop indicator only while a drag shows it', () => {
      setupHeaders(['col1', 'col2']);
      const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });
      getDragHandle(headerRow.querySelector('[data-column="col1"]')!).dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 16 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 16 }));
      expect(headerRow.querySelector('.dt-drop-indicator')).not.toBeNull();

      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 16 }));
      // The row outlives renders; left in it, the indicator would be its last
      // child, where `.dt-col-header:last-child` expects the last header.
      expect(headerRow.querySelector('.dt-drop-indicator')).toBeNull();

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
        }),
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        }),
      );

      expect(container.classList.contains('dt-column-dragging')).toBe(true);
      // Critical isolation check: the class must NOT end up on <body>.
      expect(document.body.classList.contains('dt-column-dragging')).toBe(false);

      // End drag
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(container.classList.contains('dt-column-dragging')).toBe(false);

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
        }),
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 85,
          clientY: 16,
          bubbles: true,
        }),
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
        }),
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200,
          clientY: 16,
          bubbles: true,
        }),
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
        }),
      );

      document.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: 200,
          clientY: 16,
          bubbles: true,
        }),
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

describe('ColumnReorder: a release it never hears', () => {
  let root: HTMLDivElement;
  let headerRow: HTMLDivElement;
  let onReorder: ReturnType<typeof vi.fn>;
  let holds: string[];

  beforeEach(() => {
    root = document.createElement('div');
    root.className = 'dt-root';
    headerRow = document.createElement('div');
    headerRow.className = 'dt-header';
    const row = document.createElement('div');
    row.className = 'dt-header-row';
    for (const [i, name] of ['col1', 'col2', 'col3'].entries()) {
      const header = document.createElement('div');
      header.className = 'dt-col-header';
      header.dataset.column = name;
      header.getBoundingClientRect = () =>
        ({
          left: i * 150,
          right: (i + 1) * 150,
          width: 150,
          top: 0,
          bottom: 32,
          height: 32,
        }) as DOMRect;
      const handle = document.createElement('button');
      handle.className = 'dt-col-drag-handle';
      header.appendChild(handle);
      row.appendChild(header);
    }
    headerRow.appendChild(row);
    root.appendChild(headerRow);
    document.body.appendChild(root);
    onReorder = vi.fn();
    holds = [];
  });

  afterEach(() => {
    root.remove();
  });

  function make(): ColumnReorder {
    return new ColumnReorder(headerRow, onReorder, {
      dragThreshold: 5,
      holdColumn: (column) => {
        holds.push(column);
        return () => holds.splice(holds.indexOf(column), 1);
      },
    });
  }

  /** Press col1's handle and drag it past col2's middle. */
  function dragCol1(): void {
    headerRow
      .querySelector('[data-column="col1"] .dt-col-drag-handle')!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 90, clientY: 16 }));
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 240, clientY: 16 }));
  }

  function expectEnded(reorder: ColumnReorder): void {
    expect(reorder.isDraggingNow()).toBe(false);
    expect(root.classList.contains('dt-column-dragging')).toBe(false);
    expect(root.classList.contains('dt-column-potential-drag')).toBe(false);
    expect(headerRow.querySelector('.dt-col-header--dragging')).toBeNull();
    expect(headerRow.querySelector('.dt-drop-indicator')).toBeNull();
    expect(holds).toEqual([]);
    // Nothing is listening any more: a later move, such as a text selection
    // elsewhere, goes ahead, and a release drops nothing.
    const move = new MouseEvent('mousemove', {
      buttons: 1,
      clientX: 400,
      clientY: 16,
      cancelable: true,
    });
    document.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, clientY: 16 }));
    expect(onReorder).not.toHaveBeenCalled();
  }

  it('goes on through a synthetic move with no button held, as a test harness sends', () => {
    // A real move with no button held ends the drag (see the browser test);
    // a synthetic one says nothing about the button, whose `buttons` is 0.
    const reorder = make();
    dragCol1();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 16 }));
    expect(reorder.isDraggingNow()).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3'], 'col1');
    expect(holds).toEqual([]);
    reorder.destroy();
  });

  it.each([
    ['the window loses focus', () => window.dispatchEvent(new Event('blur'))],
    ['the pointer is cancelled', () => document.dispatchEvent(new Event('pointercancel'))],
    [
      'the page is hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        delete (document as { visibilityState?: unknown }).visibilityState;
      },
    ],
  ])('ends the drag without a drop when %s', (_, lose) => {
    const reorder = make();
    dragCol1();
    lose();
    expectEnded(reorder);
    reorder.destroy();
  });

  it('goes on when the page becomes visible, or something else loses focus', () => {
    const reorder = make();
    dragCol1();
    document.dispatchEvent(new Event('visibilitychange'));
    headerRow.querySelector('button')!.dispatchEvent(new Event('blur'));
    expect(reorder.isDraggingNow()).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3'], 'col1');
    reorder.destroy();
  });

  it('ends a press that never became a drag the same way', () => {
    const reorder = make();
    headerRow
      .querySelector('[data-column="col1"] .dt-col-drag-handle')!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 75, clientY: 16, bubbles: true, cancelable: true }),
      );
    expect(root.classList.contains('dt-column-potential-drag')).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expectEnded(reorder);
    reorder.destroy();
  });

  it('drags again on the next press', () => {
    const reorder = make();
    dragCol1();
    window.dispatchEvent(new Event('blur'));
    dragCol1();
    expect(reorder.isDraggingNow()).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3'], 'col1');
    expect(holds).toEqual([]);
    reorder.destroy();
  });
});

describe('ColumnReorder: a scaled host, without a layout', () => {
  it('places the indicator in the header row’s own pixels', () => {
    // Scaled by half: the rects of the row and its headers are halved, its
    // own pixels, in which the indicator is placed, are not.
    const root = document.createElement('div');
    root.className = 'dt-root';
    const headerRow = document.createElement('div');
    headerRow.className = 'dt-header';
    const row = document.createElement('div');
    row.className = 'dt-header-row';
    Object.defineProperty(row, 'offsetWidth', { value: 450, configurable: true });
    row.getBoundingClientRect = () =>
      ({ left: 0, right: 225, width: 225, top: 0, bottom: 16, height: 16 }) as DOMRect;
    for (const [i, name] of ['col1', 'col2', 'col3'].entries()) {
      const header = document.createElement('div');
      header.className = 'dt-col-header';
      header.dataset.column = name;
      header.getBoundingClientRect = () =>
        ({
          left: i * 75,
          right: (i + 1) * 75,
          width: 75,
          top: 0,
          bottom: 16,
          height: 16,
        }) as DOMRect;
      const handle = document.createElement('button');
      handle.className = 'dt-col-drag-handle';
      header.appendChild(handle);
      row.appendChild(header);
    }
    headerRow.appendChild(row);
    root.appendChild(headerRow);
    document.body.appendChild(root);
    const onReorder = vi.fn();
    const reorder = new ColumnReorder(headerRow, onReorder, { dragThreshold: 5 });

    row
      .querySelector('[data-column="col1"] .dt-col-drag-handle')!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 37, clientY: 8, bubbles: true, cancelable: true }),
      );
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 8 }));
    // Past col2's middle: the gap before col3, 150 px on screen, 300 in the row.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 8 }));
    expect(row.querySelector<HTMLElement>('.dt-drop-indicator')!.style.left).toBe('300px');
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 8 }));
    expect(onReorder).toHaveBeenCalledWith(['col2', 'col1', 'col3'], 'col1');

    reorder.destroy();
    root.remove();
  });
});

describe('ColumnReorder: drops from the column layout', () => {
  // c00…c19. c00 (100 px) and c01 (300 px) are pinned, the rest are 100 px
  // wide. The header viewport is 600 px wide and scrolled 1,030 px: the pinned
  // block covers [0, 400) of it, c11 is wholly beneath it, c12 part-hidden
  // (layout 1,400–1,500, on screen 370–470) and c13 the first wholly in view.
  const names = Array.from({ length: 20 }, (_, i) => `c${String(i).padStart(2, '0')}`);
  let root: HTMLDivElement;
  let scroller: HTMLDivElement;
  let headerRow: HTMLDivElement;
  let row: HTMLDivElement;
  let onReorder: ReturnType<typeof vi.fn>;
  let layout: ColumnLayout;

  function scrollTo(left: number): void {
    Object.defineProperty(scroller, 'scrollLeft', { value: left, configurable: true });
    row.getBoundingClientRect = () =>
      ({
        left: -left,
        right: 3_000 - left,
        width: 3_000,
        top: 0,
        bottom: 32,
        height: 32,
      }) as DOMRect;
  }

  beforeEach(() => {
    root = document.createElement('div');
    root.className = 'dt-root';
    scroller = document.createElement('div');
    scroller.className = 'dt-header-scroll';
    Object.defineProperty(scroller, 'clientWidth', { value: 600, configurable: true });
    headerRow = document.createElement('div');
    headerRow.className = 'dt-header';
    row = document.createElement('div');
    row.className = 'dt-header-row';
    for (const name of names) {
      const header = document.createElement('div');
      header.className = 'dt-col-header';
      header.dataset.column = name;
      const handle = document.createElement('button');
      handle.className = 'dt-col-drag-handle';
      header.appendChild(handle);
      row.appendChild(header);
    }
    headerRow.appendChild(row);
    scroller.appendChild(headerRow);
    root.appendChild(scroller);
    document.body.appendChild(root);
    scrollTo(1_030);
    layout = new ColumnLayout({
      visibleColumns: names,
      pinnedColumns: ['c00', 'c01'],
      columnWidths: new Map([...names.map((n): [string, number] => [n, 100]), ['c01', 300]]),
      columnOrder: names,
      schema: names.map((name) => ({ name })),
    });
    onReorder = vi.fn();
  });

  afterEach(() => {
    root.remove();
  });

  /** Drag `column` by its handle to `clientX`, and report the indicator's left edge. */
  function drag(reorder: ColumnReorder, column: string, clientX: number): number {
    row
      .querySelector(`[data-column="${column}"] .dt-col-drag-handle`)!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 500, clientY: 16, bubbles: true, cancelable: true }),
      );
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX: 520, clientY: 16 }));
    document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX, clientY: 16 }));
    // The indicator's `left` is in the row's coordinates; back to the screen's.
    const left = parseFloat(row.querySelector<HTMLElement>('.dt-drop-indicator')!.style.left);
    return left + row.getBoundingClientRect().left;
  }

  function make(): ColumnReorder {
    return new ColumnReorder(headerRow, onReorder, {
      dragThreshold: 5,
      getPinnedColumns: () => ['c00', 'c01'],
      getLayout: () => layout,
    });
  }

  /** `names` with `column` moved to before `before`. */
  function moved(column: string, before: string): string[] {
    const order = names.filter((n) => n !== column);
    order.splice(order.indexOf(before), 0, column);
    return order;
  }

  it('drops an unpinned column let go on the pinned block beside it, not beneath it', () => {
    const reorder = make();
    // The right half of c01, over c11's middle (layout 1,350, on screen 320).
    expect(drag(reorder, 'c15', 330)).toBe(400);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 330, clientY: 16 }));
    // Before c12, the first unpinned column in view, part-hidden at the edge.
    expect(onReorder).toHaveBeenCalledWith(moved('c15', 'c12'), 'c15');
    reorder.destroy();
  });

  it('drops anywhere on the pinned block at its edge', () => {
    const reorder = make();
    expect(drag(reorder, 'c15', 20)).toBe(400);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 20, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c15', 'c12'), 'c15');
    reorder.destroy();
  });

  it('finds the column under the pointer from the layout and the scroll', () => {
    const reorder = make();
    // Layout 1,551: past c13's middle, before c14's.
    expect(drag(reorder, 'c17', 521)).toBe(570);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 521, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c14'), 'c17');
    reorder.destroy();
  });

  it('drops before the part-hidden column at the edge when the pointer is on its visible half', () => {
    const reorder = make();
    // Layout 1,440: c12's first half, which is on screen right of the block.
    expect(drag(reorder, 'c15', 410)).toBe(400);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 410, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c15', 'c12'), 'c15');
    reorder.destroy();
  });

  it('keeps the indicator inside the viewport', () => {
    scrollTo(1_080);
    const reorder = make();
    // The viewport's right edge is layout 1,680, past c14's middle: the gap
    // after c14 is beyond it, so the indicator stops at the edge.
    expect(drag(reorder, 'c17', 5_000)).toBe(600);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 5_000, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c15'), 'c17');
    reorder.destroy();
  });

  it('keeps the pointer inside the viewport', () => {
    const reorder = make();
    // Far right of the viewport: its right edge, layout 1,630, before c14's middle.
    expect(drag(reorder, 'c17', 5_000)).toBe(570);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 5_000, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c14'), 'c17');
    reorder.destroy();
  });

  it('does not move a pinned column', () => {
    const reorder = make();
    row
      .querySelector('[data-column="c01"] .dt-col-drag-handle')!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 150, clientY: 16, bubbles: true, cancelable: true }),
      );
    for (const clientX of [170, 20, 521]) {
      document.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, clientX, clientY: 16 }));
      expect(row.querySelector('.dt-drop-indicator')).toBeNull();
    }
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 521, clientY: 16 }));
    expect(onReorder).not.toHaveBeenCalled();
    reorder.destroy();
  });

  it('reads a scaled header row in its own pixels', () => {
    // Scaled by half, as by a transform or CSS zoom on an ancestor: rects
    // are halved, scroll positions and the layout's widths are not.
    Object.defineProperty(row, 'offsetWidth', { value: 3_000, configurable: true });
    row.getBoundingClientRect = () =>
      ({ left: -515, right: 985, width: 1_500, top: 0, bottom: 16, height: 16 }) as DOMRect;
    const reorder = make();
    // 260.5 on screen is 521 into the viewport: before c14's middle.
    drag(reorder, 'c17', 260.5);
    expect(row.querySelector<HTMLElement>('.dt-drop-indicator')!.style.left).toBe('1600px');
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 260.5, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c14'), 'c17');
    reorder.destroy();
  });

  it('counts a column whose right edge is at the pinned block’s as beneath it', () => {
    scrollTo(1_100);
    const reorder = make();
    // c12 ends at layout 1,500, on screen at the block's edge: c13 is first.
    expect(drag(reorder, 'c15', 330)).toBe(400);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 330, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c15', 'c13'), 'c15');
    reorder.destroy();
  });

  it('takes the new order from the layout, whatever headers the row holds', () => {
    // A row that holds only some headers, as a windowed one would.
    for (const name of ['c03', 'c04', 'c05', 'c06'])
      row.querySelector(`[data-column="${name}"]`)!.remove();
    const reorder = make();
    expect(drag(reorder, 'c17', 521)).toBe(570);
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 521, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c14'), 'c17');
    reorder.destroy();
  });

  it('moves the drop with the header scroll', () => {
    const reorder = make();
    expect(drag(reorder, 'c17', 521)).toBe(570);
    // 200 px further: layout 1,751, past c15's middle.
    scrollTo(1_230);
    scroller.dispatchEvent(new Event('scroll'));
    expect(parseFloat(row.querySelector<HTMLElement>('.dt-drop-indicator')!.style.left)).toBe(
      1_800,
    );
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 521, clientY: 16 }));
    expect(onReorder).toHaveBeenCalledWith(moved('c17', 'c16'), 'c17');
    reorder.destroy();
  });
});

describe('clampUnpinnedIndex', () => {
  // The presented order a drop is spliced into, with the moved column already
  // removed — the shape endDrag() and the keyboard move both hand in.
  const columns = ['id', 'name', 'qty'];

  it('lifts an index inside the pinned block up to the first unpinned position', () => {
    expect(clampUnpinnedIndex(0, columns, ['id'])).toBe(1);
    expect(clampUnpinnedIndex(0, columns, ['id', 'name'])).toBe(2);
    expect(clampUnpinnedIndex(1, columns, ['id', 'name'])).toBe(2);
  });

  it('clamps an index past the end down to the column count', () => {
    expect(clampUnpinnedIndex(9, columns, ['id'])).toBe(3);
  });

  it('passes an index that is already valid through untouched', () => {
    expect(clampUnpinnedIndex(1, columns, ['id'])).toBe(1);
    expect(clampUnpinnedIndex(2, columns, ['id'])).toBe(2);
    // columns.length is the append-at-the-end slot, not out of range.
    expect(clampUnpinnedIndex(3, columns, ['id'])).toBe(3);
  });

  it('clamps nothing when no column is pinned', () => {
    expect(clampUnpinnedIndex(0, columns, [])).toBe(0);
    expect(clampUnpinnedIndex(2, columns, [])).toBe(2);
  });

  it('sends every drop to the end when every column is pinned', () => {
    // The pinned prefix is the whole array, so the only position left that
    // does not split the pinned block is after all of it.
    expect(clampUnpinnedIndex(0, columns, columns)).toBe(3);
    expect(clampUnpinnedIndex(2, columns, columns)).toBe(3);
  });
});
