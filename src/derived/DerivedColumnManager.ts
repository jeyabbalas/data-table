/**
 * Derived Column Manager
 *
 * Handles all DuckDB operations for derived columns: VIEW lifecycle,
 * vector helper tables, expression validation, and type detection.
 *
 * When derived columns exist, a DuckDB VIEW is created that includes
 * all base columns plus derived columns. All existing query paths
 * transparently query through the VIEW via state.tableName.
 *
 * Most consumers should use `table.actions.addDerivedColumn()` instead of
 * instantiating this directly; it only makes sense to construct one when
 * composing a custom pipeline with the `/advanced` primitives.
 *
 * @example
 * // Preferred: go through StateActions
 * await table.actions.addDerivedColumn({
 *   kind: 'expression',
 *   name: 'price_tier',
 *   expression: `CASE WHEN price < 10 THEN 'low' WHEN price < 100 THEN 'mid' ELSE 'high' END`,
 * });
 *
 * @see DerivedColumnModal
 * @see DerivedColumnEditPanel
 * @see AddColumnButton
 * @see DefaultExpressionEditor
 */

import { ConfigurationError, DerivedColumnError } from '../core/errors';
import type { ColumnSchema, DataType } from '../core/types';
import { mapDuckDBType } from '../data/SchemaDetector';
import type { WorkerBridge } from '../data/WorkerBridge';
import { quoteIdentifier, formatSQLValue } from '../filters/FilterSQL';
import type {
  DerivedColumnDef,
  DerivedColumnInfo,
  VectorColumnDef,
  VectorDataType,
  CompletionContext,
} from './types';

/** Batch size for vector INSERT statements */
const VECTOR_BATCH_SIZE = 1000;

/**
 * A query that binds `select`, and so reports its errors, without reading a
 * row or returning its columns. The result of `select` itself would have to
 * cross Arrow even when empty, and Arrow has no VARIANT type: a VARIANT
 * expression failed validation with "Unsupported Arrow type VARIANT".
 */
function bindOnly(select: string): string {
  return `SELECT NULL FROM (${select}) LIMIT 0`;
}

/**
 * The SELECT of the VIEW's layer for one expression column: every column of
 * `from` and the expression's value as `name`. Validation binds the same
 * SELECT, so that it refuses what the VIEW could not be built with.
 */
function layerSelect(expression: string, name: string, from: string): string {
  return `SELECT *, (${expression}) AS ${quoteIdentifier(name)} FROM ${from}`;
}

/** An error's message, or the value as text. */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * What a derived column is refused for when its expression returns several
 * rows for a row, or none: `unnest(tags)` gives a row for each element.
 */
const SET_RETURNING_MESSAGE =
  'An expression that returns several rows for each row, such as unnest(), cannot be a column. ' +
  'Use a list function such as list_transform, or a subquery.';

/**
 * What a derived column is refused for when its expression is an aggregate,
 * which makes one row of the table.
 */
const AGGREGATE_MESSAGE = 'sum() and other aggregates need a window to be a column: sum(x) OVER ()';

/**
 * The number the next manager made on each bridge takes, which its helper
 * tables are named with. Per bridge, since a bridge is one DuckDB database:
 * two tables sharing one must not share a helper table, nor must the
 * managers one table goes through as it loads new data or undoes a change.
 */
const nextManagerNumbers = new WeakMap<object, number>();

/**
 * Owns derived-column lifecycle: validates SQL expressions through DuckDB
 * (binding, without reading a row, the column each would be in the VIEW),
 * maintains a wrapper VIEW (`__dt_view_<baseTableName>__`) over the source
 * table, generates SELECT lists for each derived column, and re-validates
 * dependents on rename / replace. Every change is all or nothing: when one
 * fails, the derived columns and the VIEW are as they were. Composed by the
 * facade; reachable on `/advanced` for power users.
 */
export class DerivedColumnManager {
  /** VIEW name: __dt_view_<baseTableName>__ */
  readonly viewName: string;

  /** Ordered list of derived column info */
  private columns: DerivedColumnInfo[] = [];

  /** Monotonic counter for unique helper table names */
  private nextHelperTableId = 0;
  /**
   * The helper table of each vector column, by the column's info: every
   * helper table this manager made and has not dropped. A change makes the
   * new column's under a name of its own, beside the old column's, and
   * drops the one no column reads once the VIEW is built, or, when the VIEW
   * cannot be, the new one.
   */
  private helperTables = new Map<DerivedColumnInfo, string>();
  /** `__dt_vec_<n>_`, `n` this manager's number on its bridge */
  private readonly helperTablePrefix: string;

