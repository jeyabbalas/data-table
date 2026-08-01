/**
 * WCAG contrast guard for the stylesheet.
 *
 * axe-core's `color-contrast` rule is permanently disabled in
 * `tests/a11y/axe.test.ts` because jsdom implements neither layout nor colour
 * resolution, so nothing in CI checked contrast — which is how
 * `--dt-text-tertiary` at #9ca3af shipped reading 2.31:1 against a hovered
 * column header. This suite closes that hole by computing the ratios straight
 * from the CSS, no browser required.
 *
 * Three layers, because guarding only the first left real holes:
 *
 *   1. Token pairs — the text tokens against the surfaces they land on.
 *      Necessary, but it only sees 01-variables.css: reintroducing
 *      `opacity: 0.8` on `.dt-col-stats .dt-stats-line2` (the original bug)
 *      left every token assertion green.
 *   2. Component rules — read as authored, `var()` and `color-mix()` and
 *      `opacity` resolved the way a browser resolves them, so a rule that
 *      dims its own text or picks the wrong token fails here.
 *   3. Lint — the two antipatterns that produced the failures above: text
 *      tokens used as backgrounds (they invert with the theme, so one scheme
 *      always loses), and scrollable regions with nothing focusable in them.
 *
 * Every size the library renders text at (0.875rem / 0.75rem / 0.7rem /
 * 0.55rem) is below the WCAG "large text" threshold (18pt, or 14pt bold), so
 * every text pair here needs the full 4.5:1 — there is no relaxed row to add.
 */
import { describe, it, expect } from 'vitest';
import {
  blocks,
  colorIn,
  componentStyleFiles,
  contrastRatio,
  declarationFor,
  flatten,
  formatHex,
  NON_COLOUR_KEYWORDS,
  pageBackground,
  parseColor,
  relativeLuminance,
  resolveColor,
  rulesFor,
  rulesIn,
  themes,
  withOpacity,
  type Rgba,
  type Rule,
  type ThemeName,
} from './cssContrast';

/** WCAG AA for text below 18pt / 14pt-bold. Nothing here qualifies as large. */
const AA_NORMAL_TEXT = 4.5;

/**
 * WCAG 1.4.11 for non-text content: focus rings, state indicators, and icons
 * that are the only signal a control exists (sort arrows, action glyphs).
 */
const AA_NON_TEXT = 3;

const THEME_NAMES = ['light', 'dark'] as const;

/** A colour resolved lazily, because most of them differ per theme. */
type Paint = (theme: ThemeName) => Rgba;

const token =
  (name: string): Paint =>
  (theme) =>
    resolveColor(`var(${name})`, theme);

/**
 * The colour a rule paints, carrying any `opacity` the rule dims itself with.
 * `opacity` composites against whatever is behind the element, so a dimmed
 * foreground has a different ratio on every surface — the reason
 * `.dt-col-stats .dt-stats-line2` sets a colour instead.
 */
function paintedBy(file: string, selector: string, property = 'color'): Paint {
  return (theme) => {
    const color = resolveColor(colorIn(declarationFor(file, selector, property)), theme);
    const opacity = rulesFor(file, selector)
      .map((rule) => rule.declarations['opacity'])
      .filter((value): value is string => value !== undefined)
      .at(-1);
    return opacity === undefined ? color : withOpacity(color, Number(opacity));
  };
}

/** A surface painted on top of another — an alpha tint over its container. */
const layered =
  (over: Paint, under: Paint): Paint =>
  (theme) =>
    flatten(over(theme), under(theme));

function expectRatio(fg: Paint, bg: Paint, min: number, label: string, theme: ThemeName): void {
  const surface = flatten(bg(theme), pageBackground(theme));
  const ink = flatten(fg(theme), surface);
  const ratio = contrastRatio(ink, surface);
  expect(
    Number(ratio.toFixed(2)),
    `${label} — ${formatHex(ink)} on ${formatHex(surface)} is ${ratio.toFixed(2)}:1 in ${theme}`,
  ).toBeGreaterThanOrEqual(min);
}

// ---------------------------------------------------------------------------
// 1. Theme tokens
// ---------------------------------------------------------------------------

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

