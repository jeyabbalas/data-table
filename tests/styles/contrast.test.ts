/**
 * WCAG 2.x contrast guard for the theme's text tokens.
 *
 * axe-core's `color-contrast` rule is permanently disabled in
 * `tests/a11y/axe.test.ts` because jsdom implements neither layout nor colour
 * resolution, so nothing in CI checked contrast — which is how
 * `--dt-text-tertiary` at #9ca3af shipped reading 2.31:1 against a hovered
 * column header. This test closes that hole by computing the ratios straight
 * from the token declarations, no browser required.
 *
 * Every size the library renders text at (0.875rem / 0.75rem / 0.7rem) is below
 * the WCAG "large text" threshold (18pt, or 14pt bold), so every pair here
 * needs the full 4.5:1 — there is no relaxed row to add.
 *
 * Scope: the three text tokens against the five surfaces they are painted on.
 * Composite surfaces built with `color-mix()` (the derived-column header) sit
 * between two of these anchors by construction, so they are covered
 * transitively.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VARIABLES_CSS = resolve(__dirname, '..', '..', 'src', 'styles', '01-variables.css');

// --- WCAG relative luminance / contrast ratio (WCAG 2.x, §1.4.3) ---

function toRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  expect(h, `expected a 6-digit hex colour, got "${hex}"`).toMatch(/^[0-9a-fA-F]{6}$/);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(channelLuminance) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Token extraction ---

// Comments are stripped first: the file's header block documents overriding
// tokens with a literal `:root { --dt-primary: #10b981 }` example, which the
// selector lookup below would otherwise latch onto.
const css = readFileSync(VARIABLES_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Pull every `--dt-*: <hex>` declaration out of the block opened by
 * `selector`. Brace-counting rather than a regex because the dark block is
 * nested inside `@media (prefers-color-scheme: dark)`.
 */
function tokensIn(selector: string, fromIndex = 0): Record<string, string> {
  const start = css.indexOf(selector, fromIndex);
  expect(start, `selector "${selector}" not found in 01-variables.css`).toBeGreaterThan(-1);
  let depth = 0;
  let i = css.indexOf('{', start);
  const bodyStart = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = css.slice(bodyStart, i);
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--dt-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[match[1]!] = match[2]!.toLowerCase();
  }
  return out;
}

// `:root` is the light source of truth. `[data-dt-color-scheme='dark']` is the
// explicit dark opt-in, declared at top level after the @media block.
const light = tokensIn(':root {');
const dark = tokensIn("[data-dt-color-scheme='dark'] {");

// The two mirror blocks inside `@media (prefers-color-scheme: dark)`: the
// dark defaults, then the light restore for subtrees that opt out.
const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
const darkMedia = tokensIn(':root {', mediaStart);
const lightRestore = tokensIn("[data-dt-color-scheme='light'] {", mediaStart);

const TEXT_TOKENS = ['--dt-text', '--dt-text-secondary', '--dt-text-tertiary'] as const;

/**
 * Surfaces text is painted on. `--dt-bg-tertiary` is the hovered column
 * header — the strictest of the neutrals and the one the original
 * `.dt-col-stats` violation was reported against. `--dt-primary-lighter` is a
 * selected *and* hovered row.
 */
const SURFACE_TOKENS = [
  '--dt-bg',
  '--dt-bg-secondary',
  '--dt-bg-tertiary',
  '--dt-primary-light',
  '--dt-primary-lighter',
] as const;

/** WCAG AA for text below 18pt / 14pt-bold. Nothing here qualifies as large. */
const AA_NORMAL_TEXT = 4.5;

describe('theme tokens — WCAG AA contrast', () => {
  describe.each([
    ['light', light],
    ['dark', dark],
  ] as const)('%s theme', (themeName, tokens) => {
    it.each(TEXT_TOKENS.flatMap((fg) => SURFACE_TOKENS.map((bg) => [fg, bg] as const)))(
      `%s on %s clears ${AA_NORMAL_TEXT}:1`,
      (fgToken, bgToken) => {
        const fg = tokens[fgToken];
        const bg = tokens[bgToken];
        expect(fg, `${fgToken} missing from the ${themeName} block`).toBeDefined();
        expect(bg, `${bgToken} missing from the ${themeName} block`).toBeDefined();

        const ratio = contrastRatio(fg!, bg!);
        expect(
          Number(ratio.toFixed(2)),
          `${fgToken} (${fg}) on ${bgToken} (${bg}) is ${ratio.toFixed(2)}:1 in ${themeName}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      },
    );

    it('keeps text darker than secondary, and secondary darker than tertiary', () => {
      // The semantic ordering is "text is the most prominent, tertiary the
      // least", which in light mode means increasing luminance and in dark
      // mode decreasing. Contrast fixes that flatten or invert this would
      // pass the ratio checks above while destroying the visual hierarchy.
      const [text, secondary, tertiary] = TEXT_TOKENS.map((t) => relativeLuminance(tokens[t]!));
      if (themeName === 'light') {
        expect(text!).toBeLessThan(secondary!);
        expect(secondary!).toBeLessThan(tertiary!);
      } else {
        expect(text!).toBeGreaterThan(secondary!);
        expect(secondary!).toBeGreaterThan(tertiary!);
      }
    });
  });

  it('keeps the duplicated theme blocks in sync', () => {
    // 01-variables.css declares each palette twice (CSS has no mixins): once
    // at top level and once inside the prefers-color-scheme media query. A
    // contrast fix applied to only one copy would leave half the users on the
    // failing value.
    for (const token of [...TEXT_TOKENS, ...SURFACE_TOKENS]) {
      expect(lightRestore[token], `${token} drifted between the two light blocks`).toBe(
        light[token],
      );
      expect(darkMedia[token], `${token} drifted between the two dark blocks`).toBe(dark[token]);
    }
  });
});