  constructor(
    private bridge: WorkerBridge,
    private baseTableName: string,
    private getTotalRows: () => number = () => 0,
  ) {
    this.viewName = `__dt_view_${baseTableName}__`;
    const managerNumber = nextManagerNumbers.get(bridge) ?? 0;
    nextManagerNumbers.set(bridge, managerNumber + 1);
    this.helperTablePrefix = `__dt_vec_${managerNumber}_`;
  }

  // --- Public API ---

  /** Returns VIEW name if derived columns exist, base table name otherwise */
  getEffectiveTableName(): string {
    return this.columns.length > 0 ? this.viewName : this.baseTableName;
  }

  /** Returns current derived column info list (copy) */
  getColumns(): DerivedColumnInfo[] {
    return [...this.columns];
  }

  /**
   * Add a derived column. Validates expression (or creates helper table for vectors),
   * detects type via DuckDB, recreates VIEW, returns its info. All or nothing: when
   * any step fails, the derived columns and the VIEW are as they were.
   */
  async addColumn(def: DerivedColumnDef): Promise<DerivedColumnInfo> {
    let info: DerivedColumnInfo;

    if (def.kind === 'expression') {
      // Check for circular dependencies BEFORE SQL validation.
      // This prevents self-referential expressions from passing validation
      // against the VIEW (where the old column would still exist).
      const tentativeInfo: DerivedColumnInfo = {
        def,
        detectedType: 'string', // placeholder
        detectedOriginalType: 'VARCHAR',
      };
      const savedColumns = this.columns;
      this.columns = [...savedColumns, tentativeInfo];
      try {
        this.topologicalSortExpressions();
      } catch (err) {
        this.columns = savedColumns;
        throw err;
      }
      this.columns = savedColumns;

      // Validate expression
      await this.validateExpressionSQL(def.expression, def.name);
      // Detect result type
      info = { def, ...(await this.detectType(def.expression)) };
    } else {
      // Vector column: create helper table
      this.assertVectorLength(def);
      info = await this.vectorColumnInfo(def);
    }

    await this.commitColumns([...this.columns, info]);
    return info;
  }

  /**
   * Update a derived column's expression/name/values.
   * Validates, recreates VIEW (and helper table if vector). Returns updated info.
   * All or nothing: when any step fails, the column keeps its definition, and a
   * vector column its helper table.
   */
  async updateColumn(oldName: string, def: DerivedColumnDef): Promise<DerivedColumnInfo> {
    const oldIndex = this.columns.findIndex((c) => c.def.name === oldName);
    if (oldIndex === -1) {
      throw new DerivedColumnError(`Derived column "${oldName}" not found`, {
        code: 'NOT_FOUND',
        details: { column: oldName },
      });
    }

    // Block rename if other columns depend on this one
    const isRename = oldName !== def.name;
    if (isRename) {
      const dependents = this.getDependents(oldName);
      if (dependents.length > 0) {
        throw new DerivedColumnError(
          `Cannot rename "${oldName}" because it is referenced by: ${dependents.map((d) => `"${d}"`).join(', ')}. Update those columns first.`,
          {
            code: 'EXPRESSION_INVALID',
            details: { column: oldName, dependents },
          },
        );
      }
    }

    let newInfo: DerivedColumnInfo;

    if (def.kind === 'expression') {
      // Cycle detection: tentatively replace and check
      const tentativeInfo: DerivedColumnInfo = {
        def,
        detectedType: 'string',
        detectedOriginalType: 'VARCHAR',
      };
      const savedColumns = [...this.columns];
      this.columns[oldIndex] = tentativeInfo;
      try {
        this.topologicalSortExpressions();
      } catch (err) {
        this.columns = savedColumns;
        throw err;
      }
      this.columns = savedColumns;

      await this.validateExpressionSQL(def.expression, def.name);
      newInfo = { def, ...(await this.detectType(def.expression)) };
    } else {
      this.assertVectorLength(def);
      newInfo = await this.vectorColumnInfo(def);
    }

    // Replace in-place to maintain order. An old vector column's helper
    // table is dropped once the VIEW no longer reads it.
    const columns = [...this.columns];
    columns[oldIndex] = newInfo;
    await this.commitColumns(columns);

    return newInfo;
  }

