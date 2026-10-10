/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnnotationPopover, type AnnotationSections } from '@/table/AnnotationPopover';
import { maxSeverity, severityRank } from '@/annotations/severity';
import { ModalHost, __resetModalHostForTests } from '@/core/ModalHost';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { Annotation, SeverityFilter } from '@/annotations/types';

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

  // Phase 8 — multiple-show / multiple-anchor regression coverage.
  it('rapid show against a different anchor clears the previous aria-describedby', () => {
    const anchorB = document.createElement('div');
    anchorB.setAttribute('tabindex', '0');
    document.body.appendChild(anchorB);
    const ann = makeAnn({ scope: 'row', severity: 'info', message: 'x' });

    popover.show(anchor, [ann]);
    expect(anchor.getAttribute('aria-describedby')).toBe(popover.getId());

    popover.show(anchorB, [ann]);
    expect(anchor.getAttribute('aria-describedby')).toBe(null);
    expect(anchorB.getAttribute('aria-describedby')).toBe(popover.getId());

    anchorB.remove();
  });

  it('destroy after multiple show/hide cycles does not throw', () => {
    const ann = makeAnn({ scope: 'row', severity: 'info', message: 'x' });
    for (let i = 0; i < 5; i++) {
      popover.show(anchor, [ann]);
      popover.hide();
    }
    expect(() => popover.destroy()).not.toThrow();
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

describe('AnnotationPopover — what it lists', () => {
  let popover: AnnotationPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;
  let filter: SeverityFilter;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    filter = { error: true, warning: true, info: true };
    popover = new AnnotationPopover({
      portalTarget: portal,
      severityFilter: () => ({ ...filter }),
    });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  const root = (): HTMLElement => portal.querySelector('.dt-annotation-popover') as HTMLElement;
  const section = (scope: string): HTMLElement | null =>
    root().querySelector(`.dt-annotation-popover__group--${scope}`);
  const messagesIn = (el: Element | null): string[] =>
    Array.from(el?.querySelectorAll('.dt-annotation-message') ?? [], (n) => n.textContent ?? '');

  it('lists at most five entries a section, and counts the rest', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      makeAnn({ scope: 'row', rowId: 1, severity: 'warning', message: `r${i}` }),
    );
    const cells = [0, 1].map((i) =>
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'info', message: `c${i}` }),
    );
    popover.show(anchor, [...rows, ...cells]);
    expect(messagesIn(section('row'))).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(section('row')!.querySelector('.dt-annotation-popover__more')?.textContent).toBe(
      '+3 more',
    );
    expect(messagesIn(section('cell'))).toEqual(['c0', 'c1']);
    expect(section('cell')!.querySelector('.dt-annotation-popover__more')).toBeNull();
  });

  it('leaves out the severities the filter hides, and counts them in their section', () => {
    filter.warning = false;
    popover.show(anchor, [
      makeAnn({ scope: 'row', rowId: 1, severity: 'error', message: 'e' }),
      makeAnn({ scope: 'row', rowId: 1, severity: 'warning', message: 'w1' }),
      makeAnn({ scope: 'row', rowId: 1, severity: 'warning', message: 'w2' }),
      makeAnn({ scope: 'column', column: 'x', severity: 'warning', message: 'cw' }),
    ]);
    expect(messagesIn(section('row'))).toEqual(['e']);
    expect(section('row')!.querySelector('.dt-annotation-popover__hidden')?.textContent).toBe(
      '2 hidden by the severity filter',
    );
    // A section of hidden annotations only: its title and the count.
    expect(messagesIn(section('column'))).toEqual([]);
    expect(section('column')!.querySelector('.dt-annotation-popover__hidden')?.textContent).toBe(
      '1 hidden by the severity filter',
    );
  });

  it('opens nowhere the filter hides every annotation', () => {
    popover.show(anchor, [makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'i' })]);
    expect(popover.isOpenFor(anchor)).toBe(true);
    filter.info = false;
    popover.show(anchor, [makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'i' })]);
    expect(popover.isOpen()).toBe(false);
    expect(anchor.hasAttribute('aria-describedby')).toBe(false);
  });

  it('writes its text from the messages it was given', () => {
    popover.destroy();
    popover = new AnnotationPopover({
      portalTarget: portal,
      messages: mergeStrings(defaultStrings, {
        annotations: {
          severityNames: { error: 'erreur', warning: 'avertissement' },
          popover: {
            rowTitle: 'Ligne',
            cellTitle: 'Cellule',
            moreEntries: (n) => `+${n} de plus`,
          },
        },
      }),
    });
    popover.show(anchor, [
      ...Array.from({ length: 6 }, (_, i) =>
        makeAnn({ scope: 'row', rowId: 1, severity: 'error', message: `r${i}` }),
      ),
      makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'warning', message: 'c' }),
    ]);
    const titles = Array.from(
      root().querySelectorAll('.dt-annotation-popover__group-title'),
      (n) => n.textContent,
    );
    expect(titles).toEqual(['Ligne', 'Cellule']);
    expect(section('row')!.querySelector('.dt-annotation-pill')?.textContent).toBe('erreur');
    expect(section('cell')!.querySelector('.dt-annotation-pill')?.textContent).toBe(
      'avertissement',
    );
    expect(section('row')!.querySelector('.dt-annotation-popover__more')?.textContent).toBe(
      '+1 de plus',
    );
  });

  it('gives a severity outside the allow-list no class', () => {
    popover.show(anchor, [
      makeAnn({ scope: 'row', rowId: 1, severity: 'x y' as never, message: 'odd' }),
    ]);
    const entry = root().querySelector('.dt-annotation-entry') as HTMLElement;
    expect(entry.className).toBe('dt-annotation-entry');
    expect(entry.querySelector('.dt-annotation-pill')!.className).toBe('dt-annotation-pill');
    expect(entry.querySelector('.dt-annotation-pill')!.textContent).toBe('x y');
  });
});

