/**
 * Progress reporting types and utilities
 */

/**
 * Stages of data processing
 */
export type ProgressStage = 'reading' | 'parsing' | 'indexing' | 'analyzing';

/**
 * Progress information for long-running operations
 */
export interface ProgressInfo {
  /** Current processing stage */
  stage: ProgressStage;
  /** Completion percentage (0-100) */
  percent: number;
  /** Bytes or rows loaded so far */
  loaded?: number;
  /** Total bytes or rows expected */
  total?: number;
  /** Estimated time remaining in milliseconds */
  estimatedRemaining?: number;
  /** Whether the operation can be cancelled */
  cancelable: boolean;
}

/**
 * Callback for receiving progress updates
 */
export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * Helper to calculate estimated time remaining based on progress
 */
export function estimateTimeRemaining(
  startTime: number,
  percent: number
): number | undefined {
  if (percent <= 0 || percent >= 100) {
    return undefined;
  }
  const elapsed = Date.now() - startTime;
  const estimatedTotal = elapsed / (percent / 100);
  return Math.round(estimatedTotal - elapsed);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return 'less than 1s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

/**
 * Helper to format progress for display
 */
export function formatProgress(info: ProgressInfo): string {
  const parts: string[] = [];

  // Stage
  parts.push(info.stage.charAt(0).toUpperCase() + info.stage.slice(1));

  // Percentage
  parts.push(`${Math.round(info.percent)}%`);

  // Loaded/total
  if (info.loaded !== undefined && info.total !== undefined) {
    parts.push(`(${formatBytes(info.loaded)}/${formatBytes(info.total)})`);
  }

  // Time remaining
  if (info.estimatedRemaining !== undefined) {
    parts.push(`~${formatDuration(info.estimatedRemaining)} remaining`);
  }

  return parts.join(' ');
}
