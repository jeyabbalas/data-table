/**
 * Cutting text between graphemes, so that what a reader sees as one
 * character (an emoji joined from several code points, a flag, a letter and
 * its accents) is never split.
 *
 * A cut is asked for at a UTF-16 index, the measure the places that cut
 * text budget in: a type outline, a value inspector's preview and keys, an
 * error message's type. Imports nothing, so the worker could use it too.
 */

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/** A grapheme segmenter, or `null` where `Intl.Segmenter` is missing. */
function graphemes(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl === 'object' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  return graphemeSegmenter;
}

/** UTF-16 units either side of a cut that are segmented to find the grapheme it falls in. */
const WINDOW = 64;

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/** Whether a regional indicator (U+1F1E6 to U+1F1FF), half of a flag, starts at `i`. */
function isRegionalIndicatorAt(text: string, i: number): boolean {
  const low = text.charCodeAt(i + 1);
  return text.charCodeAt(i) === 0xd83c && low >= 0xdde6 && low <= 0xddff;
}

/**
 * Where to cut `text` at UTF-16 index `at` so as not to split a grapheme:
 * the start of the grapheme `at` falls inside, or `at` itself when it is
 * already between two. Never inside a surrogate pair. Without
 * `Intl.Segmenter`, and for a grapheme that reaches back further than
 * {@link WINDOW} units before `at`, too long to keep whole, the cut is at
 * `at`, moved off a surrogate pair's second half.
 *
 * Only the text around `at` is segmented. A window that starts inside a run
 * of regional indicators starts at the run instead, since flags pair them
 * from its first: a window from the middle of a flag would pair the rest
 * one off and cut a flag in two.
 *
 * @example
 * ```ts
 * const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // 👨‍👩‍👧, 8 units
 * graphemeStart(`ab${family}c`, 5);  // 2: the family starts there
 * graphemeStart(`ab${family}c`, 10); // 10: between the family and `c`
 * graphemeStart('éx', 1);      // 0: the accent belongs to the `e`
 * ```
 */
export function graphemeStart(text: string, at: number): number {
  if (at <= 0 || at >= text.length) return Math.max(0, Math.min(at, text.length));
  let cut = at;
  if (isLowSurrogate(text.charCodeAt(cut)) && isHighSurrogate(text.charCodeAt(cut - 1))) cut--;
  const segmenter = graphemes();
  if (!segmenter || cut === 0) return cut;
  let from = Math.max(0, cut - WINDOW);
  if (isLowSurrogate(text.charCodeAt(from)) && isHighSurrogate(text.charCodeAt(from - 1))) from--;
  while (from >= 2 && isRegionalIndicatorAt(text, from - 2)) from -= 2;
  const segment = segmenter.segment(text.slice(from, cut + WINDOW)).containing(cut - from);
  if (!segment || (segment.index === 0 && from > 0)) return cut;
  return from + segment.index;
}

/**
 * `text` in at most `max` UTF-16 units, the last of them `…` when it is
 * cut, and cut between graphemes ({@link graphemeStart}).
 *
 * @example
 * ```ts
 * clipText('struct field', 8);                      // 'struct …'
 * clipText('x'.repeat(6) + '\u{1F1FA}\u{1F1F8}', 8); // 'xxxxxx…': not half a flag
 * clipText('short', 8);                             // 'short'
 * ```
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return '…';
  return `${text.slice(0, graphemeStart(text, max - 1))}…`;
}
