/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { maxSeverity, severityRank } from '@/annotations/severity';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';
import type { Annotation } from '@/annotations/types';

function makeAnn(
  overrides: Partial<Annotation> & Pick<Annotation, 'scope' | 'severity' | 'message'>,
): Annotation {
  const base = {
    id: `ann_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
  if (base.scope === 'row')
    return {
      ...base,
      rowId: 'rowId' in base ? (base as { rowId: number }).rowId : 0,
    } as Annotation;
  if (base.scope === 'column')
    return {
      ...base,
      column: 'column' in base ? (base as { column: string }).column : 'col',
    } as Annotation;
  return {
    ...base,
    rowId: 'rowId' in base ? (base as { rowId: number }).rowId : 0,
    column: 'column' in base ? (base as { column: string }).column : 'col',
  } as Annotation;
}

describe('severity helpers', () => {
  it('severityRank orders error < warning < info', () => {
    expect(severityRank('error')).toBeLessThan(severityRank('warning'));
    expect(severityRank('warning')).toBeLessThan(severityRank('info'));
  });

  it('maxSeverity returns null for empty input', () => {
    expect(maxSeverity([])).toBe(null);
  });

  it('maxSeverity picks the highest (lowest rank) severity', () => {
    const a = makeAnn({ scope: 'row', severity: 'info', message: 'a' });
    const b = makeAnn({ scope: 'row', severity: 'warning', message: 'b' });
    const c = makeAnn({ scope: 'row', severity: 'error', message: 'c' });
    expect(maxSeverity([a])).toBe('info');
    expect(maxSeverity([a, b])).toBe('warning');
    expect(maxSeverity([a, b, c])).toBe('error');
    expect(maxSeverity([c, a])).toBe('error');
  });
});

describe('AnnotationPopover', () => {
  let popover: AnnotationPopover;
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
    popover = new AnnotationPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  it('creates no DOM until show() is first called', () => {
    expect(portal.querySelector('.dt-annotation-popover')).toBe(null);
  });

  it('show() populates the popover with scoped groups in Row/Column/Cell order', () => {
    const anns: Annotation[] = [
      makeAnn({ scope: 'column', column: 'x', severity: 'error', message: 'col-err' }),
      makeAnn({ scope: 'row', rowId: 1, severity: 'warning', message: 'row-warn' }),
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'cell-info' }),
    ];
    popover.show(anchor, anns);

    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.display).toBe('block');

    const groups = root.querySelectorAll('section.dt-annotation-popover__group');
    expect(groups.length).toBe(3);
    expect(groups[0].classList.contains('dt-annotation-popover__group--row')).toBe(true);
    expect(groups[1].classList.contains('dt-annotation-popover__group--column')).toBe(true);
    expect(groups[2].classList.contains('dt-annotation-popover__group--cell')).toBe(true);

    expect(groups[0].querySelector('.dt-annotation-message')?.textContent).toBe('row-warn');
    expect(groups[1].querySelector('.dt-annotation-message')?.textContent).toBe('col-err');
    expect(groups[2].querySelector('.dt-annotation-message')?.textContent).toBe('cell-info');
  });

  it('show() sets aria-describedby on the anchor; hide() clears it', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'only' }),
    ]);
    expect(anchor.getAttribute('aria-describedby')).toBe(popover.getId());

    popover.hide();
    expect(anchor.getAttribute('aria-describedby')).toBe(null);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(root.style.display).toBe('none');
  });

  it('Escape key hides an open popover', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'only' }),
    ]);
    expect(popover.isOpen()).toBe(true);

    const ev = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(ev);

    expect(popover.isOpen()).toBe(false);
  });

  it('pointerdown outside anchor and popover hides it; inside does not', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'x' }),
    ]);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;

    // Outside click → hide
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(false);
    outside.remove();

    // Reopen; click inside popover → stays open
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'x' }),
    ]);
    root.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(true);

    // Click on anchor itself also keeps it open
    anchor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(popover.isOpen()).toBe(true);
  });

  it('window scroll hides an open popover', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x' }),
    ]);
    window.dispatchEvent(new Event('scroll'));
    expect(popover.isOpen()).toBe(false);
  });

  it('positions below the anchor when space is available', () => {
    // Stub anchor rect to simulate being near top of viewport.
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        top: 20,
        bottom: 52,
        left: 100,
        right: 220,
        width: 120,
        height: 32,
        x: 100,
        y: 20,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
    // Stub viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x' }),
    ]);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    const top = parseInt(root.style.top, 10);
    expect(top).toBeGreaterThanOrEqual(52);
  });

  it('positions above the anchor when there is no room below', () => {
    // Stub offsetHeight so the layout decision is deterministic.
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({
        top: 700,
        bottom: 732,
        left: 100,
        right: 220,
        width: 120,
        height: 32,
        x: 100,
        y: 700,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x' }),
    ]);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    // Stub offsetHeight so the "would overflow" check picks the "above" branch.
    Object.defineProperty(root, 'offsetHeight', { value: 300, configurable: true });
    // Trigger a re-position by show()'ing again.
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x' }),
    ]);
    const top = parseInt(root.style.top, 10);
    expect(top).toBeLessThan(700);
  });

  it('show() with empty annotations hides the popover', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'x' }),
    ]);
    expect(popover.isOpen()).toBe(true);

    popover.show(anchor, []);
    expect(popover.isOpen()).toBe(false);
  });

  it('destroy() removes the element and future show is a no-op', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x' }),
    ]);
    popover.destroy();
    expect(portal.querySelector('.dt-annotation-popover')).toBe(null);
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'x2' }),
    ]);
    expect(portal.querySelector('.dt-annotation-popover')).toBe(null);
  });

  it('pills carry the severity class', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'err' }),
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'warning', message: 'warn' }),
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: 'info' }),
    ]);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(root.querySelector('.dt-annotation-pill--error')).toBeTruthy();
    expect(root.querySelector('.dt-annotation-pill--warning')).toBeTruthy();
    expect(root.querySelector('.dt-annotation-pill--info')).toBeTruthy();
  });

  it('does not parse HTML in message, code, or source (textContent only)', () => {
    popover.show(anchor, [
      makeAnn({
        scope: 'cell',
        rowId: 1,
        column: 'x',
        severity: 'error',
        message: '<img src=x onerror=alert(1)>',
        code: '<script>alert(2)</script>',
        source: '<svg/>',
      }),
      makeAnn({
        scope: 'row',
        rowId: 1,
        severity: 'warning',
        message: '<iframe src="javascript:alert(3)"></iframe>',
        code: '<b>bold</b>',
        source: '<i>italic</i>',
      }),
    ]);
    const root = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(root).toBeTruthy();

    // No injected elements anywhere in the popover subtree.
    for (const tag of ['img', 'script', 'b', 'i', 'svg', 'iframe']) {
      expect(root.querySelectorAll(tag).length).toBe(0);
    }

    // Each malicious payload appears as literal text on the right node.
    const messages = Array.from(root.querySelectorAll('.dt-annotation-message')).map(
      (n) => n.textContent,
    );
    expect(messages).toContain('<img src=x onerror=alert(1)>');
    expect(messages).toContain('<iframe src="javascript:alert(3)"></iframe>');

    const meta = Array.from(root.querySelectorAll('.dt-annotation-meta')).map((n) => n.textContent);
    expect(meta).toContain('<script>alert(2)</script> · <svg/>');
    expect(meta).toContain('<b>bold</b> · <i>italic</i>');

    // Severity pill is the validated enum value, not user input.
    const pills = Array.from(root.querySelectorAll('.dt-annotation-pill')).map(
      (n) => n.textContent,
    );
    expect(pills).toContain('error');
    expect(pills).toContain('warning');
  });
});

describe('AnnotationPopover — modal-open dismissal', () => {
  let popover: AnnotationPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    __resetModalHostForTests();
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    anchor.setAttribute('tabindex', '0');
    document.body.appendChild(anchor);
    popover = new AnnotationPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
    __resetModalHostForTests();
  });

  function makeCellAnn(message = 'msg'): Annotation {
    return makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message });
  }

  it('hides when any ModalHost opens (panel mode — e.g. FilterPanel)', () => {
    popover.show(anchor, [makeCellAnn('p1')]);
    expect(popover.isOpen()).toBe(true);

    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel });

    expect(popover.isOpen()).toBe(false);
    host.close();
    panel.remove();
  });

  it('hides when any ModalHost opens (modal mode — e.g. SQLFilterModal)', () => {
    popover.show(anchor, [makeCellAnn('m1')]);
    expect(popover.isOpen()).toBe(true);

    const backdrop = document.createElement('div');
    const dialog = document.createElement('div');
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    const host = new ModalHost();
    host.open({ mode: 'modal', element: backdrop, dialog });

    expect(popover.isOpen()).toBe(false);
    host.close();
    backdrop.remove();
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
