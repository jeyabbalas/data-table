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

import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnSchema, DataType } from '../core/types';
import type {
  DerivedColumnDef,
  DerivedColumnInfo,
  VectorColumnDef,
  VectorDataType,
  CompletionContext,
} from './types';
import { ConfigurationError, DerivedColumnError } from '../core/errors';
import { mapDuckDBType } from '../data/SchemaDetector';
import { quoteIdentifier, formatSQLValue } from '../filters/FilterSQL';

/** Batch size for vector INSERT statements */
const VECTOR_BATCH_SIZE = 1000;

export class DerivedColumnManager {
  /** VIEW name: __dt_view_<baseTableName>__ */
  readonly viewName: string;

  /** Ordered list of derived column info */
  private columns: DerivedColumnInfo[] = [];

  /** Monotonic counter for unique helper table names */
  private nextHelperTableId = 0;
  /** Maps column name → assigned helper table ID */
  private helperTableIds = new Map<string, number>();

  constructor(
    private bridge: WorkerBridge,
    private baseTableName: string,
  ) {
    this.viewName = `__dt_view_${baseTableName}__`;
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
   * detects type via DuckDB, recreates VIEW, returns ColumnSchema with isDerived: true.
   */
  async addColumn(def: DerivedColumnDef): Promise<DerivedColumnInfo> {
    let detectedType: DataType;
    let detectedOriginalType: string;

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
      const typeInfo = await this.detectType(def.expression);
      detectedType = typeInfo.detectedType;
      detectedOriginalType = typeInfo.detectedOriginalType;
    } else {
      // Vector column: create helper table
      await this.createVectorHelperTable(def);
      detectedOriginalType = this.vectorTypeToDuckDBType(def.vectorType);
      detectedType = mapDuckDBType(detectedOriginalType);
    }

    const info: DerivedColumnInfo = {
      def,
      detectedType,
      detectedOriginalType,
    };

    this.columns.push(info);
    await this.recreateView();

    return info;
  }

  /**
   * Update a derived column's expression/name/values.
   * Validates, recreates VIEW (and helper table if vector). Returns updated info.
   */
  async updateColumn(oldName: string, def: DerivedColumnDef): Promise<DerivedColumnInfo> {
    const oldIndex = this.columns.findIndex(c => c.def.name === oldName);
    if (oldIndex === -1) {
      throw new DerivedColumnError(`Derived column "${oldName}" not found`, {
        code: 'NOT_FOUND',
        details: { column: oldName },
      });
    }

    const oldInfo = this.columns[oldIndex];

    // Block rename if other columns depend on this one
    const isRename = oldName !== def.name;
    if (isRename) {
      const dependents = this.getDependents(oldName);
      if (dependents.length > 0) {
        throw new DerivedColumnError(
          `Cannot rename "${oldName}" because it is referenced by: ${dependents.map(d => `"${d}"`).join(', ')}. Update those columns first.`,
          {
            code: 'EXPRESSION_INVALID',
            details: { column: oldName, dependents },
          },
        );
      }
    }

    let detectedType: DataType;
    let detectedOriginalType: string;

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
    }

    // Clean up old vector helper table if the old column was a vector
    if (oldInfo.def.kind === 'vector') {
      await this.dropVectorHelperTable(oldName);
    }

    if (def.kind === 'expression') {
      await this.validateExpressionSQL(def.expression, def.name);
      const typeInfo = await this.detectType(def.expression);
      detectedType = typeInfo.detectedType;
      detectedOriginalType = typeInfo.detectedOriginalType;
    } else {
      await this.createVectorHelperTable(def);
      detectedOriginalType = this.vectorTypeToDuckDBType(def.vectorType);
      detectedType = mapDuckDBType(detectedOriginalType);
    }

    const newInfo: DerivedColumnInfo = {
      def,
      detectedType,
      detectedOriginalType,
    };

    // Replace in-place to maintain order
    this.columns[oldIndex] = newInfo;

