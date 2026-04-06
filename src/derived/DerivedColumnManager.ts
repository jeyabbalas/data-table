/**
 * Derived Column Manager
 *
 * Handles all DuckDB operations for derived columns: VIEW lifecycle,
 * vector helper tables, expression validation, and type detection.
 *
 * When derived columns exist, a DuckDB VIEW is created that includes
 * all base columns plus derived columns. All existing query paths
 * transparently query through the VIEW via state.tableName.
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
import { mapDuckDBType } from '../data/SchemaDetector';
import { quoteIdentifier, formatSQLValue } from '../filters/FilterSQL';

/** Batch size for vector INSERT statements */
const VECTOR_BATCH_SIZE = 1000;

export class DerivedColumnManager {
  /** VIEW name: __dt_view_<baseTableName>__ */
  readonly viewName: string;

  /** Ordered list of derived column info */
  private columns: DerivedColumnInfo[] = [];

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
      throw new Error(`Derived column "${oldName}" not found`);
    }

    const oldInfo = this.columns[oldIndex];

    let detectedType: DataType;
    let detectedOriginalType: string;

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
    await this.recreateView();

    return newInfo;
  }

  /**
   * Remove a derived column. Drops helper table if vector.
   * Recreates VIEW without column, or drops VIEW entirely if last derived column.
   */
  async removeColumn(name: string): Promise<void> {
    const index = this.columns.findIndex(c => c.def.name === name);
    if (index === -1) {
      throw new Error(`Derived column "${name}" not found`);
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
  }

  // --- Private implementation ---

  /** Validate expression: SELECT (<expr>) AS "<alias>" FROM "<base>" LIMIT 0 */
  private async validateExpressionSQL(expression: string, alias: string): Promise<void> {
    const sql = `SELECT (${expression}) AS ${quoteIdentifier(alias)} FROM ${quoteIdentifier(this.baseTableName)} LIMIT 0`;
    await this.bridge.query(sql);
  }

  /** Detect type: SELECT typeof((<expr>)) AS t FROM "<base>" LIMIT 1, then mapDuckDBType() */
  private async detectType(expression: string): Promise<{
    detectedType: DataType;
    detectedOriginalType: string;
  }> {
    const sql = `SELECT typeof((${expression})) AS t FROM ${quoteIdentifier(this.baseTableName)} LIMIT 1`;
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
    const tableName = this.helperTableName(def.name);
    const duckdbType = this.vectorTypeToDuckDBType(def.vectorType);

    // Drop if exists (for updates)
    await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);

    // Create table
    await this.bridge.query(
      `CREATE TABLE ${quoteIdentifier(tableName)} (__rowid__ BIGINT, ${quoteIdentifier(def.name)} ${duckdbType})`
    );

    // Insert values in batches
    const values = def.values;
    for (let i = 0; i < values.length; i += VECTOR_BATCH_SIZE) {
      const batch = values.slice(i, i + VECTOR_BATCH_SIZE);
      const rows = batch.map((val, j) => `(${i + j}, ${formatSQLValue(val)})`).join(', ');
      await this.bridge.query(
        `INSERT INTO ${quoteIdentifier(tableName)} VALUES ${rows}`
      );
    }
  }

  /** DROP TABLE IF EXISTS for a vector column's helper table */
  private async dropVectorHelperTable(name: string): Promise<void> {
    const tableName = this.helperTableName(name);
    await this.bridge.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
  }

  /** Helper table name for a given column: __dt_vec_<sanitizedName>__ */
  private helperTableName(columnName: string): string {
    const sanitized = columnName.replace(/[^a-zA-Z0-9]/g, '_');
    return `__dt_vec_${sanitized}__`;
  }

  /** Map VectorDataType to DuckDB type string */
  private vectorTypeToDuckDBType(vt: VectorDataType): string {
    switch (vt) {
      case 'integer': return 'BIGINT';
      case 'float': return 'DOUBLE';
      case 'string': return 'VARCHAR';
      case 'boolean': return 'BOOLEAN';
    }
  }

  /**
   * Recreate the VIEW from current columns list.
   * Expression columns contribute inline expressions in the SELECT list.
   * Vector columns contribute a LEFT JOIN with the helper table.
   */
  private async recreateView(): Promise<void> {
    if (this.columns.length === 0) {
      await this.dropView();
      return;
    }

    const selectParts: string[] = ['t.*'];
    const joinParts: string[] = [];
    let joinCounter = 0;

    for (const info of this.columns) {
      if (info.def.kind === 'expression') {
        selectParts.push(`(${info.def.expression}) AS ${quoteIdentifier(info.def.name)}`);
      } else {
        joinCounter++;
        const alias = `h${joinCounter}`;
        const helperTable = this.helperTableName(info.def.name);
        selectParts.push(`${alias}.${quoteIdentifier(info.def.name)}`);
        joinParts.push(
          `LEFT JOIN ${quoteIdentifier(helperTable)} ${alias} ON t.rowid = ${alias}.__rowid__`
        );
      }
    }

    const selectClause = selectParts.join(', ');
    const fromClause = quoteIdentifier(this.baseTableName) + ' t';
    const joinClause = joinParts.length > 0 ? ' ' + joinParts.join(' ') : '';

    const sql = `CREATE OR REPLACE VIEW ${quoteIdentifier(this.viewName)} AS SELECT ${selectClause} FROM ${fromClause}${joinClause}`;
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
