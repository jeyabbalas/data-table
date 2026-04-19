/**
 * Stylesheet presence detection.
 *
 * `@jeyabbalas/data-table/styles` sets a `--dt-stylesheet-loaded: 1;` custom
 * property on `:root` as a sentinel. Consumers who forget to import the
 * stylesheet see an unstyled table; this helper (and the `warning` event
 * with code `STYLESHEET_MISSING` emitted by `createDataTable`) surface the
 * misconfiguration.
 *
 * Pair the sync `isStylesheetLoaded()` getter with the reactive
 * `warning` event: the getter is useful for pre-mount checks (e.g. React
 * `useEffect` that wants to bail before rendering); the event is useful for
 * logging and telemetry.
 */

/**
 * Return `true` if the library stylesheet is loaded in the document.
 *
 * @param root - Element to check. Defaults to `document.documentElement`. Pass
 *   the owning `.dt-root` if you shadow-root or scope styles differently; the
 *   sentinel is inherited from the document root so the default works for
 *   every standard deployment.
 */
export function isStylesheetLoaded(root?: HTMLElement): boolean {
  const el = root ?? document.documentElement;
  return getComputedStyle(el).getPropertyValue('--dt-stylesheet-loaded').trim() !== '';
}
