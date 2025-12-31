/**
 * BaseVisualization - Abstract base class for column visualizations
 *
 * Provides common functionality for all visualization types:
 * - Canvas setup with high-DPI support
 * - Mouse event handling (move, click, leave)
 * - Responsive resizing via ResizeObserver
 * - Proper cleanup on destruction
 *
 * Subclasses must implement:
 * - fetchData(): Load visualization data from DuckDB
 * - render(): Draw the visualization on canvas
 * - handleMouseMove(): Handle hover interactions
 * - handleClick(): Handle click interactions
 * - handleMouseLeave(): Handle mouse leave
 */

import type { ColumnSchema, Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';

/**
 * Options for creating a visualization
 */
export interface VisualizationOptions {
  /** Name of the DuckDB table */
  tableName: string;
  /** Bridge for executing queries */
  bridge: WorkerBridge;
  /** Current active filters */
  filters: Filter[];
  /** Callback when visualization creates a filter */
  onFilterChange?: (filter: Filter) => void;
  /** Callback to update stats line on hover (null restores default) */
  onStatsChange?: (stats: string | null) => void;
  /** Maximum number of histogram bins (default: 15) */
  maxBins?: number;
  /** Callback when brush is committed (column name passed) */
  onBrushCommit?: (columnName: string) => void;
  /** Callback when brush is cleared (column name passed) */
  onBrushClear?: (columnName: string) => void;
  /** Callback when selection changes (column name and hasSelection passed) */
  onSelectionChange?: (columnName: string, hasSelection: boolean) => void;
}

/**
 * Abstract base class for column visualizations.
 *
 * @example
 * ```typescript
 * class Histogram extends BaseVisualization {
 *   async fetchData() {
 *     // Fetch histogram bins from DuckDB
 *   }
 *   render() {
 *     // Draw histogram bars
 *   }
 *   // ... implement mouse handlers
 * }
 * ```
 */
export abstract class BaseVisualization {
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected width: number = 0;
  protected height: number = 0;
  protected dpr: number;
  protected destroyed = false;

  // Bound event handlers for proper cleanup
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseLeave: (e: MouseEvent) => void;
  private boundClick: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private resizeObserver: ResizeObserver;

  constructor(
    protected container: HTMLElement,
    protected column: ColumnSchema,
    protected options: VisualizationOptions
  ) {
    // Device pixel ratio for crisp rendering on high-DPI displays
    this.dpr = window.devicePixelRatio || 1;

    // Create canvas element
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = ctx;

    // Style canvas to fill container
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    // Add to container
    container.appendChild(this.canvas);

    // Bind event handlers
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseLeave = this.onMouseLeave.bind(this);
    this.boundClick = this.onClick.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);

    // Setup resize observer for responsive sizing
    this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));
    this.resizeObserver.observe(container);

    // Initial size setup and interaction
    this.updateSize();
    this.setupInteraction();
  }

  // =========================================
  // Abstract Methods - Implement in Subclasses
  // =========================================

  /**
   * Fetch data needed for this visualization from DuckDB.
   * Called when the visualization is created and when filters change.
   */
  abstract fetchData(): Promise<void>;

  /**
   * Render the visualization on the canvas.
   * Called after data fetch and on resize.
   */
  abstract render(): void;

  /**
   * Handle mouse movement over the visualization.
   * @param x - X coordinate relative to canvas (0 to width)
   * @param y - Y coordinate relative to canvas (0 to height)
   */
  protected abstract handleMouseMove(x: number, y: number): void;

  /**
   * Handle click on the visualization.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   */
  protected abstract handleClick(x: number, y: number): void;

  /**
   * Handle mouse leaving the visualization.
   * Used to clear hover states.
   */
  protected abstract handleMouseLeave(): void;

  /**
   * Handle mouse down on the visualization.
   * Used for brush/drag interactions.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   */
  protected abstract handleMouseDown(x: number, y: number): void;

  /**
   * Handle mouse up on the visualization.
   * Used for completing brush/drag interactions.
   * @param x - X coordinate relative to canvas
   * @param y - Y coordinate relative to canvas
   */
  protected abstract handleMouseUp(x: number, y: number): void;

  /**
   * Handle keyboard events for the visualization.
   * Used for canceling brush with Escape, etc.
   * @param key - The key that was pressed
   */
  protected abstract handleKeyDown(key: string): void;

  // =========================================
  // Canvas Sizing
  // =========================================

  /**
   * Update canvas dimensions to match container.
   * Accounts for device pixel ratio for crisp rendering.
   */
  protected updateSize(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    // Set canvas size accounting for device pixel ratio
    // This makes the canvas high-resolution on Retina displays
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);

    // Scale context so drawing operations use logical pixels
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Handle container resize
   */
  private handleResize(): void {
    if (this.destroyed) return;
    this.updateSize();
    this.render();
  }

  // =========================================
  // Mouse Event Handling
  // =========================================

  /**
   * Set up mouse event listeners on the canvas
   */
  private setupInteraction(): void {
    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mouseleave', this.boundMouseLeave);
    this.canvas.addEventListener('click', this.boundClick);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    // mouseup and keydown on window to catch events outside canvas
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('keydown', this.boundKeyDown);
  }

  /**
   * Translate mouse event to canvas coordinates and forward to handler
   */
  private onMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseMove(x, y);
  }

  /**
   * Forward mouse leave event to handler
   */
  private onMouseLeave(_e: MouseEvent): void {
    if (this.destroyed) return;
    this.handleMouseLeave();
  }

  /**
   * Translate click event to canvas coordinates and forward to handler
   */
  private onClick(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleClick(x, y);
  }

  /**
   * Translate mousedown event to canvas coordinates and forward to handler
   */
  private onMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseDown(x, y);
  }

  /**
   * Translate mouseup event to canvas coordinates and forward to handler
   */
  private onMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.handleMouseUp(x, y);
  }

  /**
   * Forward keydown event to handler
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return;
    this.handleKeyDown(e.key);
  }

  // =========================================
  // Utility Methods
  // =========================================

  /**
   * Clear the entire canvas
   */
  protected clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Format a number with locale-specific formatting
   */
  protected formatNumber(value: number): string {
    return value.toLocaleString();
  }

  /**
   * Get the column this visualization represents
   */
  getColumn(): ColumnSchema {
    return this.column;
  }

  /**
   * Check if the visualization has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  // =========================================
  // Lifecycle
  // =========================================

  /**
   * Destroy the visualization and clean up all resources.
   * Must be called when the visualization is no longer needed.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove event listeners from canvas
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('mouseleave', this.boundMouseLeave);
    this.canvas.removeEventListener('click', this.boundClick);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);

    // Remove event listeners from window
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('keydown', this.boundKeyDown);

    // Stop observing resize (optional chaining in case constructor failed partially)
    this.resizeObserver?.disconnect();

    // Remove canvas from DOM
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
