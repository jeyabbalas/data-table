/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ColumnHeaderTooltipPopover } from '@/table/ColumnHeaderTooltipPopover';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';

describe('ColumnHeaderTooltipPopover — structure & lifecycle', () => {
  let popover: ColumnHeaderTooltipPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    anchor.setAttribute('tabindex', '0');
    anchor.style.position = 'absolute';
    anchor.style.top = '100px';
    anchor.style.left = '100px';
    anchor.style.width = '120px';
    anchor.style.height = '32px';
    document.body.appendChild(anchor);
    popover = new ColumnHeaderTooltipPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  it('does not create a DOM element until first show()', () => {
    expect(portal.querySelector('.dt-col-tooltip')).toBe(null);
    expect(popover.getElement()).toBe(null);
  });

  it('show() with title + description + items renders all sections', () => {
    popover.show(anchor, {
      title: 'Total fare',
      description: 'Sum of fare components.',
      items: [
        { label: 'Units', value: 'USD' },
        { label: 'Components', value: ['fare', 'tip'] },
      ],
    });

    const root = portal.querySelector('.dt-col-tooltip') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.display).toBe('block');
    expect(root.getAttribute('role')).toBe('tooltip');
    expect(root.getAttribute('aria-live')).toBe('polite');

    const titleEl = root.querySelector('.dt-col-tooltip__title') as HTMLElement;
    expect(titleEl?.textContent).toBe('Total fare');

    const descEl = root.querySelector('.dt-col-tooltip__description') as HTMLElement;
    expect(descEl?.textContent).toBe('Sum of fare components.');

    const items = root.querySelectorAll('.dt-col-tooltip__item');
    expect(items.length).toBe(2);

    expect(items[0].querySelector('.dt-col-tooltip__item-label')?.textContent).toBe('Units');
    expect(items[0].querySelector('.dt-col-tooltip__item-value')?.textContent).toBe('USD');

    expect(items[1].querySelector('.dt-col-tooltip__item-label')?.textContent).toBe('Components');
    const chips = items[1].querySelectorAll('.dt-col-tooltip__chip');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toBe('fare');
    expect(chips[1].textContent).toBe('tip');
  });

  it('show() with only title renders only the title', () => {
    popover.show(anchor, { title: 'Only title' });
    const root = portal.querySelector('.dt-col-tooltip') as HTMLElement;
    expect(root.querySelector('.dt-col-tooltip__title')?.textContent).toBe('Only title');
    expect(root.querySelector('.dt-col-tooltip__description')).toBe(null);
    expect(root.querySelector('.dt-col-tooltip__items')).toBe(null);
  });

  it('show() with empty content (no fields) is a hide()', () => {
    popover.show(anchor, { title: 'first' });
    expect(popover.isOpen()).toBe(true);

    popover.show(anchor, {});
    expect(popover.isOpen()).toBe(false);
  });

  it('writes aria-describedby on anchor on show; clears on hide', () => {
    popover.show(anchor, { description: 'D' });
    expect(anchor.getAttribute('aria-describedby')).toBe(popover.getId());

    popover.hide();
    expect(anchor.getAttribute('aria-describedby')).toBe(null);
  });

  it('hide() is idempotent', () => {
    popover.show(anchor, { description: 'D' });
    popover.hide();
    expect(() => popover.hide()).not.toThrow();
    expect(popover.isOpen()).toBe(false);
  });

  it('refresh() updates DOM in place when shown for the same anchor', () => {
    popover.show(anchor, { description: 'first' });
    const elFirst = popover.getElement();
    expect(elFirst?.querySelector('.dt-col-tooltip__description')?.textContent).toBe('first');

    popover.refresh(anchor, { description: 'second' });
    const elSecond = popover.getElement();
    expect(elSecond).toBe(elFirst); // same element instance
    expect(elSecond?.querySelector('.dt-col-tooltip__description')?.textContent).toBe('second');
  });

  it('refresh() with empty content hides; refresh() against a different anchor is a no-op', () => {
    popover.show(anchor, { description: 'first' });
    expect(popover.isOpen()).toBe(true);

    const otherAnchor = document.createElement('div');
    document.body.appendChild(otherAnchor);
    popover.refresh(otherAnchor, { description: 'never' });
    // Still showing the original anchor's content
    expect(popover.isOpen()).toBe(true);
    expect(popover.getElement()?.querySelector('.dt-col-tooltip__description')?.textContent).toBe(
      'first',
    );

    popover.refresh(anchor, {});
    expect(popover.isOpen()).toBe(false);
    otherAnchor.remove();
  });

  it('refresh() before any show is a no-op', () => {
    popover.refresh(anchor, { description: 'D' });
    expect(popover.getElement()).toBe(null);
    expect(popover.isOpen()).toBe(false);
  });

  it('Escape key on document hides the popover', () => {
    popover.show(anchor, { description: 'D' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(popover.isOpen()).toBe(false);
  });

  it('outside pointerdown hides the popover', () => {
    popover.show(anchor, { description: 'D' });
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(false);
    outside.remove();
  });

  it('pointerdown on the anchor does NOT hide', () => {
    popover.show(anchor, { description: 'D' });
    anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(true);
  });

  it('window scroll hides the popover', () => {
    popover.show(anchor, { description: 'D' });
    window.dispatchEvent(new Event('scroll'));
    expect(popover.isOpen()).toBe(false);
  });

  it('window resize hides the popover', () => {
    popover.show(anchor, { description: 'D' });
    window.dispatchEvent(new Event('resize'));
    expect(popover.isOpen()).toBe(false);
  });

  it('inherits color-scheme from anchor ancestors', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-dt-color-scheme', 'dark');
    document.body.appendChild(wrapper);
    wrapper.appendChild(anchor);

    popover.show(anchor, { description: 'D' });
    expect(popover.getElement()?.getAttribute('data-dt-color-scheme')).toBe('dark');

    wrapper.remove();
    document.body.appendChild(anchor); // reattach for cleanup
  });

  it('destroy() removes the element and subsequent show() is a no-op', () => {
    popover.show(anchor, { description: 'D' });
    popover.destroy();
    expect(portal.querySelector('.dt-col-tooltip')).toBe(null);
    popover.show(anchor, { description: 'after-destroy' });
    expect(portal.querySelector('.dt-col-tooltip')).toBe(null);
  });
});

