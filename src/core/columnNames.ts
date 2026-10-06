/**
 * Column names as DuckDB tells them apart.
 *
 * DuckDB binds a column name ignoring the case of its ASCII letters, quoted
 * or not: `"LABEL"` reads a column named `label`. A VIEW that would hold
 * both renames the second one `LABEL_1`, so `SELECT "LABEL"` reads
 * `label`'s values. Every other character is compared as it is: `é` and `É`
 * are two names.
 *
 * Without dependencies but the row id's name, which has none, so the action
 * layer and the lazily loaded extract-expression module can both import it.
 */

import { ROWID_COLUMN } from './types';

/**
 * The key DuckDB tells column names apart by: ASCII letters in either case
 * are the same (`label` and `LABEL` name one column), while every other
 * character is compared as is (`é` and `É` name two).
 *
 * @example
 * ```ts
 * columnNameKey('LABEL') === columnNameKey('label'); // true
 * columnNameKey('É') === columnNameKey('é'); // false
 * ```
 */
export function columnNameKey(name: string): string {
  return name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}

/**
 * The name in `names` that a column named `name` would collide with in
 * DuckDB: `name` itself when `names` has it, else one that differs from it
 * only in the case of ASCII letters, else `undefined`.
 *
 * @example
 * ```ts
 * collidingColumnName('LABEL', ['id', 'label']); // 'label'
 * collidingColumnName('label', ['LABEL', 'label']); // 'label'
 * collidingColumnName('É', ['é']); // undefined
 * ```
 */
export function collidingColumnName(name: string, names: Iterable<string>): string | undefined {
  const key = columnNameKey(name);
  let collision: string | undefined;
  for (const other of names) {
    if (other === name) return other;
    if (collision === undefined && columnNameKey(other) === key) collision = other;
  }
  return collision;
}

/**
 * The name a new column called `name` would clash with, the rule a new
 * column's name is checked by: the synthetic row id's, `__rowid__`, for
 * `name` that spells it in any letter case, whether `names` lists the row id
 * or not; otherwise {@link collidingColumnName}'s answer, `name` itself
 * when `names` holds it and a name that differs from it only in letter case
 * when that is all there is. `undefined` when the name is free.
 *
 * @example
 * ```ts
 * takenColumnName('__RowId__', ['id']); // '__rowid__'
 * takenColumnName('label', ['id', 'label']); // 'label'
 * takenColumnName('LABEL', ['id', 'label']); // 'label'
 * takenColumnName('total', ['id', 'label']); // undefined
 * ```
 */
export function takenColumnName(name: string, names: Iterable<string>): string | undefined {
  return columnNameKey(name) === ROWID_COLUMN ? ROWID_COLUMN : collidingColumnName(name, names);
}
