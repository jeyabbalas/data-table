/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RovingTabindex } from '@/core/RovingTabindex';

/**
 * jsdom cannot observe sequential focus navigation, so nothing here can prove
 * a tab-stop count. Everything is asserted on `tabindex` attribute values,
 * `document.activeElement` and `defaultPrevented` instead — the three things
 * the roving pattern is actually made of.
 */

/** A toolbar with `count` buttons, attached so `focus()` works in jsdom. */
function makeToolbar(count: number): { toolbar: HTMLElement; buttons: HTMLButtonElement[] } {
  const toolbar = document.createElement('div');
  toolbar.setAttribute('role', 'toolbar');
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < count; i++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `control ${i}`;
    toolbar.appendChild(button);
    buttons.push(button);
  }
  document.body.appendChild(toolbar);
  return { toolbar, buttons };
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function tabindexes(toolbar: HTMLElement): (string | null)[] {
  return Array.from(toolbar.querySelectorAll('button')).map((b) => b.getAttribute('tabindex'));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RovingTabindex', () => {
  it('parks tabindex="0" on the first control and -1 on the rest', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);

    expect(tabindexes(toolbar)).toEqual(['0', '-1', '-1']);
    expect(roving.getActiveControl()).toBe(buttons[0]);

    roving.destroy();
  });

  it('moves the stop and DOM focus with ArrowRight / ArrowLeft', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);

    buttons[0]!.focus();
    press(buttons[0]!, 'ArrowRight');

    expect(tabindexes(toolbar)).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(buttons[1]);

    press(buttons[1]!, 'ArrowLeft');

    expect(tabindexes(toolbar)).toEqual(['0', '-1', '-1']);
    expect(document.activeElement).toBe(buttons[0]);

    roving.destroy();
  });

  it('claims the arrow keys so they cannot also drive the grid cursor', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);
    const onAncestorKey = vi.fn();
    document.body.addEventListener('keydown', onAncestorKey);

    buttons[0]!.focus();
    const event = press(buttons[0]!, 'ArrowRight');

    expect(event.defaultPrevented).toBe(true);
    expect(onAncestorKey).not.toHaveBeenCalled();

    document.body.removeEventListener('keydown', onAncestorKey);
    roving.destroy();
  });

  it('jumps to first / last with Home and End', () => {
    const { toolbar, buttons } = makeToolbar(4);
    const roving = new RovingTabindex(toolbar);

    buttons[0]!.focus();
    press(buttons[0]!, 'End');
    expect(document.activeElement).toBe(buttons[3]);
    expect(tabindexes(toolbar)).toEqual(['-1', '-1', '-1', '0']);

    press(buttons[3]!, 'Home');
    expect(document.activeElement).toBe(buttons[0]);
    expect(tabindexes(toolbar)).toEqual(['0', '-1', '-1', '-1']);

    roving.destroy();
  });

  it('wraps at both ends', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);

    buttons[0]!.focus();
    press(buttons[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[2]);

    press(buttons[2]!, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[0]);

    roving.destroy();
  });

  it('ignores the vertical arrows when horizontal, and both when orientation is "both"', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const horizontal = new RovingTabindex(toolbar, { orientation: 'horizontal' });

    buttons[0]!.focus();
    const ignored = press(buttons[0]!, 'ArrowDown');
    expect(ignored.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);
    horizontal.destroy();

    const both = new RovingTabindex(toolbar, { orientation: 'both' });
    press(buttons[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1]!, 'ArrowUp');
    expect(document.activeElement).toBe(buttons[0]);
    both.destroy();
  });

  it('skips disabled, aria-disabled and hidden controls when moving', () => {
    const { toolbar, buttons } = makeToolbar(5);
    buttons[1]!.disabled = true;
    buttons[2]!.setAttribute('aria-disabled', 'true');
    buttons[3]!.style.display = 'none';
    const roving = new RovingTabindex(toolbar);

    expect(roving.getControls()).toEqual([buttons[0], buttons[4]]);

    buttons[0]!.focus();
    press(buttons[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(buttons[4]);

    // The skipped controls are still swept to -1: a control left holding
    // tabindex="0" would become a second tab stop once it is re-enabled.
    expect(tabindexes(toolbar)).toEqual(['-1', '-1', '-1', '-1', '0']);

    roving.destroy();
  });

  it('never preventDefaults Tab or Shift+Tab', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);
    const onAncestorKey = vi.fn();
    document.body.addEventListener('keydown', onAncestorKey);

    buttons[1]!.focus();
    const tab = press(buttons[1]!, 'Tab');
    const shiftTab = press(buttons[1]!, 'Tab', { shiftKey: true });

    expect(tab.defaultPrevented).toBe(false);
    expect(shiftTab.defaultPrevented).toBe(false);
    // Not swallowed either — Tab has to reach the browser untouched.
    expect(onAncestorKey).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(buttons[1]);

    document.body.removeEventListener('keydown', onAncestorKey);
    roving.destroy();
  });

  it('lets modifier chords bubble so the table-wide shortcuts keep working', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);
    const onAncestorKey = vi.fn();
    document.body.addEventListener('keydown', onAncestorKey);

    buttons[0]!.focus();
    const undo = press(buttons[0]!, 'z', { ctrlKey: true });

    expect(undo.defaultPrevented).toBe(false);
    expect(onAncestorKey).toHaveBeenCalledTimes(1);

    document.body.removeEventListener('keydown', onAncestorKey);
    roving.destroy();
  });

  it('leaves arrow keys alone inside a text field', () => {
    const { toolbar, buttons } = makeToolbar(2);
    const input = document.createElement('input');
    input.type = 'text';
    toolbar.appendChild(input);
    const roving = new RovingTabindex(toolbar);

    input.focus();
    const event = press(input, 'ArrowRight');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    // The input is a control like any other — focusing it took the stop — but
    // its arrow keys stay its own.
    expect(roving.getActiveControl()).toBe(input);
    expect(buttons[0]!.getAttribute('tabindex')).toBe('-1');

    roving.destroy();
  });

  it('ignores keystrokes from descendants it does not manage', () => {
    const { toolbar } = makeToolbar(2);
    const label = document.createElement('span');
    toolbar.appendChild(label);
    const roving = new RovingTabindex(toolbar);

    const event = press(label, 'ArrowRight');

    expect(event.defaultPrevented).toBe(false);
    expect(tabindexes(toolbar)).toEqual(['0', '-1']);

    roving.destroy();
  });

  it('adopts the control a click focused', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);

    buttons[2]!.focus();

    expect(roving.getActiveControl()).toBe(buttons[2]);
    expect(tabindexes(toolbar)).toEqual(['-1', '-1', '0']);

    roving.destroy();
  });

  describe('refresh() after a re-render', () => {
    it('keeps the stop when the active control survived', () => {
      const { toolbar, buttons } = makeToolbar(3);
      const roving = new RovingTabindex(toolbar);

      buttons[1]!.focus();
      const extra = document.createElement('button');
      toolbar.appendChild(extra);
      roving.refresh();

      expect(roving.getActiveControl()).toBe(buttons[1]);
      expect(tabindexes(toolbar)).toEqual(['-1', '0', '-1', '-1']);

      roving.destroy();
    });

    it('falls back to the first control when the active one is gone', () => {
      const { toolbar, buttons } = makeToolbar(3);
      const roving = new RovingTabindex(toolbar);

      buttons[2]!.focus();
      buttons[2]!.remove();
      roving.refresh();

      expect(roving.getActiveControl()).toBe(buttons[0]);
      expect(tabindexes(toolbar)).toEqual(['0', '-1']);

      roving.destroy();
    });

    it('restores DOM focus when the rebuild left focus nowhere', () => {
      const { toolbar, buttons } = makeToolbar(3);
      const roving = new RovingTabindex(toolbar);

      buttons[2]!.focus();
      buttons[2]!.remove();
      // jsdom drops focus to <body> when the focused node leaves the tree,
      // exactly like a browser.
      expect(toolbar.contains(document.activeElement)).toBe(false);

      roving.refresh({ restoreFocus: true });

      expect(document.activeElement).toBe(buttons[0]);

      roving.destroy();
    });

    it('does not steal focus that is still inside the toolbar', () => {
      const { toolbar, buttons } = makeToolbar(3);
      const roving = new RovingTabindex(toolbar);

      buttons[1]!.focus();
      buttons[2]!.remove();
      roving.refresh({ restoreFocus: true });

      expect(document.activeElement).toBe(buttons[1]);
      expect(roving.getActiveControl()).toBe(buttons[1]);

      roving.destroy();
    });

    it('leaves no stop at all when the toolbar has no navigable control', () => {
      const { toolbar, buttons } = makeToolbar(2);
      const roving = new RovingTabindex(toolbar);

      buttons[0]!.style.display = 'none';
      buttons[1]!.style.display = 'none';
      roving.refresh();

      expect(roving.getActiveControl()).toBeNull();
      expect(tabindexes(toolbar)).toEqual(['-1', '-1']);

      roving.destroy();
    });
  });

  it('stops handling keys after destroy()', () => {
    const { toolbar, buttons } = makeToolbar(3);
    const roving = new RovingTabindex(toolbar);

    buttons[0]!.focus();
    roving.destroy();
    const event = press(buttons[0]!, 'ArrowRight');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);

    roving.destroy();
  });
});
