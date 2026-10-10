/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChipStrip, nearestSurvivingKey } from '@/core/ChipStrip';
import { fakeChipStrip, nextFrame, type FakeStrip } from '../helpers/fakeChipStrip';

describe('nearestSurvivingKey', () => {
  const previous = ['a', 'b', 'c', 'd'];

  it('keeps a key whose chip is still there', () => {
    expect(nearestSurvivingKey(previous, 'b', new Set(['a', 'b', 'd']))).toBe('b');
  });

  it('hands over to the next chip that is still there', () => {
    expect(nearestSurvivingKey(previous, 'b', new Set(['a', 'd']))).toBe('d');
  });

  it('falls back to the chip before when none after is left', () => {
    expect(nearestSurvivingKey(previous, 'd', new Set(['a', 'b']))).toBe('b');
  });

  it('answers null when no chip is left, or the key was never a chip', () => {
    expect(nearestSurvivingKey(previous, 'b', new Set())).toBeNull();
    expect(nearestSurvivingKey(previous, 'z', new Set(['a']))).toBeNull();
  });
});

describe('ChipStrip', () => {
  /** A strip of `count` chips, keyed `c0`…, each with a button at its end. */
  let scroller: HTMLElement;
  let end: HTMLElement;
  let chips: Map<string, HTMLElement>;
  let layout: FakeStrip;
  let strip: ChipStrip;

  function addChip(key: string, before?: HTMLElement): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = key;
    const button = document.createElement('button');
    button.type = 'button';
    chip.appendChild(button);
    const row = scroller.querySelector('.row')!;
    row.insertBefore(chip, before ?? null);
    chips.set(key, chip);
    return chip;
  }

  beforeEach(() => {
    scroller = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'row';
    end = document.createElement('div');
    const endButton = document.createElement('button');
    endButton.type = 'button';
    end.appendChild(endButton);
    scroller.append(row, end);
    document.body.appendChild(scroller);
    chips = new Map();
    for (let i = 0; i < 10; i++) addChip(`c${i}`);
    // 400px wide, the last 80 under the sticky end; chips 100 wide, 10 apart.
    layout = fakeChipStrip(scroller, end, '.chip', { width: 400, end: 80, chip: 100, gap: 10 });
    strip = new ChipStrip({
      scroller,
      end,
      chipFor: (key) => chips.get(key),
      chipOf: (el) => (el.closest('.chip') as HTMLElement | null) ?? null,
    });
  });

  afterEach(() => {
    strip.destroy();
    layout.restore();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('reveal()', () => {
    it('brings a chip past the view up to the sticky end, and no further', () => {
      // c5 spans 550–650; the room ends at 400 − 80 = 320.
      strip.reveal(chips.get('c5')!);
      expect(layout.scrollLeft).toBe(650 - 320);
    });

    it('brings a chip before the view to its left edge', () => {
      layout.scrollLeft = 500;
      strip.reveal(chips.get('c2')!); // 220–320
      expect(layout.scrollLeft).toBe(220);
    });

    it('does not move for a chip already in view', () => {
      layout.scrollLeft = 100;
      strip.reveal(chips.get('c2')!); // 120–220 in view, 220 short of the end
      expect(layout.scrollLeft).toBe(100);
    });

    it('shows the whole chip a control sits in, not just the control', () => {
      // c4 spans 440–540, so at 450 its button (518–536) is in view and its
      // first 10px are not.
      layout.scrollLeft = 450;
      strip.reveal(chips.get('c4')!.querySelector('button')!);
      expect(layout.scrollLeft).toBe(440);
    });

    it('leaves the sticky end, and anything outside the strip, alone', () => {
      layout.scrollLeft = 300;
      strip.reveal(end.querySelector('button')!);
      strip.reveal(document.createElement('button'));
      expect(layout.scrollLeft).toBe(300);
    });

    it('is instant unless asked to glide', () => {
      strip.reveal(chips.get('c5')!);
      expect(layout.scrollTo).not.toHaveBeenCalled();

      strip.reveal(chips.get('c8')!, 'smooth');
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 980 - 320, behavior: 'smooth' });
    });
  });

  describe('revealAdded()', () => {
    it('glides to the added chip at the next frame', async () => {
      strip.revealAdded(['c6']);
      expect(layout.scrollTo).not.toHaveBeenCalled();

      await nextFrame();

      // c6 spans 660–760.
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 760 - 320, behavior: 'smooth' });
      expect(layout.scrollTo).toHaveBeenCalledTimes(1);
    });

    it('makes one scroll for chips several renders add, to the right-most of them', async () => {
      strip.revealAdded(['c7']);
      strip.revealAdded(['c9', 'c3']);
      strip.revealAdded(['c8']);

      await nextFrame();

      expect(layout.scrollTo).toHaveBeenCalledTimes(1);
      // c9, the last in the row, whatever order the keys came in: 990–1090.
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 1090 - 320, behavior: 'smooth' });
    });

    it('goes left for a chip added before the view', async () => {
      layout.scrollLeft = 600;
      const added = addChip('new', chips.get('c1'));
      expect(added.previousElementSibling).toBe(chips.get('c0'));

      strip.revealAdded(['new']);
      await nextFrame();

      // The new chip is second in the row: 110–210.
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 110, behavior: 'smooth' });
    });

    it('passes over a chip removed before the frame, and keys no chip shows', async () => {
      strip.revealAdded(['c8', 'c2', 'nope']);
      chips.get('c8')!.remove();

      await nextFrame();

      // c2 is in view, so nothing moves at all.
      expect(layout.scrollTo).not.toHaveBeenCalled();
      expect(layout.scrollLeft).toBe(0);
    });

    it('jumps rather than glides when the user prefers reduced motion', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
      );
      strip.revealAdded(['c6']);
      await nextFrame();

      expect(layout.scrollTo).not.toHaveBeenCalled();
      expect(layout.scrollLeft).toBe(760 - 320);
    });

    it('does nothing once destroyed', async () => {
      strip.revealAdded(['c6']);
      strip.destroy();
      strip.revealAdded(['c7']);

      await nextFrame();

      expect(layout.scrollTo).not.toHaveBeenCalled();
      expect(layout.scrollLeft).toBe(0);
    });
  });

  describe('focus', () => {
    it('reveals the chip of a control that takes keyboard focus', () => {
      const button = chips.get('c5')!.querySelector('button')!;
      button.focus();
      expect(layout.scrollLeft).toBe(650 - 320);
    });

    it('does not scroll for focus a pointer press gave, which would lose its click', () => {
      const button = chips.get('c5')!.querySelector('button')!;
      const matches = button.matches.bind(button);
      button.matches = (selector: string) => selector !== ':focus-visible' && matches(selector);
      button.focus();
      expect(layout.scrollLeft).toBe(0);
    });

    it('stops listening once destroyed', () => {
      strip.destroy();
      chips.get('c5')!.querySelector('button')!.focus();
      expect(layout.scrollLeft).toBe(0);
    });
  });
});
