/**
 * Tests for ColumnReorder
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('ColumnReorder — a windowed header row', () => {
  // Since the header row is windowed, the DOM holds a *slice* of the presented
  // order: a scrolled table at 60 columns mounts roughly 17 of them. Every
  // number `endDrag` works with — the dragged column's index, the drop index,
  // the array it splices — used to come off that DOM and be treated as global,
  // which is only true while every column is mounted.
  let container: HTMLDivElement;
  let headerRow: HTMLDivElement;
  let onReorder: ReturnType<typeof vi.fn>;

  /** The whole table. Only `mounted` of these are in the DOM. */
  const ALL = Array.from({ length: 60 }, (_, i) => `col_${i}`);
  const MOUNTED = ALL.slice(20, 44);

  function header(columnName: string, slot: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'dt-col-header';
    el.setAttribute('data-column', columnName);
    const handle = document.createElement('button');
    handle.className = 'dt-col-drag-handle';
    handle.type = 'button';
    el.appendChild(handle);
    // Laid out from the left edge of the viewport, the way a scrolled window
    // actually paints: the first *mounted* header sits at x=0, not the first
    // column of the table.
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        left: slot * 150,
        right: (slot + 1) * 150,
        width: 150,
        top: 0,
        bottom: 32,
        height: 32,
      }),
      configurable: true,
    });
    return el;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.className = 'dt-root';
    document.body.appendChild(container);
    headerRow = document.createElement('div');
    headerRow.className = 'dt-header';
    container.appendChild(headerRow);
    Object.defineProperty(headerRow, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 3600, width: 3600, top: 0, bottom: 32, height: 32 }),
      configurable: true,
    });

    const inner = document.createElement('div');
    inner.className = 'dt-header-row';
    // `[left spacer][mounted headers][right spacer]`, spacers included so the
    // element walk has to skip them the way the real row does.
    const left = document.createElement('div');
    left.className = 'dt-col-spacer';
    left.setAttribute('data-col-spacer', 'left');
    inner.appendChild(left);
    MOUNTED.forEach((name, i) => inner.appendChild(header(name, i)));
    const right = document.createElement('div');
    right.className = 'dt-col-spacer';
    right.setAttribute('data-col-spacer', 'right');
    inner.appendChild(right);
    headerRow.appendChild(inner);

    onReorder = vi.fn();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /** Drag `column` from its slot to just past `toSlot`. */
  function drag(column: string, fromSlot: number, toSlot: number): void {
    const el = headerRow.querySelector(`[data-column="${column}"]`)!;
    el.querySelector('.dt-col-drag-handle')!.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: fromSlot * 150 + 75,
        clientY: 16,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: fromSlot * 150 + 85, clientY: 16, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: toSlot * 150 + 149, clientY: 16, bubbles: true }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }

  it('moves one column and leaves the other 59 where they were', () => {
    const reorder = new ColumnReorder(headerRow, onReorder, {
      getVisibleColumns: () => ALL,
    });
    reorder.refresh();

    // Drag the first mounted header (col_20) three slots right.
    drag('col_20', 0, 3);

    expect(onReorder).toHaveBeenCalledTimes(1);
    const [newOrder, moved] = onReorder.mock.calls[0]!;
    expect(moved).toBe('col_20');

    // The whole table comes back, not the mounted slice — anything less and
    // `setColumnOrder`'s missing-column merge re-splices the other 36.
    expect(newOrder).toHaveLength(ALL.length);
    expect([...newOrder].sort()).toEqual([...ALL].sort());

    // Exactly one column moved. Everything before the window and everything
    // after it is untouched, and inside the window only the span between the
    // two positions shifts by one. The pointer finished past `col_23`'s
    // midpoint, so the drop lands after it — in front of `col_24`.
    const expected = ALL.filter((c) => c !== 'col_20');
    expected.splice(expected.indexOf('col_24'), 0, 'col_20');
    expect(newOrder).toEqual(expected);
  });

  it('keeps a drop past the last mounted header inside the window', () => {
    const reorder = new ColumnReorder(headerRow, onReorder, {
      getVisibleColumns: () => ALL,
    });
    reorder.refresh();

    // Drop beyond the right-hand edge of the mounted run. The intent is "after
    // the last header I can see", which is col_43 — not "at the end of the
    // table", which the user cannot see and did not ask for.
    drag('col_20', 0, MOUNTED.length + 4);

    const [newOrder] = onReorder.mock.calls[0]!;
    expect(newOrder).toHaveLength(ALL.length);
    expect(newOrder.indexOf('col_20')).toBe(ALL.indexOf('col_43'));
    expect(newOrder[newOrder.length - 1]).toBe('col_59');
  });

  it('falls back to the mounted order when no accessor is supplied', () => {
    // Standalone `/advanced` use, where the caller owns the header row and
    // every column in it is mounted. The DOM is the order there, and this is
    // the behaviour that shipped before the header row was windowed.
    const reorder = new ColumnReorder(headerRow, onReorder);
    reorder.refresh();

    drag('col_20', 0, 3);

    const [newOrder] = onReorder.mock.calls[0]!;
    expect(newOrder).toHaveLength(MOUNTED.length);
    expect(newOrder[0]).toBe('col_21');
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