describe('AnnotationPopover — refresh', () => {
  let popover: AnnotationPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;
  let sections: AnnotationSections | null;
  let source: ReturnType<typeof vi.fn<() => AnnotationSections | null>>;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    popover = new AnnotationPopover({ portalTarget: portal });
    sections = {
      cell: [makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'one' })],
    };
    source = vi.fn(() => sections);
    popover.showFrom(anchor, source);
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  const root = (): HTMLElement => portal.querySelector('.dt-annotation-popover') as HTMLElement;
  const messages = (): string[] =>
    Array.from(root().querySelectorAll('.dt-annotation-message'), (n) => n.textContent ?? '');

  async function mutationsDuringRefresh(): Promise<MutationRecord[]> {
    const observer = new MutationObserver(() => {});
    observer.observe(root(), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    popover.requestRefresh();
    await Promise.resolve();
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
  }

  it('rewrites nothing while what it shows is unchanged', async () => {
    expect(await mutationsDuringRefresh()).toEqual([]);
    expect(popover.isOpenFor(anchor)).toBe(true);
  });

  it('rewrites itself in place when its anchor’s annotations change', async () => {
    sections = {
      row: [makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'row' })],
      cell: sections!.cell,
    };
    expect((await mutationsDuringRefresh()).length).toBeGreaterThan(0);
    expect(popover.isOpenFor(anchor)).toBe(true);
    expect(anchor.getAttribute('aria-describedby')).toBe(popover.getId());
    expect(messages()).toEqual(['row', 'one']);
  });

  it('reads its anchor once for any number of requests in a task', async () => {
    source.mockClear();
    for (let i = 0; i < 100; i++) popover.requestRefresh();
    await Promise.resolve();
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('hides when nothing is left to list, or its anchor is gone', async () => {
    sections = { cell: [] };
    popover.requestRefresh();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(false);
    expect(anchor.hasAttribute('aria-describedby')).toBe(false);

    sections = {
      cell: [makeAnn({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'b' })],
    };
    popover.showFrom(anchor, source);
    sections = null;
    popover.requestRefresh();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(false);
  });

  it('does nothing while hidden', async () => {
    popover.hide();
    source.mockClear();
    popover.requestRefresh();
    await Promise.resolve();
    expect(source).not.toHaveBeenCalled();
    expect(popover.isOpen()).toBe(false);
  });

  it('applies a new severity filter to annotations shown without a source', async () => {
    popover.destroy();
    let showInfo = true;
    popover = new AnnotationPopover({
      portalTarget: portal,
      severityFilter: () => ({ error: true, warning: true, info: showInfo }),
    });
    popover.show(anchor, [
      makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'i' }),
      makeAnn({ scope: 'row', rowId: 1, severity: 'error', message: 'e' }),
    ]);
    expect(messages()).toEqual(['i', 'e']);
    showInfo = false;
    popover.requestRefresh();
    await Promise.resolve();
    expect(messages()).toEqual(['e']);
  });
});

describe('AnnotationPopover — scrolling', () => {
  let popover: AnnotationPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    popover = new AnnotationPopover({ portalTarget: portal });
    popover.show(anchor, [makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'x' })]);
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  const root = (): HTMLElement => portal.querySelector('.dt-annotation-popover') as HTMLElement;

  it('stays open through its own scroll, and closes on any other', () => {
    root().dispatchEvent(new Event('scroll'));
    expect(popover.isOpenFor(anchor)).toBe(true);
    root().querySelector('.dt-annotation-message')!.dispatchEvent(new Event('scroll'));
    expect(popover.isOpenFor(anchor)).toBe(true);

    const other = document.createElement('div');
    document.body.appendChild(other);
    other.dispatchEvent(new Event('scroll'));
    expect(popover.isOpen()).toBe(false);
    other.remove();
  });

  it('is a tab stop only while its content overflows it', () => {
    expect(root().getAttribute('tabindex')).toBe('-1');
    Object.defineProperty(root(), 'scrollHeight', { value: 900, configurable: true });
    Object.defineProperty(root(), 'clientHeight', { value: 384, configurable: true });
    popover.show(anchor, [makeAnn({ scope: 'row', rowId: 1, severity: 'info', message: 'y' })]);
    expect(root().getAttribute('tabindex')).toBe('0');
  });

  it('stays open while focus is inside it', () => {
    vi.useFakeTimers();
    try {
      popover.scheduleGraceHide();
      root().dispatchEvent(new FocusEvent('focusin'));
      vi.advanceTimersByTime(500);
      expect(popover.isOpenFor(anchor)).toBe(true);
      root().dispatchEvent(new FocusEvent('focusout', { relatedTarget: anchor }));
      vi.advanceTimersByTime(500);
      expect(popover.isOpenFor(anchor)).toBe(true);
      root().dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body }));
      vi.advanceTimersByTime(500);
      expect(popover.isOpen()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