  /**
   * Replace a derived column at the same name with a new definition.
   *
   * Same-name-only — does not support renaming (use {@link updateColumn} for that).
   * Pre-flights every dependent against the proposed new def before touching the
   * VIEW. On dependent incompatibility, throws a `DEPENDENTS_INCOMPATIBLE` error
   * whose `details.dependentsAffected` lists the dependent names and
   * `details.reasons` maps each name to the DuckDB error. All or nothing, as
   * {@link updateColumn} is.
   */
  async replaceColumn(name: string, newDef: DerivedColumnDef): Promise<DerivedColumnInfo> {
    if (newDef.name !== name) {
      throw new DerivedColumnError(
        `replaceColumn does not support renaming: target "${name}" vs new "${newDef.name}". Use updateColumn instead.`,
        { code: 'EXPRESSION_INVALID', details: { target: name, newName: newDef.name } },
      );
    }

    const oldIndex = this.columns.findIndex((c) => c.def.name === name);
    if (oldIndex === -1) {
      throw new DerivedColumnError(`Derived column "${name}" not found`, {
        code: 'NOT_FOUND',
        details: { column: name },
      });
    }

    let newInfo: DerivedColumnInfo;

    if (newDef.kind === 'expression') {
      // 1. Validate the new expression in isolation against the current VIEW.
      await this.validateExpressionSQL(newDef.expression, newDef.name);

      // 2. Detect the new expression's result type.
      newInfo = { def: newDef, ...(await this.detectType(newDef.expression)) };

      // 3. Cycle check with tentative in-memory swap.
      const savedColumns = [...this.columns];
      this.columns[oldIndex] = newInfo;
      try {
        this.topologicalSortExpressions();
      } catch (err) {
        this.columns = savedColumns;
        throw err;
      }
      this.columns = savedColumns;

      // 4. CTE-based pre-flight of every dependent against the proposed new def.
      const reasons = await this.validateDependentsAgainst(name, newDef);
      if (Object.keys(reasons).length > 0) {
        throw new DerivedColumnError(
          `Replacing "${name}" would break ${Object.keys(reasons).length} dependent column(s): ${Object.keys(
            reasons,
          )
            .map((d) => `"${d}"`)
            .join(', ')}`,
          {
            code: 'DEPENDENTS_INCOMPATIBLE',
            details: {
              column: name,
              dependentsAffected: Object.keys(reasons),
              reasons,
            },
          },
        );
      }
    } else {
      this.assertVectorLength(newDef);
      // For vector replace, defer helper-table creation until after dependent
      // pre-flight (dependents of a vector are empty in practice, but we still
      // run the check for symmetry and to catch forward-compat regressions).
      const reasons = await this.validateDependentsAgainst(name, newDef);
      if (Object.keys(reasons).length > 0) {
        throw new DerivedColumnError(
          `Replacing vector "${name}" would break ${Object.keys(reasons).length} dependent column(s): ${Object.keys(reasons).join(', ')}`,
          {
            code: 'DEPENDENTS_INCOMPATIBLE',
            details: {
              column: name,
              dependentsAffected: Object.keys(reasons),
              reasons,
            },
          },
        );
      }
      newInfo = await this.vectorColumnInfo(newDef);
    }

    // The new vector column's helper table stands beside the old column's
    // until the VIEW reads it, and the one no column reads is dropped.
    const columns = [...this.columns];
    columns[oldIndex] = newInfo;
    await this.commitColumns(columns);

    return newInfo;
  }

  /**
   * Remove a derived column. Drops helper table if vector.
   * Recreates VIEW without column, or drops VIEW entirely if last derived column.
   * All or nothing: when the VIEW cannot be rebuilt or dropped, the column stays,
   * with its helper table.
   */
  async removeColumn(name: string): Promise<void> {
    const index = this.columns.findIndex((c) => c.def.name === name);
    if (index === -1) {
      throw new DerivedColumnError(`Derived column "${name}" not found`, {
        code: 'NOT_FOUND',
        details: { column: name },
      });
    }

    // Block deletion if other columns depend on this one
    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      throw new DerivedColumnError(
        `Cannot delete "${name}" because it is referenced by: ${dependents.map((d) => `"${d}"`).join(', ')}. Delete those columns first.`,
        {
          code: 'EXPRESSION_INVALID',
          details: { column: name, dependents },
        },
      );
    }