/**
 * Semantic colours painted as *text*, which the two suites below cannot see:
 * some are set from code rather than CSS — the CodeMirror highlight style in
 * `src/sql-editor/theme.ts` and the `style.color` type previews in the
 * derived-column and SQL filter modals — and the rest are set by rules whose
 * background comes from an ancestor panel.
 */
const SEMANTIC_TEXT = [
  '--dt-syntax-string',
  '--dt-syntax-type',
  '--dt-primary',
  '--dt-success',
  '--dt-error',
] as const;

/** The two surfaces a panel, dialog or editor puts that text on. */
const PANEL_SURFACES = ['--dt-bg', '--dt-bg-secondary'] as const;

describe('theme tokens — WCAG AA contrast', () => {
  describe.each(THEME_NAMES)('%s theme', (themeName) => {
    it.each(TEXT_TOKENS.flatMap((fg) => SURFACE_TOKENS.map((bg) => [fg, bg] as const)))(
      `%s on %s clears ${AA_NORMAL_TEXT}:1`,
      (fgToken, bgToken) => {
        expectRatio(
          token(fgToken),
          token(bgToken),
          AA_NORMAL_TEXT,
          `${fgToken} on ${bgToken}`,
          themeName,
        );
      },
    );

    it.each(SEMANTIC_TEXT.flatMap((fg) => PANEL_SURFACES.map((bg) => [fg, bg] as const)))(
      `%s as text on %s clears ${AA_NORMAL_TEXT}:1`,
      (fgToken, bgToken) => {
        expectRatio(
          token(fgToken),
          token(bgToken),
          AA_NORMAL_TEXT,
          `${fgToken} on ${bgToken}`,
          themeName,
        );
      },
    );

    it('keeps text darker than secondary, and secondary darker than tertiary', () => {
      // The semantic ordering is "text is the most prominent, tertiary the
      // least", which in light mode means increasing luminance and in dark
      // mode decreasing. Contrast fixes that flatten or invert this would
      // pass the ratio checks above while destroying the visual hierarchy.
      const [text, secondary, tertiary] = TEXT_TOKENS.map((t) =>
        relativeLuminance(resolveColor(`var(${t})`, themeName)),
      );
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
    // failing value. Every colour token is compared, not just the text ones —
    // the arrow, semantic and primary ramps all moved for contrast reasons.
    // The light restore block only mirrors the colours (sizing and z-index
    // tokens never differ per scheme), so it is checked in that direction.
    for (const [name, value] of Object.entries(blocks.lightRestore)) {
      expect(blocks.light[name], `${name} drifted between the two light blocks`).toBe(value);
    }
    expect(
      Object.keys(blocks.darkMedia).sort(),
      'the two dark blocks declare the same tokens',
    ).toEqual(Object.keys(blocks.dark).sort());
    for (const [name, value] of Object.entries(blocks.dark)) {
      expect(blocks.darkMedia[name], `${name} drifted between the two dark blocks`).toBe(value);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Component rules
// ---------------------------------------------------------------------------

/** Which schemes a rule actually paints in. */
function themesFor(rule: Rule): readonly ThemeName[] {
  const inDarkMedia = rule.atRules.some((at) => /prefers-color-scheme:\s*dark/.test(at));
  const selector = rule.selectors.join(' ');
  if (inDarkMedia) {
    return selector.includes("[data-dt-color-scheme='light']") ? ['light'] : ['dark'];
  }
  if (selector.includes("[data-dt-color-scheme='dark']")) return ['dark'];
  if (selector.includes("[data-dt-color-scheme='light']")) return ['light'];
  return THEME_NAMES;
}

interface FilledRule {
  label: string;
  file: string;
  selector: string;
  theme: ThemeName;
}

/**
 * Rules that paint their own text on their own fill — buttons, badges, chips,
 * pills, error boxes, annotated cells. Self-contained, so the pair is exact
 * with no assumption about what is behind the element.
 */
function filledRules(): FilledRule[] {
  const out: FilledRule[] = [];
  for (const file of componentStyleFiles()) {
    for (const rule of rulesIn(file)) {
      const background = rule.declarations['background'] ?? rule.declarations['background-color'];
      const color = rule.declarations['color'];
      if (background === undefined || color === undefined) continue;
      // WCAG 1.4.3 exempts inactive controls, which is the only reason the
      // library's `opacity: 0.5` disabled states are allowed to be dim.
      if (/:disabled|--disabled/.test(rule.selectors.join(' '))) continue;
      if (NON_COLOUR_KEYWORDS.has(background.toLowerCase())) continue;
      for (const theme of themesFor(rule)) {
        // Alpha fills sit on an unknown surface; the explicit cases below
        // pair those with the container they are painted over.
        if (parseColor(background, themes[theme])[3] < 1) continue;
        const selector = rule.selectors[0]!;
        out.push({ label: `${file} ${selector} [${theme}]`, file, selector, theme });
      }
    }
  }
  return out;
}

describe('component rules — text on its own fill', () => {
  const cases = filledRules();

  it('finds the filled components to check', () => {
    // Guards against a parser regression silently emptying the table below.
    expect(cases.length).toBeGreaterThan(20);
    expect(cases.map((c) => c.selector)).toContain('.dt-export-btn');
    expect(cases.map((c) => c.selector)).toContain('.dt-annotation-pill--warning');
  });

  it.each(cases.map((c) => [c.label, c] as const))(`%s clears ${AA_NORMAL_TEXT}:1`, (_label, c) => {
    expectRatio(
      paintedBy(c.file, c.selector),
      paintedBy(
        c.file,
        c.selector,
        rulesFor(c.file, c.selector).some((r) => r.declarations['background'] !== undefined)
          ? 'background'
          : 'background-color',
      ),
      AA_NORMAL_TEXT,
      `${c.file} ${c.selector}`,
      c.theme,
    );
  });
});

/**
 * Text whose surface comes from an ancestor, and indicators whose "surface" is
 * whatever they are drawn over. Each pair is a state the table actually
 * renders — a hovered header, a selected+hovered row, an annotated cell.
 */
const HEADER_SURFACES: Array<[string, Paint]> = [
  ['a resting header', paintedBy('03-columns.css', '.dt-col-header', 'background')],
  ['a hovered header', paintedBy('03-columns.css', '.dt-col-header:hover', 'background')],
  ['a derived header', paintedBy('03-columns.css', '.dt-col-header--derived', 'background')],
  [
    'a hovered derived header',
    paintedBy('03-columns.css', '.dt-col-header--derived:hover', 'background'),
  ],
];

/** Every surface the keyboard cursor can come to rest on. */
const CURSOR_SURFACES: Array<[string, Paint]> = [
  ...HEADER_SURFACES,
  ['a row', paintedBy('05-data-grid.css', '.dt-row', 'background')],
  ['a hovered row', paintedBy('05-data-grid.css', '.dt-row:hover', 'background')],
  ['a selected row', paintedBy('05-data-grid.css', '.dt-row--selected', 'background')],
  [
    'a selected+hovered row',
    paintedBy('05-data-grid.css', '.dt-row--selected:hover', 'background'),
  ],
  ...(['error', 'warning', 'info'] as const).flatMap((severity): Array<[string, Paint]> => [
    [
      `an ${severity}-annotated cell`,
      paintedBy('05-data-grid.css', `.dt-cell--annotation-${severity}`, 'background-color'),
    ],
    [
      `a hovered ${severity}-annotated cell`,
      paintedBy('05-data-grid.css', `.dt-cell--annotation-${severity}:hover`, 'background-color'),
    ],
  ]),
];

describe('component rules — text on an inherited surface', () => {
  describe.each(THEME_NAMES)('%s theme', (themeName) => {
    // Both stats lines, on every header state. The line-2 case is the
    // regression guard: `opacity: 0.8` here composites the colour toward the
    // header and drops it below 4.5:1 on all four surfaces.
    it.each(
      (
        [
          ['.dt-col-stats', '03-columns.css'],
          ['.dt-col-stats .dt-stats-line2', '03-columns.css'],
        ] as const
      ).flatMap(([selector, file]) =>
        HEADER_SURFACES.map(([surface, bg]) => [selector, surface, file, bg] as const),
      ),
    )(`%s on %s clears ${AA_NORMAL_TEXT}:1`, (selector, surface, file, bg) => {
      expectRatio(
        paintedBy(file, selector),
        bg,
        AA_NORMAL_TEXT,
        `${selector} on ${surface}`,
        themeName,
      );
    });

    it.each(HEADER_SURFACES)(
      `column name and type on %s clear ${AA_NORMAL_TEXT}:1`,
      (_surface, bg) => {
        expectRatio(
          paintedBy('03-columns.css', '.dt-col-name'),
          bg,
          AA_NORMAL_TEXT,
          '.dt-col-name',
          themeName,
        );
        expectRatio(
          paintedBy('03-columns.css', '.dt-col-type'),
          bg,
          AA_NORMAL_TEXT,
          '.dt-col-type',
          themeName,
        );
      },
    );

    // Annotation tints darken on hover through a color-mix() of the tint and
    // its own border colour, so the foreground has to clear the darker mix
    // too — the composite no token-level check can see.
    it.each(['error', 'warning', 'info'] as const)(
      `annotation %s text clears ${AA_NORMAL_TEXT}:1 on the hovered tint`,
      (severity) => {
        expectRatio(
          token(`--dt-annotation-${severity}-fg`),
          paintedBy(
            '05-data-grid.css',
            `.dt-cell--annotation-${severity}:hover`,
            'background-color',
          ),
          AA_NORMAL_TEXT,
          `--dt-annotation-${severity}-fg on the hovered tint`,
          themeName,
        );
      },
    );
  });
});

describe('component rules — indicators (WCAG 1.4.11)', () => {
  describe.each(THEME_NAMES)('%s theme', (themeName) => {
    // The keyboard cursor is a box-shadow ring, not an outline, so it has to
    // clear 3:1 against every tint the same cell can carry.
    it.each(CURSOR_SURFACES)(`the cursor ring clears ${AA_NON_TEXT}:1 on %s`, (surface, bg) => {
      expectRatio(
        paintedBy('05-data-grid.css', '.dt-cell--focused', 'box-shadow'),
        bg,
        AA_NON_TEXT,
        `.dt-cell--focused ring on ${surface}`,
        themeName,
      );
      expectRatio(
        paintedBy('03-columns.css', '.dt-col-header--focused', 'box-shadow'),
        bg,
        AA_NON_TEXT,
        `.dt-col-header--focused ring on ${surface}`,
        themeName,
      );
    });

    it.each(HEADER_SURFACES)(
      `the filtered-column underline clears ${AA_NON_TEXT}:1 on %s`,
      (_surface, bg) => {
        expectRatio(
          paintedBy('03-columns.css', '.dt-col-header--filtered', 'box-shadow'),
          bg,
          AA_NON_TEXT,
          '.dt-col-header--filtered',
          themeName,
        );
      },
    );

    // Sort arrows and action glyphs are the only indication those controls
    // exist — the icon *is* the affordance, so it is non-text content rather
    // than decoration.
    const GLYPHS: Array<[string, Paint]> = [
      ['unsorted arrows', paintedBy('05-data-grid.css', '.dt-col-sort-btn .arrow-up', 'fill')],
      [
        'the sorted arrow',
        paintedBy('05-data-grid.css', '.dt-col-sort-btn--asc .arrow-up', 'fill'),
      ],
      ['action-panel icons', paintedBy('03-columns.css', '.dt-col-action-btn')],
      ['an active action icon', paintedBy('03-columns.css', '.dt-col-action-btn--active')],
    ];

    it.each(
      GLYPHS.flatMap(([glyph, fg]) =>
        HEADER_SURFACES.map(([s, bg]) => [glyph, s, fg, bg] as const),
      ),
    )(`%s clear ${AA_NON_TEXT}:1 on %s`, (glyph, surface, fg, bg) => {
      expectRatio(fg, bg, AA_NON_TEXT, `${glyph} on ${surface}`, themeName);
    });

    it(`hovered glyphs clear ${AA_NON_TEXT}:1 on their own hover wash`, () => {
      // The button's hover fill is an alpha wash over the header, and it is
      // declared per scheme (black in light, white in dark), so the surface
      // has to be composed the same way.
      const wash =
        themeName === 'dark'
          ? paintedBy(
              '03-columns.css',
              "[data-dt-color-scheme='dark'] .dt-col-action-btn:hover",
              'background',
            )
          : paintedBy('03-columns.css', '.dt-col-action-btn:hover', 'background');
      const surface = layered(
        wash,
        paintedBy('03-columns.css', '.dt-col-header:hover', 'background'),
      );
      expectRatio(
        paintedBy('03-columns.css', '.dt-col-action-btn:hover'),
        surface,
        AA_NON_TEXT,
        'hovered action icon',
        themeName,
      );
      expectRatio(
        paintedBy('05-data-grid.css', '.dt-col-sort-btn:hover .arrow-up', 'fill'),
        layered(
          paintedBy('05-data-grid.css', '.dt-col-sort-btn:hover', 'background'),
          paintedBy('03-columns.css', '.dt-col-header:hover', 'background'),
        ),
        AA_NON_TEXT,
        'hovered sort arrow',
        themeName,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Lint — the antipatterns behind the failures above
// ---------------------------------------------------------------------------

describe('stylesheet antipatterns', () => {
  it('never uses a text token as a background', () => {
    // Text tokens invert between schemes by definition: --dt-text-secondary is
    // #374151 in light and #d1d5db in dark. Filling with one means the label
    // on top is legible in exactly one scheme — `.dt-export-btn--loading`
    // reached 1.47:1 in dark this way. Use a surface token instead.
    const offenders: string[] = [];
    for (const file of componentStyleFiles()) {
      for (const rule of rulesIn(file)) {
        // Scrollbar thumbs are the exception: nothing is ever painted on top
        // of one, and a text token is exactly the right contrast against the
        // track in both schemes.
        if (rule.selectors.some((s) => s.includes('::-webkit-scrollbar'))) continue;
        for (const property of ['background', 'background-color']) {
          const value = rule.declarations[property];
          if (value && /var\(--dt-text/.test(value)) {
            offenders.push(`${file} ${rule.selectors[0]} { ${property}: ${value} }`);
          }
        }
      }
    }
    expect(offenders, 'text tokens used as backgrounds').toEqual([]);
  });

  it('adds no scrollable region without focusable content', () => {
    // axe `scrollable-region-focusable`: a region that scrolls but holds
    // nothing focusable is unreachable by keyboard. The fix is never
    // `tabindex="0"` on a text block — that is what put one tab stop per
    // column into the header. Clip instead, the way `.dt-col-stats` does.
    const allowed = new Set([
      '.dt-header-scroll', // column headers — every one holds buttons
      '.dt-filter-chips', // chips, each with a remove button
      '.dt-body-scroll', // the grid, focusable through the roving cursor
      '.dt-hidden-gutter:not(.dt-hidden-gutter--hidden)', // hidden-column chips
      '.dt-derived-modal-dialog', // dialogs: inputs, editor, footer buttons
      '.dt-sql-filter-modal-dialog',
      '.dt-export-dialog',
      '.dt-filter-panel-body', // filter inputs
      '.dt-filter-preset-list', // preset rows, each with load/delete buttons
    ]);
    const found: string[] = [];
    for (const file of componentStyleFiles()) {
      for (const rule of rulesIn(file)) {
        // Two-value forms count too: `overflow: hidden auto` scrolls on y.
        const scrolls = ['overflow', 'overflow-x', 'overflow-y'].some((property) =>
          (rule.declarations[property] ?? '')
            .split(/\s+/)
            .some((v) => v === 'auto' || v === 'scroll'),
        );
        if (scrolls && !rule.selectors.every((s) => allowed.has(s))) {
          found.push(`${file} ${rule.selectors.join(', ')}`);
        }
      }
    }
    expect(found, 'scrollable regions outside the reviewed allowlist').toEqual([]);
  });

  it('keeps the hidden-columns gutter reachable by pointer', () => {
    // The gutter caps at `max-height: 200px`. Clipping the overflow instead of
    // scrolling it leaves chips past that line unreachable for anyone without
    // a keyboard — the roving tabindex scrolls the container to the active
    // chip, but a mouse has no equivalent. The allowlist above only permits
    // this region to scroll; this asserts it still does.
    expect(
      declarationFor(
        '02-shell.css',
        '.dt-hidden-gutter:not(.dt-hidden-gutter--hidden)',
        'overflow',
      ),
    ).toMatch(/\b(auto|scroll)\b/);
  });
});