describe('ColumnHeaderTooltipPopover — XSS safety (textContent only)', () => {
  let popover: ColumnHeaderTooltipPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    popover = new ColumnHeaderTooltipPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  it('does not parse HTML in title, description, or items', () => {
    popover.show(anchor, {
      title: '<img src=x onerror=alert(1)>',
      description: '<script>alert(2)</script>',
      items: [
        { label: '<b>label</b>', value: '<i>val</i>' },
        { label: 'enum', value: ['<svg/>', '<iframe>'] },
      ],
    });
    const root = popover.getElement() as HTMLElement;
    expect(root).toBeTruthy();

    // No injected elements anywhere in the popover subtree.
    for (const tag of ['img', 'script', 'b', 'i', 'svg', 'iframe']) {
      expect(root.querySelectorAll(tag).length).toBe(0);
    }

    // The literal strings appear via textContent.
    expect(root.querySelector('.dt-col-tooltip__title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(root.querySelector('.dt-col-tooltip__description')?.textContent).toBe(
      '<script>alert(2)</script>',
    );
    const labels = root.querySelectorAll('.dt-col-tooltip__item-label');
    expect(labels[0].textContent).toBe('<b>label</b>');
    expect(labels[1].textContent).toBe('enum');
    expect(root.querySelector('.dt-col-tooltip__item-value')?.textContent).toBe('<i>val</i>');
    const chips = root.querySelectorAll('.dt-col-tooltip__chip');
    expect(chips[0].textContent).toBe('<svg/>');
    expect(chips[1].textContent).toBe('<iframe>');
  });
});

describe('ColumnHeaderTooltipPopover — modal-open dismissal', () => {
  let popover: ColumnHeaderTooltipPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    __resetModalHostForTests();
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    anchor.setAttribute('tabindex', '0');
    document.body.appendChild(anchor);
    popover = new ColumnHeaderTooltipPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
    __resetModalHostForTests();
  });

  it('hides when any ModalHost opens (panel mode)', () => {
    popover.show(anchor, { description: 'D' });
    expect(popover.isOpen()).toBe(true);

    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel });

    expect(popover.isOpen()).toBe(false);
    host.close();
    panel.remove();
  });

  it('unsubscribes on destroy — modal opens after destroy do not throw', () => {
    popover.destroy();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    expect(() => host.open({ mode: 'panel', element: panel })).not.toThrow();
    host.close();
    panel.remove();
  });
});
