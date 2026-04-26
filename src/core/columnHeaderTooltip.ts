/**
 * Shared helpers for column-header tooltip content.
 *
 * Used by both the Actions setter (write path) and the persistence
 * deserializer (restore path) so the validation rules live in exactly one
 * place. Every input is treated as untrusted: malformed shapes drop their
 * bad fields silently and an empty result returns `null` (which the caller
 * uses as a signal to clear the entry).
 */

import type { ColumnHeaderTooltipContent, ColumnHeaderTooltipItem } from './types';

/**
 * Coerce arbitrary input into a normalized {@link ColumnHeaderTooltipContent},
 * or `null` if the input has no usable content.
 *
 * Accepts:
 * - `null` / `undefined` → `null`.
 * - empty string → `null`.
 * - non-empty string → `{ description: string }` (description-only shorthand).
 * - object with any subset of `title`, `description`, `items` → validated
 *   field-by-field. Non-string title/description fields drop. Items with no
 *   `label` or with a `value` that is neither string nor string[] drop. An
 *   array `value` is filtered to non-empty strings; if nothing survives,
 *   the item drops.
 *
 * Returns `null` whenever the result has no `title`, no `description`, and
 * no surviving `items`.
 */
export function normalizeColumnHeaderTooltip(input: unknown): ColumnHeaderTooltipContent | null {
  if (input == null) return null;
  if (typeof input === 'string') {
    return input.length === 0 ? null : { description: input };
  }
  if (typeof input !== 'object') return null;

  const src = input as Partial<ColumnHeaderTooltipContent>;
  const out: ColumnHeaderTooltipContent = {};

  if (typeof src.title === 'string' && src.title.length > 0) {
    out.title = src.title;
  }
  if (typeof src.description === 'string' && src.description.length > 0) {
    out.description = src.description;
  }
  if (Array.isArray(src.items)) {
    const items: ColumnHeaderTooltipItem[] = [];
    for (const item of src.items) {
      if (!item || typeof item !== 'object') continue;
      const label = item.label;
      const value = item.value;
      if (typeof label !== 'string' || label.length === 0) continue;
      if (typeof value === 'string') {
        if (value.length === 0) continue;
        items.push({ label, value });
      } else if (Array.isArray(value)) {
        const vals = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
        if (vals.length === 0) continue;
        items.push({ label, value: vals });
      }
    }
    if (items.length > 0) out.items = items;
  }

  if (!out.title && !out.description && !out.items) return null;
  return out;
}

/**
 * Deep equality for two normalized {@link ColumnHeaderTooltipContent} values.
 * Used by the setter to skip no-op signal notifications when re-setting the
 * same content.
 */
export function tooltipContentEquals(
  a: ColumnHeaderTooltipContent | null,
  b: ColumnHeaderTooltipContent | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.title !== b.title) return false;
  if (a.description !== b.description) return false;
  const ai = a.items ?? [];
  const bi = b.items ?? [];
  if (ai.length !== bi.length) return false;
  for (let i = 0; i < ai.length; i++) {
    if (ai[i].label !== bi[i].label) return false;
    const av = ai[i].value;
    const bv = bi[i].value;
    if (Array.isArray(av) !== Array.isArray(bv)) return false;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let j = 0; j < av.length; j++) {
        if (av[j] !== bv[j]) return false;
      }
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}
