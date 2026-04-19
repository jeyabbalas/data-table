/**
 * InteractionManager - LIFO interaction stack with Escape key handling
 *
 * Maintains a stack of active brush/selection interactions across all visualizations.
 * Pressing Escape clears the most recent interaction (LIFO order).
 *
 * Previously lived in demo code — now part of the library so consumers
 * don't have to reimplement it.
 *
 * @example
 * import { InteractionManager } from '@jeyabbalas/data-table/advanced';
 *
 * const im = new InteractionManager();
 * im.push('brush', 'age', ageHistogram);
 * // Escape clears most recent; or manually:
 * im.clearTop();
 *
 * @see CrossfilterCoordinator
 */

/** Interface for visualizations that support brush clearing */
interface BrushCapable {
  clearBrush(): void;
}

/** Interface for visualizations that support selection clearing */
interface SelectionCapable {
  clearSelection(): void;
}

/** A visualization that supports at least one of brush or selection clearing */
export type InteractiveVisualization = (BrushCapable | SelectionCapable) & {
  isDestroyed(): boolean;
};

/** An active interaction on the stack */
interface ActiveInteraction {
  type: 'brush' | 'selection';
  columnName: string;
  visualization: InteractiveVisualization;
}

export class InteractionManager {
  private stack: ActiveInteraction[] = [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.stack.length > 0) {
        this.clearLast();
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  /**
   * Push a brush interaction onto the stack.
   * Removes any existing interaction for the same column first.
   */
  pushBrush(columnName: string, viz: InteractiveVisualization): void {
    this.removeColumn(columnName);
    this.stack.push({ type: 'brush', columnName, visualization: viz });
  }

  /**
   * Push a selection interaction onto the stack.
   * Removes any existing interaction for the same column first.
   */
  pushSelection(columnName: string, viz: InteractiveVisualization): void {
    this.removeColumn(columnName);
    this.stack.push({ type: 'selection', columnName, visualization: viz });
  }

  /**
   * Remove all interactions for a given column (does not clear the visualizations).
   */
  removeColumn(columnName: string): void {
    this.stack = this.stack.filter((i) => i.columnName !== columnName);
  }

  /**
   * Clear and remove all interactions for a given column.
   * Unlike removeColumn(), this also calls clearBrush/clearSelection on the visualization.
   */
  clearColumn(columnName: string): void {
    const remaining: ActiveInteraction[] = [];
    for (const interaction of this.stack) {
      if (interaction.columnName === columnName && !interaction.visualization.isDestroyed()) {
        if (interaction.type === 'brush' && 'clearBrush' in interaction.visualization) {
          interaction.visualization.clearBrush();
        } else if ('clearSelection' in interaction.visualization) {
          interaction.visualization.clearSelection();
        }
      } else if (interaction.columnName !== columnName) {
        remaining.push(interaction);
      }
    }
    this.stack = remaining;
  }

  /**
   * Clear the most recent interaction (LIFO).
   * Returns true if an interaction was cleared, false if the stack was empty.
   */
  clearLast(): boolean {
    // Prune destroyed visualizations from the top of the stack
    while (this.stack.length > 0) {
      const last = this.stack[this.stack.length - 1];
      if (last.visualization.isDestroyed()) {
        this.stack.pop();
        continue;
      }

      this.stack.pop();
      if (last.type === 'brush' && 'clearBrush' in last.visualization) {
        last.visualization.clearBrush();
      } else if ('clearSelection' in last.visualization) {
        last.visualization.clearSelection();
      }
      return true;
    }
    return false;
  }

  /** Get the number of active interactions */
  get size(): number {
    return this.stack.length;
  }

  /** Clear all interactions from the stack (does not clear the visualizations) */
  clear(): void {
    this.stack.length = 0;
  }

  /** Destroy the manager, removing the keyboard listener */
  destroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.stack.length = 0;
  }
}
