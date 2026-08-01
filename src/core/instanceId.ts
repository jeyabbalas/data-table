/**
 * Per-instance identifier generator.
 *
 * Returns a short string of the form `t${n}-${hex}` (e.g. `t1-a3f9`) that is
 * mixed into DOM element IDs published by the library (modal titles and their
 * matching `aria-labelledby` targets, grid cell ids and their matching
 * `aria-activedescendant` target). Two `createDataTable()` instances on the
 * same page would otherwise produce duplicate IDs and break assistive
 * technology's ability to resolve the modal's accessible name or the grid's
 * active descendant.
 *
 * Shape rationale:
 * - The integer counter keeps IDs readable and monotonic within one bundle.
 * - The 4-hex random suffix defends against the "two bundled copies of the
 *   library on the same page" case where each module's counter starts at 0.
 */
let nextId = 0;

/** The random half of an instance id — see the module doc for why it exists. */
function randomSuffix(): string {
  return crypto.randomUUID().slice(0, 4);
}

export function nextInstanceId(): string {
  nextId += 1;
  return `t${nextId}-${randomSuffix()}`;
}

/**
 * Turn a caller-supplied `instanceId` into one that is unique on the page.
 *
 * `instanceId` is a public option, so nothing stops an app from handing the
 * same value to two tables — and unlike the auto-generated case, a duplicate
 * there is silent. The two grids then mint identical cell ids, and the
 * `aria-activedescendant` each publishes is an ambiguous IDREF: a screen
 * reader resolving it document-wide lands in whichever table comes first in
 * DOM order. (`TableContainer.resolveInGrid` scopes the library's *own*
 * lookup, but it cannot fix what AT sees.) Appending the same random suffix
 * `nextInstanceId()` uses keeps the caller's value recognisable in the DOM
 * while making collisions impossible.
 *
 * @param supplied - Caller-provided identifier, or empty/undefined to mint a
 *   fresh one.
 * @returns A page-unique identifier safe to embed in DOM ids.
 */
export function resolveInstanceId(supplied?: string | undefined): string {
  if (!supplied) return nextInstanceId();
  return `${supplied}-${randomSuffix()}`;
}
