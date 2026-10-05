/**
 * Column names as DuckDB tells them apart.
 *
 * DuckDB binds a column name ignoring the case of its ASCII letters, quoted
 * or not: `"LABEL"` reads a column named `label`. A VIEW that would hold
 * both renames the second one `LABEL_1`, so `SELECT "LABEL"` reads
 * `label`'s values. Every other character is compared as it is: `é` and `É`
 * are two names.
 *
 * Without dependencies, so the action layer and the lazily loaded
 * extract-expression module can both import it.
 */

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
