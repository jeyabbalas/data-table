/**
 * The header and the body scroll sideways in two scrollers, and the column
 * window controller keeps them together: each one's scroll event moves the
 * other. The event for a scroller the controller has just written, its echo,
 * must never move the other one back.
 *
 * Headless Chromium hides the hazard. It fires the echo in the same frame as
 * the scroll that caused it, when the two scrollers still agree. Desktop
 * Chrome at a device pixel ratio of 2 was seen firing the header's echo a
 * frame late, after the body had moved on, and the header then wrote its
 * older position back into the body, which stopped a smooth scroll a pixel or
 * two in. These tests hold one scroller's scroll events back a frame, and let
 * each through just before the other scroller's next event, as that Chrome
 * did.
 */

import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable, probe, wheelBy } from './helpers/table';

type Scroller = 'header' | 'body';

/**
 * Deliver `late`'s scroll events a frame late: each is held back, and let
 * through just before the other scroller's next scroll event, or on the next
 * frame if that has none.
 */
async function deliverLate(page: Page, late: Scroller): Promise<void> {
  await page.evaluate(
    ({ hostId, late }) => {
      const host = document.getElementById(hostId)!;
      const header = host.querySelector<HTMLElement>('.dt-header-scroll')!;
      const body = host.querySelector<HTMLElement>('.dt-body-scroll')!;
      const held = late === 'header' ? header : body;
      const other = late === 'header' ? body : header;
      let frame = 0;
      let heldIn = -1;
      let passing = false;
      const release = (): void => {
        heldIn = -1;
        passing = true;
        held.dispatchEvent(new Event('scroll'));
        passing = false;
      };
      // Scroll events do not bubble, but they are captured on the way down.
      document.addEventListener(
        'scroll',
        (event) => {
          if (passing) return;
          if (event.target === held) {
            event.stopImmediatePropagation();
            if (heldIn < 0) heldIn = frame;
          } else if (event.target === other && heldIn >= 0 && heldIn < frame) {
            release();
          }
        },
        { capture: true },
      );
      const tick = (): void => {
        frame++;
        if (heldIn >= 0 && heldIn < frame - 1) release();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    { hostId: HOST_ID, late },
  );
}

/** Both scrollers' `scrollLeft`. */
function scrollers(page: Page): Promise<{ body: number; header: number }> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId)!;
    return {
      body: host.querySelector<HTMLElement>('.dt-body-scroll')!.scrollLeft,
      header: host.querySelector<HTMLElement>('.dt-header-scroll')!.scrollLeft,
    };
  }, HOST_ID);
}

test.describe('at device pixel ratio 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test("a host's smooth scroll of the body goes the whole way when the header's echo comes late", async ({
    page,
  }) => {
    await mountTable(page);
    await deliverLate(page, 'header');

    await page.evaluate((hostId) => {
      const body = document.querySelector<HTMLElement>(`#${hostId} .dt-body-scroll`)!;
      body.scrollTo({ left: 20_000, behavior: 'smooth' });
    }, HOST_ID);

    // Stuck a pixel in, it never gets there.
    await expect
      .poll(() => scrollers(page), { timeout: 30_000 })
      .toEqual({ body: 20_000, header: 20_000 });
  });
});

test("an animated scroll of the header goes the whole way when the body's echo comes late", async ({
  page,
}) => {
  // Keyboard scrolling in the focused header and a fling over it animate the
  // header, and the body follows it frame by frame.
  await mountTable(page);
  await deliverLate(page, 'body');

  await page.evaluate((hostId) => {
    const header = document.querySelector<HTMLElement>(`#${hostId} .dt-header-scroll`)!;
    header.scrollTo({ left: 20_000, behavior: 'smooth' });
  }, HOST_ID);

  await expect
    .poll(() => scrollers(page), { timeout: 30_000 })
    .toEqual({ body: 20_000, header: 20_000 });
});

test('a column added from the + button is scrolled all the way into view through stalled frames', async ({
  page,
}) => {
  await mountTable(page);
  await wheelBy(page, 8_000);
  await deliverLate(page, 'header');

  // A loaded machine: once the smooth scroll is well under way, the body's
  // position reads the same for six frames running, as when the compositor
  // gets no time to move it, then catches up.
  await page.evaluate((hostId) => {
    const body = document.querySelector<HTMLElement>(`#${hostId} .dt-body-scroll`)!;
    const real = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')!;
    const start = real.get!.call(body) as number;
    let frozen: number | null = null;
    let frames = 0;
    Object.defineProperty(body, 'scrollLeft', {
      configurable: true,
      get() {
        return frozen ?? real.get!.call(this);
      },
      set(value: number) {
        real.set!.call(this, value);
      },
    });
    const tick = (): void => {
      const left = real.get!.call(body) as number;
      if (frames === 0 && left > start + 8_000) frozen = left;
      if (frozen !== null && ++frames > 6) {
        frozen = null;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, HOST_ID);

  await page.locator(`#${HOST_ID} .dt-add-column-btn`).click();
  const modal = page.locator('.dt-derived-modal-body');
  await expect(modal).toBeVisible();
  await modal.locator('input.dt-filter-input').first().fill('d');
  await modal.locator('.cm-content').click();
  await page.keyboard.type(`'x' || c000`);
  await page.locator('.dt-derived-modal-validate').click();
  const create = page.locator('.dt-derived-modal-create');
  await expect(create).toBeEnabled();
  await create.click();
  await expect(modal).toBeHidden();

  await expect
    .poll(
      async () => {
        const { left, max } = await probe(page, 'scroll');
        return max - left;
      },
      { timeout: 30_000 },
    )
    .toBeLessThan(1);
  await settle(page);
  expect((await probe(page, 'column', 'd'))!.inView).toBe(true);
});
