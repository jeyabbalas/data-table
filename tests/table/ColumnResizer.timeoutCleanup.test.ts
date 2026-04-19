/**
 * @vitest-environment jsdom
 *
 * Phase 2: the 250ms setTimeout fallback used to clear the reset-animation
 * class must not fire after detach(), otherwise it leaks timers and can
 * mutate a DOM node that's been torn down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnResizer } from '@/table/ColumnResizer';

describe('ColumnResizer — setTimeout cleanup on detach (Phase 2)', () => {
  let container: HTMLDivElement;
  let header: HTMLDivElement;
  let onResize: ReturnType<typeof vi.fn>;
  let onReset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    header = document.createElement('div');
    header.className = 'dt-col-header';
    header.style.width = '150px';
    container.appendChild(header);
    onResize = vi.fn();
    onReset = vi.fn();
    Object.defineProperty(header, 'offsetWidth', {
      value: 150,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(container);
  });

  it('clears the pending setTimeout when detach() fires mid-animation', () => {
    const resizer = new ColumnResizer(header, onResize, onReset);

    // Kick off a reset animation (dblclick path).
    const handle = header.querySelector('.dt-col-resize-handle') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    // The resetting class should be applied.
    expect(header.classList.contains('dt-col-resetting')).toBe(true);

    // Detach BEFORE the 250ms fallback fires.
    resizer.detach();

    // Spy on classList.remove to prove the fallback does NOT touch the DOM.
    const removeSpy = vi.spyOn(header.classList, 'remove');

    // Advance past the fallback window.
    vi.advanceTimersByTime(500);

    // detach() cleared the timeout — no class mutation after detach.
    expect(removeSpy).not.toHaveBeenCalled();

    removeSpy.mockRestore();
  });

  it('setTimeout fires normally if detach() is not called', () => {
    const resizer = new ColumnResizer(header, onResize, onReset);

    const handle = header.querySelector('.dt-col-resize-handle') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(header.classList.contains('dt-col-resetting')).toBe(true);

    // Neither transitionend nor detach — only the setTimeout fallback runs.
    vi.advanceTimersByTime(260);

    expect(header.classList.contains('dt-col-resetting')).toBe(false);
    resizer.detach();
  });

  it('does not double-clean when both transitionend and setTimeout would fire', () => {
    const resizer = new ColumnResizer(header, onResize, onReset);

    const removeSpy = vi.spyOn(header.classList, 'remove');

    const handle = header.querySelector('.dt-col-resize-handle') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    // transitionend fires first.
    header.dispatchEvent(new Event('transitionend'));
    const afterTransitionCount = removeSpy.mock.calls.filter(
      ([cls]) => cls === 'dt-col-resetting',
    ).length;

    vi.advanceTimersByTime(500);

    const finalCount = removeSpy.mock.calls.filter(
      ([cls]) => cls === 'dt-col-resetting',
    ).length;
    // The setTimeout fallback was canceled by the transitionend cleanup,
    // so no additional removes occur.
    expect(finalCount).toBe(afterTransitionCount);

    removeSpy.mockRestore();
    resizer.detach();
  });
});