    // Recreate or drop VIEW, then drop the helper table of a vector column.
    await this.commitColumns(this.columns.filter((_, i) => i !== index));
  }

  /**
   * Validate an expression without adding it. For UI preview/validation button.
   */
  async validateExpression(
    expression: string,
    alias?: string,
  ): Promise<{
    valid: boolean;
    type?: DataType;
    originalType?: string;
    error?: string;
  }> {
    try {
      await this.validateExpressionSQL(expression, alias ?? '__test__');
      const typeInfo = await this.detectType(expression);
      return {
        valid: true,
        type: typeInfo.detectedType,
        originalType: typeInfo.detectedOriginalType,
      };
    } catch (err) {
      return {
        valid: false,
        error: this.cleanErrorMessage(err),
      };
    }
  }

  /**
   * Build completion context for editor autocompletion.
   * Lists all base + derived column names with types.
   */
  getCompletionContext(baseSchema: ColumnSchema[]): CompletionContext {
    const columns: CompletionContext['columns'] = [];

    for (const col of baseSchema) {
      if (!col.isDerived) {
        columns.push({
          name: col.name,
          type: col.originalType,
          isDerived: false,
        });
      }
    }

    for (const info of this.columns) {
      columns.push({
        name: info.def.name,
        type: info.detectedOriginalType,
        isDerived: true,
      });
    }

    return { columns };
  }

  /**
   * Recreate all derived columns from saved definitions (for session restore / undo).
   * Creates helper tables for vectors, then creates VIEW.
   * Skips columns that fail with a warning.
   */
  async restoreColumns(defs: DerivedColumnDef[]): Promise<ColumnSchema[]> {
    const restoredSchemas: ColumnSchema[] = [];

    for (const def of defs) {
      try {
        const info = await this.addColumn(def);
        restoredSchemas.push({
          name: def.name,
          type: info.detectedType,
          nullable: true,
          originalType: info.detectedOriginalType,
          isDerived: true,
          expression: def.kind === 'expression' ? def.expression : undefined,
        });
      } catch (err) {
        console.warn(`Failed to restore derived column "${def.name}":`, err);
      }
    }

    return restoredSchemas;
  }

  /** Clean up: drop VIEW, drop all helper tables */
  async destroy(): Promise<void> {
    // Drop every helper table this manager made and has not dropped: its
    // vector columns', and one a failed change could not drop.
    for (const tableName of [...this.helperTables.values()]) {
      try {
        await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
      } catch {
        // Best-effort cleanup
      }
    }

    // Drop VIEW
    try {
      await this.dropView();
    } catch {
      // Best-effort cleanup
    }

    this.columns = [];
    this.helperTables.clear();
    this.nextHelperTableId = 0;
  }

  // --- Dependency tracking ---

  /**
   * Find which existing derived columns an expression references.
   * Strips single-quoted string literals first to avoid false positives.
   */
  private getExpressionDependencies(expression: string, excludeName?: string): Set<string> {
    const deps = new Set<string>();

    // Strip single-quoted string literals to avoid matching column names inside strings
    const stripped = expression.replace(/'(?:[^'\\]|\\.)*'/g, '');

    for (const info of this.columns) {
      const name = info.def.name;
      if (name === excludeName) continue;

      // Check for quoted identifier: "column_name" (with DuckDB double-quote escaping)
      const quotedPattern = `"${name.replace(/"/g, '""')}"`;
      if (stripped.includes(quotedPattern)) {
        deps.add(name);
        continue;
      }

      // Check for unquoted identifier with word boundaries (case-insensitive).
      // Only for names that are valid unquoted SQL identifiers.
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(stripped)) {
          deps.add(name);
        }
      }
    }

    return deps;
  }

  /**
   * Return expression columns in dependency order using Kahn's algorithm.
   * Throws if a circular dependency is detected.
   * Operates only on expression columns — vectors have no dependencies.
   */
  private topologicalSortExpressions(): DerivedColumnInfo[] {
    const expressions = this.columns.filter((c) => c.def.kind === 'expression');
    if (expressions.length <= 1) return expressions;

    const exprNames = new Set(expressions.map((c) => c.def.name));
    const exprMap = new Map(expressions.map((c) => [c.def.name, c]));

    // Build adjacency: for each column, which other expression columns does it depend on?
    const deps = new Map<string, Set<string>>();
    for (const col of expressions) {
      const allDeps = this.getExpressionDependencies(
        (col.def as { expression: string }).expression,
      );
      // Only keep dependencies on other expression columns
      deps.set(col.def.name, new Set([...allDeps].filter((d) => exprNames.has(d))));
    }

    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    for (const [name, d] of deps) {
      inDegree.set(name, d.size);
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      sorted.push(name);

      for (const [other, otherDeps] of deps) {
        if (otherDeps.has(name)) {
          otherDeps.delete(name);
          const newDegree = inDegree.get(other)! - 1;
          inDegree.set(other, newDegree);
          if (newDegree === 0) {
            queue.push(other);
          }
        }
      }
    }

    if (sorted.length !== expressions.length) {
      const inCycle = expressions
        .filter((c) => !sorted.includes(c.def.name))
        .map((c) => `"${c.def.name}"`);
      throw new DerivedColumnError(
        `Circular dependency detected among derived columns: ${inCycle.join(', ')}`,
        {
          code: 'CIRCULAR_DEPENDENCY',
          details: { cycle: inCycle },
        },
      );
    }

    return sorted.map((name) => exprMap.get(name)!);
  }

  /**
   * Return names of expression columns that directly reference the given column.
   * Used for deletion protection and rename blocking.
   */
  getDependents(columnName: string): string[] {
    const dependents: string[] = [];
    for (const col of this.columns) {
      if (col.def.kind === 'expression') {
        const deps = this.getExpressionDependencies((col.def as { expression: string }).expression);
        if (deps.has(columnName)) {
          dependents.push(col.def.name);
        }
      }
    }
    return dependents;
  }

  // --- Private implementation ---

  /**
   * Table name to use for validation and type detection queries.
   * Uses the VIEW (which includes all existing derived columns) when available,
   * falls back to the base table when no derived columns exist yet.
   */
  private get validationTableName(): string {
    return this.columns.length > 0 ? this.viewName : this.baseTableName;
  }

  /**
   * Validate expression as the column of the VIEW it would be: binds the
   * VIEW's layer for it, `SELECT *, (<expr>) AS "<alias>" FROM
   * "<view_or_base>"` (see {@link layerSelect}), without reading a row (see
   * {@link bindOnly}). An aggregate binds alone, as `SELECT sum(price) FROM
   * t`, and not beside the other columns, where DuckDB asks for one of them,
   * often `__rowid__`, to be grouped by: it is refused with what to write
   * instead. Whether the expression has one value for each row is for
   * {@link detectType} to check.
   */
  private async validateExpressionSQL(expression: string, alias: string): Promise<void> {
    const sql = bindOnly(layerSelect(expression, alias, quoteIdentifier(this.validationTableName)));
    try {
      await this.bridge.query(sql);
    } catch (err) {
      if (/must appear in the GROUP BY clause/i.test(errorText(err))) {
        throw new DerivedColumnError(AGGREGATE_MESSAGE, { code: 'EXPRESSION_INVALID', cause: err });
      }
      throw err;
    }
  }

  /**
   * Enforce that a vector column's values array has exactly one entry per base
   * table row. Short arrays previously produced silent NULLs via the rowid
   * LEFT JOIN; long arrays silently dropped entries.
   */
  private assertVectorLength(def: VectorColumnDef): void {
    const expected = this.getTotalRows();
    const actual = def.values.length;
    if (expected > 0 && actual !== expected) {
      throw new DerivedColumnError(
        `Vector column "${def.name}" has ${actual} values but the table has ${expected} rows`,
        {
          code: 'VECTOR_LENGTH_MISMATCH',
          details: { column: def.name, expected, actual },
        },
      );
    }
  }

  /**
   * Pre-flight every dependent's expression against a tentative replacement of
   * `oldName` with `newDef`, without mutating the real VIEW. Walks dependents
   * in topological order and builds a scratch CTE per dependent that includes
   * the new expression (and any previously-validated intermediate dependents
   * it transitively depends on). Returns a map of `dependentName → duckdbError`
   * for failures; an empty map means the replacement is safe.
   *
   * Vector replacements cannot have dependents (vectors are terminal in the
   * dependency graph), so this returns an empty map when `newDef.kind === 'vector'`.
   */
  private async validateDependentsAgainst(
    oldName: string,
    newDef: DerivedColumnDef,
  ): Promise<Record<string, string>> {
    const reasons: Record<string, string> = {};

    // Collect the transitive set of expression columns that depend on `oldName`.
    const directDependents = new Set(this.getDependents(oldName));
    if (directDependents.size === 0) return reasons;

    // Build transitive closure by repeatedly expanding via getDependents.
    const transitive = new Set<string>(directDependents);
    let frontier: string[] = [...directDependents];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const depName of frontier) {
        for (const innerDep of this.getDependents(depName)) {
          if (!transitive.has(innerDep)) {
            transitive.add(innerDep);
            next.push(innerDep);
          }
        }
      }
      frontier = next;
    }

    // Topologically order the transitive dependents so earlier CTE layers feed
    // later ones. Reuse the manager's existing sort, then filter to our set.
    const sortedAll = this.topologicalSortExpressions();
    const sortedDependents = sortedAll.filter((info) => transitive.has(info.def.name));

    // Build scratch CTE SQL. Layer 0 = base table + the replacement. Layers 1..N =
    // each dependent in topo order. We validate by running `SELECT (<depExpr>)
    // FROM <lastLayer> LIMIT 0` at each layer. Any dependent that fails gets
    // its error captured; validation of later dependents continues using the
    // dependent's original expression (best-effort enumeration).
    const replacementExpr =
      newDef.kind === 'expression' ? (newDef as { expression: string }).expression : null;

    if (replacementExpr === null) {
      // Vector replacements produce a fixed type; no expression to inject.
      // For dependents that reference the vector column, the column still
      // exists with its new DuckDB type. Validate each dependent against a
      // scratch CTE that shadows the vector column with a CAST to the new type.
      const newVectorType = (newDef as VectorColumnDef).vectorType;
      const duckdbType = this.vectorTypeToDuckDBType(newVectorType);
      for (const depInfo of sortedDependents) {
        const depExpr = (depInfo.def as { expression: string }).expression;
        const preflightCTE = `WITH __dt_preflight AS (SELECT * REPLACE (CAST(${quoteIdentifier(oldName)} AS ${duckdbType}) AS ${quoteIdentifier(oldName)}) FROM ${quoteIdentifier(this.validationTableName)})`;
        const sql = `${preflightCTE} ${bindOnly(`SELECT (${depExpr}) AS ${quoteIdentifier(depInfo.def.name)} FROM __dt_preflight`)}`;
        try {
          await this.bridge.query(sql);
        } catch (err) {
          reasons[depInfo.def.name] = this.cleanErrorMessage(err);
        }
      }
      return reasons;
    }

    // Expression replacement. Build a layered CTE where layer 0 replaces
    // `oldName` with `(newExpr)` and subsequent layers add each intermediate
    // dependent so transitive dependents see the correct type.
    const cteLayers: string[] = [];
    const baseCTE = `__dt_preflight_0 AS (SELECT * REPLACE ((${replacementExpr}) AS ${quoteIdentifier(oldName)}) FROM ${quoteIdentifier(this.validationTableName)})`;
    cteLayers.push(baseCTE);

    let prevLayer = '__dt_preflight_0';
    for (let i = 0; i < sortedDependents.length; i++) {
      const depInfo = sortedDependents[i]!;
      const depExpr = (depInfo.def as { expression: string }).expression;
      const layerName = `__dt_preflight_${i + 1}`;

      // Validate the dependent's expression against the previous layer.
      const validateSql = `WITH ${cteLayers.join(', ')} ${bindOnly(`SELECT (${depExpr}) AS ${quoteIdentifier(depInfo.def.name)} FROM ${prevLayer}`)}`;
      try {
        await this.bridge.query(validateSql);
      } catch (err) {
        reasons[depInfo.def.name] = this.cleanErrorMessage(err);
        // Continue validating remaining dependents; the failed layer will
        // silently carry the original (pre-replace) column into subsequent
        // layers, which is enough to keep enumeration going.
      }

      // Add this dependent as a layer for subsequent transitive dependents.
      cteLayers.push(
        `${layerName} AS (SELECT *, (${depExpr}) AS ${quoteIdentifier(depInfo.def.name)} FROM ${prevLayer})`,
      );
      prevLayer = layerName;
    }

    return reasons;
  }

  /**
   * Detect type: `DESCRIBE SELECT (<expr>) AS v FROM "<view_or_base>"`, then
   * mapDuckDBType().
   *
   * DESCRIBE binds the query without running it, so the type is known on an
   * empty table too: a `typeof()` over the rows had none to read there, and
   * fell back to `VARCHAR`.
   *
   * Its QUALIFY binds the expression once more, where DuckDB refuses UNNEST
   * ("UNNEST not supported here"): `unnest(tags)`, and an unnest in a CASE or
   * behind a macro such as `generate_subscripts`, which return a row for each
   * element of a list and none for an empty one. As a column, one gave the
   * VIEW more rows than the table, or fewer, with `__rowid__` repeated. An
   * unnest in a subquery, `(SELECT max(u) FROM unnest(tags) AS x(u))`, is one
   * value, and binds. QUALIFY takes window functions, and needs one: the
   * `row_number() OVER ()`. It refuses a star expression too, which a column
   * takes (`COLUMNS('price') * 2`): one is described without it, unchecked.
   */
  private async detectType(expression: string): Promise<{
    detectedType: DataType;
    detectedOriginalType: string;
  }> {
    const describe = `DESCRIBE SELECT (${expression}) AS v FROM ${quoteIdentifier(this.validationTableName)}`;
    let rows: { column_name: string; column_type: string }[];
    try {
      rows = await this.bridge.query(
        `${describe} QUALIFY row_number() OVER () > 0 AND (${expression}) IS NOT NULL`,
      );
    } catch (err) {
      const text = errorText(err);
      if (/UNNEST not supported here/i.test(text)) {
        throw new DerivedColumnError(SET_RETURNING_MESSAGE, {
          code: 'EXPRESSION_INVALID',
          cause: err,
        });
      }
      if (!/STAR expression is not supported here/i.test(text)) throw err;
      rows = await this.bridge.query(describe);
    }
    const originalType = rows[0]?.column_type ?? 'VARCHAR';
    return {
      detectedType: mapDuckDBType(originalType),
      detectedOriginalType: originalType,
    };
  }

  /**
   * A vector column's info, with its helper table made and its values
   * INSERTed in batches. The table is named
   * `__dt_vec_<manager>_<sanitizedName>_<id>__`, `<manager>` this manager's
   * number on its bridge and `<id>` the table's number in this manager: no
   * two tables in one DuckDB database share a name, and the table of an
   * update stands beside the one it replaces until the VIEW reads it. When a
   * step fails, the table stays listed, for the next change or
   * {@link destroy} to drop.
   */
  private async vectorColumnInfo(def: VectorColumnDef): Promise<DerivedColumnInfo> {
    const duckdbType = this.vectorTypeToDuckDBType(def.vectorType);
    const info: DerivedColumnInfo = {
      def,
      detectedType: mapDuckDBType(duckdbType),
      detectedOriginalType: duckdbType,
    };
    const sanitized = def.name.replace(/[^a-zA-Z0-9]/g, '_');
    const tableName = `${this.helperTablePrefix}${sanitized}_${this.nextHelperTableId++}__`;
    this.helperTables.set(info, tableName);

    // Dropped first, as a CREATE TABLE of a name taken fails.
    await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);

    // Create table
    await this.bridge.query(
      `CREATE TABLE ${quoteIdentifier(tableName)} (__rowid__ BIGINT, ${quoteIdentifier(def.name)} ${duckdbType})`,
    );

    // Insert values in batches. Iterate by index so both plain arrays and
    // TypedArrays (Uint8Array etc.) work — TypedArray.prototype.map returns
    // another TypedArray that coerces string callbacks to NaN→0.
    const values = def.values;
    for (let i = 0; i < values.length; i += VECTOR_BATCH_SIZE) {
      const end = Math.min(i + VECTOR_BATCH_SIZE, values.length);
      const parts: string[] = [];
      for (let j = i; j < end; j++) {
        parts.push(`(${j}, ${formatSQLValue(values[j])})`);
      }
      await this.bridge.query(
        `INSERT INTO ${quoteIdentifier(tableName)} VALUES ${parts.join(', ')}`,
      );
    }
    return info;
  }

  /** The helper table of a vector column, by its info. */
  private helperTableOf(info: DerivedColumnInfo): string {
    const tableName = this.helperTables.get(info);
    if (tableName === undefined) {
      throw new ConfigurationError(`No helper table for column "${info.def.name}"`, {
        code: 'INVARIANT',
        details: { column: info.def.name },
      });
    }
    return tableName;
  }

  /**
   * Make `columns` the derived columns: build the VIEW for them, or drop it
   * for none, then drop the helper tables none of them reads. All or
   * nothing: when the VIEW cannot be built or dropped, the columns are left
   * as they were, and so is the VIEW (a CREATE OR REPLACE VIEW that fails
   * leaves the one there was), and the helper tables made for the change
   * are dropped.
   */
  private async commitColumns(columns: DerivedColumnInfo[]): Promise<void> {
    const previous = this.columns;
    this.columns = columns;
    try {
      await this.recreateView();
    } catch (err) {
      this.columns = previous;
      await this.dropUnusedHelperTables();
      throw err;
    }
    await this.dropUnusedHelperTables();
  }

  /**
   * Drop the helper tables no derived column reads. Best-effort: one whose
   * DROP fails stays listed, for a later change or {@link destroy} to drop.
   */
  private async dropUnusedHelperTables(): Promise<void> {
    for (const [info, tableName] of [...this.helperTables]) {
      if (this.columns.includes(info)) continue;
      try {
        await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
        this.helperTables.delete(info);
      } catch {
        // Stays listed.
      }
    }
  }

  /** Map VectorDataType to DuckDB type string */
  private vectorTypeToDuckDBType(vt: VectorDataType): string {
    switch (vt) {
      case 'integer':
        return 'BIGINT';
      case 'float':
        return 'DOUBLE';
      case 'decimal':
        return 'DECIMAL(18,6)';
      case 'string':
        return 'VARCHAR';
      case 'boolean':
        return 'BOOLEAN';
      case 'uuid':
        return 'UUID';
      case 'date':
        return 'DATE';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'time':
        return 'TIME';
      case 'interval':
        return 'INTERVAL';
    }
  }

  /**
   * Recreate the VIEW from current columns list using CTEs.
   *
   * Structure:
   *   WITH __dt_base AS (SELECT t.*, [vector JOINs] FROM base t ...),
   *        __dt_layer_1 AS (SELECT *, (expr) AS col FROM __dt_base),
   *        __dt_layer_2 AS (SELECT *, (expr) AS col FROM __dt_layer_1),
   *        ...
   *   SELECT * FROM __dt_layer_N
   *
   * Vector columns go in the base CTE (JOINed via rowid, which is only
   * available on physical tables). Expression columns are topologically
   * sorted so each layer can reference columns from all previous layers.
   */
  private async recreateView(): Promise<void> {
    if (this.columns.length === 0) {
      await this.dropView();
      return;
    }

    // --- Base CTE: base table columns + vector columns via LEFT JOIN ---
    const vectors = this.columns.filter((c) => c.def.kind === 'vector');
    const baseSelectParts: string[] = ['t.*'];
    const joinParts: string[] = [];
    let joinCounter = 0;

    for (const info of vectors) {
      joinCounter++;
      const alias = `h${joinCounter}`;
      const helperTable = this.helperTableOf(info);
      baseSelectParts.push(`${alias}.${quoteIdentifier(info.def.name)}`);
      // Join on the explicit `__rowid__` column synthesized at load time.
      // DuckDB's implicit `rowid` pseudo-column is reassigned whenever a
      // table is rewritten (e.g. by CREATE TABLE AS SELECT), so joining on
      // it is not stable; `__rowid__` survives rewrites.
      joinParts.push(
        `LEFT JOIN ${quoteIdentifier(helperTable)} ${alias} ON t.__rowid__ = ${alias}.__rowid__`,
      );
    }

    const baseSelect = baseSelectParts.join(', ');
    const baseFrom = quoteIdentifier(this.baseTableName) + ' t';
    const baseJoin = joinParts.length > 0 ? ' ' + joinParts.join(' ') : '';
    const baseCTE = `__dt_base AS (SELECT ${baseSelect} FROM ${baseFrom}${baseJoin})`;

    // --- Expression layers: one CTE per expression column in dependency order ---
    const sortedExpressions = this.topologicalSortExpressions();

    if (sortedExpressions.length === 0) {
      // Only vector columns — single CTE, no layering needed
      const sql = `CREATE OR REPLACE VIEW ${quoteIdentifier(this.viewName)} AS WITH ${baseCTE} SELECT * FROM __dt_base`;
      await this.bridge.query(sql);
      return;
    }

    const cteParts: string[] = [baseCTE];
    let prevLayer = '__dt_base';

    for (let i = 0; i < sortedExpressions.length; i++) {
      const info = sortedExpressions[i]!;
      const layerName = `__dt_layer_${i + 1}`;
      const expr = (info.def as { expression: string }).expression;
      cteParts.push(`${layerName} AS (${layerSelect(expr, info.def.name, prevLayer)})`);
      prevLayer = layerName;
    }

    const sql = `CREATE OR REPLACE VIEW ${quoteIdentifier(this.viewName)} AS WITH ${cteParts.join(', ')} SELECT * FROM ${prevLayer}`;
    await this.bridge.query(sql);
  }

  /** DROP VIEW IF EXISTS */
  private async dropView(): Promise<void> {
    await this.bridge.query(`DROP VIEW IF EXISTS ${quoteIdentifier(this.viewName)}`);
  }

  /** Extract a clean error message from a DuckDB error */
  private cleanErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      // Strip common DuckDB prefixes
      return err.message
        .replace(
          /^(Catalog Error|Parser Error|Binder Error|Runtime Error|Conversion Error):\s*/i,
          '',
        )
        .trim();
    }
    return String(err);
  }
}
