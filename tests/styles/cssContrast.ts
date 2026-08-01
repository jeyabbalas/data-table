/**
 * Shared machinery for the stylesheet contrast guards.
 *
 * The library's colours only exist as CSS text: jsdom implements no layout and
 * no colour resolution, so `tests/a11y/axe.test.ts` keeps axe's
 * `color-contrast` rule permanently disabled. Everything here therefore reads
 * `src/styles/*.css` directly — parsing declarations, resolving `var()` and
 * `color-mix()` against the theme blocks, and compositing alpha — so the
 * ratios asserted in the tests are the ratios a browser would paint.
 *
 * Kept separate from `contrast.test.ts` so `focusIndicator.test.ts` and any
 * future stylesheet guard share one parser instead of growing a second one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES_DIR = resolve(__dirname, '..', '..', 'src', 'styles');

/**
 * Every stylesheet that paints something, read from disk rather than listed:
 * a new component file is covered by the guards the day it lands. Excludes
 * the token declarations and the bare `@import` manifest, which paint nothing.
 */
export function componentStyleFiles(): string[] {
  return readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith('.css') && f !== '01-variables.css' && f !== 'index.css')
    .sort();
}

/** sRGB channels 0-255 plus alpha 0-1. */
export type Rgba = readonly [number, number, number, number];

const sourceCache = new Map<string, string>();

/**
 * Comment-stripped source of a stylesheet. Comments go first because
 * 01-variables.css documents overriding tokens with a literal
 * `:root { --dt-primary: #10b981 }` example that the block lookups would
 * otherwise latch onto.
 */
export function readCss(file: string): string {
  let css = sourceCache.get(file);
  if (css === undefined) {
    css = readFileSync(resolve(STYLES_DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    sourceCache.set(file, css);
  }
  return css;
}

// --- Colour maths (WCAG 2.x, §1.4.3) ---

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: Rgba): number {
  const [r, g, b] = [color[0], color[1], color[2]].map(channelLuminance) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Paint `color` onto an opaque `backdrop`. No-op for opaque colours. */
export function flatten(color: Rgba, backdrop: Rgba): Rgba {
  const a = color[3];
  if (a >= 1) return color;
  return [
    color[0] * a + backdrop[0] * (1 - a),
    color[1] * a + backdrop[1] * (1 - a),
    color[2] * a + backdrop[2] * (1 - a),
    1,
  ];
}

/** Scale a colour's alpha, the way an element's `opacity` composites it. */
export function withOpacity(color: Rgba, opacity: number): Rgba {
  return [color[0], color[1], color[2], color[3] * opacity];
}

export function formatHex(color: Rgba): string {
  const hex = [color[0], color[1], color[2]]
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('');
  return color[3] >= 1 ? `#${hex}` : `#${hex} @ ${color[3].toFixed(2)}α`;
}

// --- Colour expression parsing ---

const TRANSPARENT: Rgba = [0, 0, 0, 0];

/** Values that are legal in a colour slot but carry no resolvable colour. */
export const NON_COLOUR_KEYWORDS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'none',
  // Forced-colors system palette (11-high-contrast.css) — the user agent
  // supplies these, and their contrast is the OS's contract, not ours.
  'canvas',
  'canvastext',
  'graytext',
  'linktext',
  'highlight',
  'highlighttext',
  'buttonface',
  'buttontext',
]);

