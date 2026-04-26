/**
 * @vitest-environment jsdom
 *
 * Phase 1 — XSS regression smoke tests for the rendering paths most likely
 * to receive user / data-source content: annotation messages, column-header
 * tooltips, and SQL filter previews. These paths today use `.textContent`
 * (verified during the Phase 1 explore pass); the tests lock that contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { ColumnHeaderTooltipPopover } from '@/table/ColumnHeaderTooltipPopover';
import type { Annotation } from '@/annotations/types';

const PAYLOADS = [
  '<img src=x onerror="window.__pwnedAnnot=true">',
  '<script>window.__pwnedAnnotScript=1</script>',
  '"><iframe src="javascript:alert(1)"></iframe>',
  '<svg onload="window.__pwnedAnnotSvg=1">',
];

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__pwnedAnnot;
  delete (globalThis as Record<string, unknown>).__pwnedAnnotScript;
  delete (globalThis as Record<string, unknown>).__pwnedAnnotSvg;
  delete (globalThis as Record<string, unknown>).__pwnedTooltip;
});

describe('AnnotationPopover — XSS smoke', () => {
  let popover: AnnotationPopover;
  let portal: HTMLElement;
  let anchor: HTMLElement;

  beforeEach(() => {
    portal = document.createElement('div');
    document.body.appendChild(portal);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    popover = new AnnotationPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    portal.remove();
    anchor.remove();
  });

  for (const payload of PAYLOADS) {
    it(`renders annotation message as text for payload: ${payload.slice(0, 40)}…`, () => {
      const ann = {
        id: 'a1',
        createdAt: '2026-04-26T00:00:00.000Z',
        scope: 'row',
        rowId: 0,
        severity: 'error',
        message: payload,
      } as Annotation;
      popover.show(anchor, [ann]);

      const root = portal.querySelector('.dt-annotation-popover');
      expect(root).not.toBeNull();
      // No injected element types appear in the popover subtree.
      expect(root!.querySelector('img')).toBeNull();
      expect(root!.querySelector('script')).toBeNull();
      expect(root!.querySelector('iframe')).toBeNull();
      expect(root!.querySelector('svg')).toBeNull();
      // The literal string is preserved as text content.
      expect(root!.textContent).toContain(payload);
    });
  }

  it('does not run any injected handler', () => {
    const ann = {
      id: 'a2',
      createdAt: '2026-04-26T00:00:00.000Z',
      scope: 'row',
      rowId: 1,
      severity: 'error',
      message: '<img src=x onerror="window.__pwnedAnnot=true">',
    } as Annotation;
    popover.show(anchor, [ann]);
    expect((globalThis as Record<string, unknown>).__pwnedAnnot).toBeUndefined();
  });
});

describe('ColumnHeaderTooltipPopover — XSS smoke', () => {
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

  it('renders title / description / item label / item value as text', () => {
    popover.show(anchor, {
      title: '<img src=x onerror="window.__pwnedTooltip=1">',
      description: '<script>window.__pwnedTooltip=2</script>',
      items: [
        {
          label: '<svg onload="window.__pwnedTooltip=3">',
          value: '<iframe src="javascript:alert(1)"></iframe>',
        },
      ],
    });

    const root = portal.querySelector('.dt-col-tooltip');
    expect(root).not.toBeNull();
    expect(root!.querySelector('img')).toBeNull();
    expect(root!.querySelector('script')).toBeNull();
    expect(root!.querySelector('svg')).toBeNull();
    expect(root!.querySelector('iframe')).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwnedTooltip).toBeUndefined();
  });

  it('renders array values (chips) as text per chip', () => {
    popover.show(anchor, {
      title: 'Components',
      items: [
        {
          label: 'Parts',
          value: ['<img src=x>', '<script>1</script>'],
        },
      ],
    });
    const root = portal.querySelector('.dt-col-tooltip');
    expect(root!.querySelector('img')).toBeNull();
    expect(root!.querySelector('script')).toBeNull();
    expect(root!.textContent).toContain('<img src=x>');
    expect(root!.textContent).toContain('<script>1</script>');
  });
});