    try {
      await this.recreateView();
    } catch (viewErr) {
      // Rollback: restore old column info and attempt to recreate the old VIEW
      this.columns[oldIndex] = oldInfo;
      if (oldInfo.def.kind === 'vector') {
        await this.createVectorHelperTable(oldInfo.def);
      }
      try {
        await this.recreateView();
      } catch {
        // Best-effort restore
      }
      throw viewErr;
    }

    return newInfo;
  }

  /**
   * Remove a derived column. Drops helper table if vector.
   * Recreates VIEW without column, or drops VIEW entirely if last derived column.
   */
  async removeColumn(name: string): Promise<void> {
    const index = this.columns.findIndex(c => c.def.name === name);
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
        `Cannot delete "${name}" because it is referenced by: ${dependents.map(d => `"${d}"`).join(', ')}. Delete those columns first.`,
        {
          code: 'EXPRESSION_INVALID',
          details: { column: name, dependents },
        },
      );
    }

    const info = this.columns[index];

    // Drop vector helper table if applicable
    if (info.def.kind === 'vector') {
      await this.dropVectorHelperTable(name);
    }

    // Remove from list
    this.columns.splice(index, 1);

    // Recreate or drop VIEW
    if (this.columns.length === 0) {
      await this.dropView();
    } else {
      await this.recreateView();
    }
  }

  /**
   * Validate an expression without adding it. For UI preview/validation button.
   */
  async validateExpression(expression: string, alias?: string): Promise<{
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
    // Drop vector helper tables
    for (const info of this.columns) {
      if (info.def.kind === 'vector') {
        try {
          await this.dropVectorHelperTable(info.def.name);
        } catch {
          // Best-effort cleanup
        }
      }
    }

    // Drop VIEW
    try {
      await this.dropView();
    } catch {
      // Best-effort cleanup
    }

    this.columns = [];
    this.helperTableIds.clear();
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
    const expressions = this.columns.filter(c => c.def.kind === 'expression');
    if (expressions.length <= 1) return expressions;

    const exprNames = new Set(expressions.map(c => c.def.name));
    const exprMap = new Map(expressions.map(c => [c.def.name, c]));

    // Build adjacency: for each column, which other expression columns does it depend on?
    const deps = new Map<string, Set<string>>();
    for (const col of expressions) {
      const allDeps = this.getExpressionDependencies(
        (col.def as { expression: string }).expression
      );
      // Only keep dependencies on other expression columns
      deps.set(col.def.name, new Set([...allDeps].filter(d => exprNames.has(d))));
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
        .filter(c => !sorted.includes(c.def.name))
        .map(c => `"${c.def.name}"`);
      throw new DerivedColumnError(
        `Circular dependency detected among derived columns: ${inCycle.join(', ')}`,
        {
          code: 'CIRCULAR_DEPENDENCY',
          details: { cycle: inCycle },
        },
      );
    }

    return sorted.map(name => exprMap.get(name)!);
  }

  /**
   * Return names of expression columns that directly reference the given column.
   * Used for deletion protection and rename blocking.
   */
  getDependents(columnName: string): string[] {
    const dependents: string[] = [];
    for (const col of this.columns) {
      if (col.def.kind === 'expression') {
        const deps = this.getExpressionDependencies(
          (col.def as { expression: string }).expression
        );
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

  /** Validate expression: SELECT (<expr>) AS "<alias>" FROM "<view_or_base>" LIMIT 0 */
  private async validateExpressionSQL(expression: string, alias: string): Promise<void> {
    const sql = `SELECT (${expression}) AS ${quoteIdentifier(alias)} FROM ${quoteIdentifier(this.validationTableName)} LIMIT 0`;
    await this.bridge.query(sql);
  }

  /** Detect type: SELECT typeof((<expr>)) AS t FROM "<view_or_base>" LIMIT 1, then mapDuckDBType() */
  private async detectType(expression: string): Promise<{
    detectedType: DataType;
    detectedOriginalType: string;
  }> {
    const sql = `SELECT typeof((${expression})) AS t FROM ${quoteIdentifier(this.validationTableName)} LIMIT 1`;
    const rows = await this.bridge.query<{ t: string }>(sql);

    if (rows.length === 0) {
      // Empty table — fallback to string
      return { detectedType: 'string', detectedOriginalType: 'VARCHAR' };
    }

    const originalType = rows[0].t;
    return {
      detectedType: mapDuckDBType(originalType),
      detectedOriginalType: originalType,
    };
  }

  /** Create helper table for a vector column and INSERT values in batches */
  private async createVectorHelperTable(def: VectorColumnDef): Promise<void> {
    // Assign a unique ID if this column doesn't have one yet
    if (!this.helperTableIds.has(def.name)) {
      this.helperTableIds.set(def.name, this.nextHelperTableId++);
    }
    const tableName = this.helperTableName(def.name);
    const duckdbType = this.vectorTypeToDuckDBType(def.vectorType);

    // Drop if exists (for updates)
    await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);

    // Create table
    await this.bridge.query(
      `CREATE TABLE ${quoteIdentifier(tableName)} (__rowid__ BIGINT, ${quoteIdentifier(def.name)} ${duckdbType})`
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
        `INSERT INTO ${quoteIdentifier(tableName)} VALUES ${parts.join(', ')}`
      );
    }
  }

  /** DROP TABLE IF EXISTS for a vector column's helper table */
  private async dropVectorHelperTable(name: string): Promise<void> {
    const tableName = this.helperTableName(name);
    await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
    this.helperTableIds.delete(name);
  }

  /** Helper table name for a given column: __dt_vec_<sanitizedName>_<id>__ */
  private helperTableName(columnName: string): string {
    const id = this.helperTableIds.get(columnName);
    if (id === undefined) {
      throw new ConfigurationError(
        `No helper table ID assigned for column "${columnName}"`,
        { code: 'INVARIANT', details: { column: columnName } },
      );
    }
    const sanitized = columnName.replace(/[^a-zA-Z0-9]/g, '_');
    return `__dt_vec_${sanitized}_${id}__`;
  }

  /** Map VectorDataType to DuckDB type string */
  private vectorTypeToDuckDBType(vt: VectorDataType): string {
    switch (vt) {
      case 'integer': return 'BIGINT';
      case 'float': return 'DOUBLE';
      case 'decimal': return 'DECIMAL(18,6)';
      case 'string': return 'VARCHAR';
      case 'boolean': return 'BOOLEAN';
      case 'uuid': return 'UUID';
      case 'date': return 'DATE';
      case 'timestamp': return 'TIMESTAMP';
      case 'time': return 'TIME';
      case 'interval': return 'INTERVAL';
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
    const vectors = this.columns.filter(c => c.def.kind === 'vector');
    const baseSelectParts: string[] = ['t.*'];
    const joinParts: string[] = [];
    let joinCounter = 0;

    for (const info of vectors) {
      joinCounter++;
      const alias = `h${joinCounter}`;
      const helperTable = this.helperTableName(info.def.name);
      baseSelectParts.push(`${alias}.${quoteIdentifier(info.def.name)}`);
      joinParts.push(
        `LEFT JOIN ${quoteIdentifier(helperTable)} ${alias} ON t.rowid = ${alias}.__rowid__`
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
      const info = sortedExpressions[i];
      const layerName = `__dt_layer_${i + 1}`;
      const expr = (info.def as { expression: string }).expression;
      cteParts.push(
        `${layerName} AS (SELECT *, (${expr}) AS ${quoteIdentifier(info.def.name)} FROM ${prevLayer})`
      );
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
        .replace(/^(Catalog Error|Parser Error|Binder Error|Runtime Error|Conversion Error):\s*/i, '')
        .trim();
    }
    return String(err);
  }
}
