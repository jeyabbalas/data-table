/**
 * PlaceholderVisualization - Test implementation of BaseVisualization
 *
 * Draws a simple placeholder rectangle to verify:
 * - Canvas renders correctly
 * - Mouse events work
 * - Resize handling works
 * - Cleanup works
 *
 * This will be replaced by real visualizations (Histogram, ValueCounts, etc.)
 * in subsequent tasks.
 */

import { BaseVisualization } from './BaseVisualization';
import type { VisualizationOptions } from './BaseVisualization';
import type { ColumnSchema } from '../core/types';

export class PlaceholderVisualization extends BaseVisualization {
  private hovered = false;
  private mouseX = 0;

  constructor(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ) {
    super(container, column, options);
    // Initial render
    this.render();
  }

  /**
   * Placeholder data fetch - does nothing for now
   */
  async fetchData(): Promise<void> {
    // Will be implemented in actual visualizations
  }

  /**
   * Draw a simple placeholder visualization
   */
  render(): void {
    if (this.destroyed || this.width === 0 || this.height === 0) return;

    this.clear();

    const ctx = this.ctx;
    const padding = 4;
    const barHeight = this.height - padding * 2;
    const barWidth = this.width - padding * 2;

    // Background
    ctx.fillStyle = this.hovered ? '#e0e7ff' : '#f1f5f9';
    ctx.fillRect(padding, padding, barWidth, barHeight);

    // Draw placeholder bars to simulate a histogram
    const numBars = 8;
    const barGap = 2;
    const singleBarWidth = (barWidth - (numBars - 1) * barGap) / numBars;

    for (let i = 0; i < numBars; i++) {
      // Random-ish heights based on column name hash for consistency
      const hash = this.column.name.charCodeAt(i % this.column.name.length) || 50;
      const heightPercent = 0.2 + (hash % 80) / 100;
      const height = barHeight * heightPercent;
      const x = padding + i * (singleBarWidth + barGap);
      const y = padding + barHeight - height;

      // Highlight bar under mouse
      const isHovered =
        this.hovered &&
        this.mouseX >= x &&
        this.mouseX <= x + singleBarWidth;

      ctx.fillStyle = isHovered ? '#3b82f6' : '#93c5fd';
      ctx.fillRect(x, y, singleBarWidth, height);
    }

    // Draw column type label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.column.type, this.width - padding - 2, this.height - padding);
  }

  /**
   * Handle mouse movement - highlight hovered bar
   */
  protected handleMouseMove(x: number, _y: number): void {
    this.hovered = true;
    this.mouseX = x;
    this.render();
  }

  /**
   * Handle click - log to console for testing
   */
  protected handleClick(x: number, _y: number): void {
    const padding = 4;
    const barWidth = this.width - padding * 2;
    const numBars = 8;
    const barGap = 2;
    const singleBarWidth = (barWidth - (numBars - 1) * barGap) / numBars;

    // Find which bar was clicked
    const relX = x - padding;
    const barIndex = Math.floor(relX / (singleBarWidth + barGap));

    if (barIndex >= 0 && barIndex < numBars) {
      console.log(
        `[PlaceholderVisualization] Clicked bar ${barIndex} on column "${this.column.name}"`
      );
    }
  }

  /**
   * Handle mouse leave - clear hover state
   */
  protected handleMouseLeave(): void {
    this.hovered = false;
    this.render();
  }
}
