/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AddColumnButton } from '@/derived/AddColumnButton';

describe('AddColumnButton', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates a button element with the correct class', () => {
    const btn = new AddColumnButton();
    const el = btn.getElement();
    expect(el.tagName).toBe('BUTTON');
    expect(el.classList.contains('dt-add-column-btn')).toBe(true);
    btn.destroy();
  });

  it('uses custom classPrefix', () => {
    const btn = new AddColumnButton({ classPrefix: 'my' });
    const el = btn.getElement();
    expect(el.classList.contains('my-add-column-btn')).toBe(true);
    btn.destroy();
  });

  it('has correct aria-label and title', () => {
    const btn = new AddColumnButton();
    const el = btn.getElement();
    expect(el.getAttribute('aria-label')).toBe('Add derived column');
    expect(el.getAttribute('title')).toBe('Add derived column');
    btn.destroy();
  });

  it('has type="button"', () => {
    const btn = new AddColumnButton();
    const el = btn.getElement() as HTMLButtonElement;
    expect(el.type).toBe('button');
    btn.destroy();
  });

  it('contains an SVG icon', () => {
    const btn = new AddColumnButton();
    const svg = btn.getElement().querySelector('svg');
    expect(svg).not.toBeNull();
    btn.destroy();
  });

  it('fires onClick callback when clicked', () => {
    const onClick = vi.fn();
    const btn = new AddColumnButton({ onClick });
    container.appendChild(btn.getElement());

    btn.getElement().click();
    expect(onClick).toHaveBeenCalledTimes(1);

    btn.destroy();
  });

  it('does not fire onClick after destroy', () => {
    const onClick = vi.fn();
    const btn = new AddColumnButton({ onClick });
    container.appendChild(btn.getElement());

    btn.destroy();
    btn.getElement().click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('destroy removes element from parent', () => {
    const btn = new AddColumnButton();
    container.appendChild(btn.getElement());
    expect(container.children.length).toBe(1);

    btn.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy is safe to call multiple times', () => {
    const btn = new AddColumnButton();
    container.appendChild(btn.getElement());
    btn.destroy();
    btn.destroy(); // should not throw
    expect(container.children.length).toBe(0);
  });
});