/** Split on `separator` at paren depth 0. */
function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function hexToRgba(hex: string): Rgba {
  const h = hex.slice(1);
  const expand = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(expand.slice(0, 6), 16);
  const alpha = expand.length === 8 ? parseInt(expand.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/**
 * `color-mix(in srgb, A p%, B q%)`. Mixing is premultiplied, which is what
 * makes `color-mix(in srgb, X 20%, transparent)` mean "X at 20% alpha" — the
 * form every `--dt-*-soft` / `--dt-*-alpha-*` token uses.
 */
function mixColors(args: string[], tokens: Record<string, string>, seen: string[]): Rgba {
  const [space, first, second] = args;
  if (space?.trim() !== 'in srgb') {
    throw new Error(`only \`in srgb\` color-mix() is supported, got "${space}"`);
  }
  const parse = (part: string | undefined): { color: Rgba; weight: number | null } => {
    if (part === undefined) throw new Error('color-mix() needs two colours');
    const match = /\s(\d+(?:\.\d+)?)%$/.exec(part);
    const expr = match ? part.slice(0, match.index) : part;
    return { color: parseColor(expr, tokens, seen), weight: match ? Number(match[1]) / 100 : null };
  };
  const a = parse(first);
  const b = parse(second);
  const wa = a.weight ?? (b.weight === null ? 0.5 : 1 - b.weight);
  const wb = b.weight ?? 1 - wa;
  const total = wa + wb;
  const alpha = (a.color[3] * wa + b.color[3] * wb) / total;
  if (alpha === 0) return TRANSPARENT;
  const channel = (i: 0 | 1 | 2): number =>
    (a.color[i] * a.color[3] * wa + b.color[i] * b.color[3] * wb) / total / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

/**
 * Resolve a CSS colour expression against a theme's token map. Handles hex,
 * `rgb()` / `rgba()`, `white` / `black`, `var(--x)` (with fallback) and
 * `color-mix()`, recursively — which is what lets a component rule be checked
 * as written instead of against a hand-copied hex.
 */
export function parseColor(
  expr: string,
  tokens: Record<string, string>,
  seen: string[] = [],
): Rgba {
  const value = expr.trim();
  const lower = value.toLowerCase();

  if (lower === 'white') return [255, 255, 255, 1];
  if (lower === 'black') return [0, 0, 0, 1];
  if (lower === 'transparent') return TRANSPARENT;
  if (NON_COLOUR_KEYWORDS.has(lower)) {
    throw new Error(`"${value}" carries no resolvable colour`);
  }
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return hexToRgba(value);

  const fn = /^([a-z-]+)\((.*)\)$/is.exec(value);
  if (fn) {
    const name = fn[1]!.toLowerCase();
    const args = fn[2]!;
    if (name === 'var') {
      const [nameArg, ...fallback] = splitTopLevel(args, ',');
      const token = nameArg!.trim();
      if (seen.includes(token)) throw new Error(`circular var() reference at ${token}`);
      const declared = tokens[token];
      if (declared !== undefined) return parseColor(declared, tokens, [...seen, token]);
      if (fallback.length > 0) return parseColor(fallback.join(','), tokens, [...seen, token]);
      throw new Error(`${token} is not declared in this theme`);
    }
    if (name === 'color-mix') return mixColors(splitTopLevel(args, ','), tokens, seen);
    if (name === 'rgb' || name === 'rgba') {
      const parts = splitTopLevel(args.replace(/\//g, ','), ',').map(Number);
      const [r, g, b, a] = parts;
      if (r === undefined || g === undefined || b === undefined || Number.isNaN(r)) {
        throw new Error(`unparsable ${name}(): "${value}"`);
      }
      return [r, g, b, a === undefined || Number.isNaN(a) ? 1 : a];
    }
  }
  throw new Error(`unsupported colour expression: "${value}"`);
}

/**
 * Pull the colour out of a declaration that carries more than one — a
 * `box-shadow` offset list, a `border` shorthand. Returns the last `var()`,
 * `color-mix()`, hex or `rgb()` in the value, which is where CSS puts the
 * colour in every shorthand this library writes.
 */
export function colorIn(value: string): string {
  const matches = value.match(
    /(?:var|color-mix|rgba?)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b|\bwhite\b|\bblack\b/gi,
  );
  if (!matches || matches.length === 0) {
    throw new Error(`no colour found in "${value}"`);
  }
  return matches[matches.length - 1]!;
}

// --- Declaration / rule extraction ---

function parseDeclarations(body: string): Record<string, string> {
  const decls: Record<string, string> = {};
  for (const part of splitTopLevel(body, ';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    decls[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return decls;
}

export interface Rule {
  /** Comma-separated selector list, split and trimmed. */
  readonly selectors: string[];
  /** Enclosing at-rule preludes, outermost first (`@media (...)`). */
  readonly atRules: string[];
  readonly declarations: Record<string, string>;
}

const ruleCache = new Map<string, Rule[]>();

/** Every declaration block in a stylesheet, at-rule nesting preserved. */
export function rulesIn(file: string): Rule[] {
  const cached = ruleCache.get(file);
  if (cached) return cached;
  const css = readCss(file);
  const out: Rule[] = [];
  const atRules: string[] = [];
  let prelude = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const head = prelude.trim();
      prelude = '';
      if (head.startsWith('@')) {
        atRules.push(head);
        i++;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      for (; j < css.length && depth > 0; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
      }
      out.push({
        selectors: splitTopLevel(head, ','),
        atRules: [...atRules],
        declarations: parseDeclarations(css.slice(i + 1, j - 1)),
      });
      i = j;
      continue;
    }
    if (ch === '}') {
      atRules.pop();
      prelude = '';
      i++;
      continue;
    }
    prelude += ch;
    i++;
  }
  ruleCache.set(file, out);
  return out;
}

/** The rules a selector appears in, in source order. */
export function rulesFor(file: string, selector: string): Rule[] {
  return rulesIn(file).filter((rule) => rule.selectors.includes(selector));
}

/**
 * The value a selector's rule gives `property`. Later declarations win, the
 * way the cascade resolves them. Throws when the selector or property is
 * absent so a rename fails the guard loudly instead of skipping it.
 */
export function declarationFor(file: string, selector: string, property: string): string {
  const matches = rulesFor(file, selector)
    .map((rule) => rule.declarations[property])
    .filter((value): value is string => value !== undefined);
  const value = matches[matches.length - 1];
  if (value === undefined) {
    throw new Error(`${file} declares no \`${property}\` for \`${selector}\``);
  }
  return value;
}

// --- Theme token maps ---

const VARIABLES = '01-variables.css';

/** Every `--dt-*` declaration in the block opened by `selector`. */
function tokenBlock(selector: string, fromIndex = 0): Record<string, string> {
  const css = readCss(VARIABLES);
  const start = css.indexOf(selector, fromIndex);
  if (start === -1) throw new Error(`selector "${selector}" not found in ${VARIABLES}`);
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
  const decls = parseDeclarations(css.slice(bodyStart, i));
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(decls)) {
    if (name.startsWith('--dt-')) out[name] = value.toLowerCase();
  }
  return out;
}

const mediaStart = readCss(VARIABLES).indexOf('@media (prefers-color-scheme: dark)');

/**
 * The four token blocks as authored. `:root` is the light source of truth;
 * `[data-dt-color-scheme='dark']` is the explicit dark opt-in declared after
 * the media query; the other two are the media query's dark defaults and its
 * light restore for subtrees that opt out.
 */
export const blocks = {
  light: tokenBlock(':root {'),
  dark: tokenBlock("[data-dt-color-scheme='dark'] {"),
  darkMedia: tokenBlock(':root {', mediaStart),
  lightRestore: tokenBlock("[data-dt-color-scheme='light'] {", mediaStart),
} as const;

export type ThemeName = 'light' | 'dark';

/**
 * Resolvable token maps. Dark is layered over light because the dark blocks
 * only redeclare what changes — `--dt-annotation-error-bg-hover`, for one, is
 * declared once in `:root` and picks up its dark inputs through `var()`.
 */
export const themes: Record<ThemeName, Record<string, string>> = {
  light: blocks.light,
  dark: { ...blocks.light, ...blocks.dark },
};

/** Resolve a colour expression in one theme, composited onto `backdrop`. */
export function resolveColor(expr: string, theme: ThemeName, backdrop?: Rgba): Rgba {
  const color = parseColor(expr, themes[theme]);
  return backdrop ? flatten(color, backdrop) : color;
}

/** The page surface — what an alpha tint is painted over when nothing else is. */
export function pageBackground(theme: ThemeName): Rgba {
  return resolveColor('var(--dt-bg)', theme);
}
