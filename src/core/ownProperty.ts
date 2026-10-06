/**
 * Setting a key on an object being built as its own, the way `JSON.parse`
 * does, so that a column or a field named `__proto__` stays a key.
 *
 * Imports nothing, so the worker can use it too.
 */

/**
 * Set `key` on a plain object being built as an own, enumerable data
 * property, the way `JSON.parse` does. Assigning `__proto__` would run
 * `Object.prototype`'s setter instead, changing the object's prototype and
 * losing the key, and so would any setter a page adds to it. So a key the
 * object already answers to, inherited or set before, is defined; every
 * other key is assigned, which is the cheaper on rows a thousand columns
 * wide.
 *
 * @example
 * ```ts
 * const row: Record<string, unknown> = {};
 * setOwnProperty(row, '__proto__', 'x');
 * Object.hasOwn(row, '__proto__'); // true
 * Object.getPrototypeOf(row) === Object.prototype; // true
 * ```
 */
export function setOwnProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key in target) {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}
