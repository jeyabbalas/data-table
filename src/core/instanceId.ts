/**
 * Per-instance identifier generator.
 *
 * Returns a short string of the form `t${n}-${hex}` (e.g. `t1-a3f9`) that is
 * mixed into DOM element IDs published by the library (modal titles and their
 * matching `aria-labelledby` targets). Two `createDataTable()` instances on
 * the same page would otherwise produce duplicate IDs and break assistive
 * technology's ability to resolve the modal's accessible name.
 *
 * Shape rationale:
 * - The integer counter keeps IDs readable and monotonic within one bundle.
 * - The 4-hex random suffix defends against the "two bundled copies of the
 *   library on the same page" case where each module's counter starts at 0.
 */
let nextId = 0;

export function nextInstanceId(): string {
  nextId += 1;
  const suffix = crypto.randomUUID().slice(0, 4);
  return `t${nextId}-${suffix}`;
}
