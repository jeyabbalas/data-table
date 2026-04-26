/**
 * Lightweight performance measurement utility.
 *
 * Wraps the browser Performance API (`performance.now()`) to provide
 * named timing measurements with result accumulation.
 */

export interface PerfMark {
  name: string;
  startTime: number;
}

export interface PerfResult {
  name: string;
  durationMs: number;
  timestamp: number;
}

export class PerfMonitor {
  private results: PerfResult[] = [];

  /** Start a named measurement. Pass the returned mark to `end()`. */
  start(name: string): PerfMark {
    return { name, startTime: performance.now() };
  }

  /** End a measurement and record the result. */
  end(mark: PerfMark): PerfResult {
    const result: PerfResult = {
      name: mark.name,
      durationMs: performance.now() - mark.startTime,
      timestamp: Date.now(),
    };
    this.results.push(result);
    return result;
  }

  /** Time an async operation. */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; perf: PerfResult }> {
    const mark = this.start(name);
    const result = await fn();
    const perf = this.end(mark);
    return { result, perf };
  }

  /** Time a synchronous operation. */
  measureSync<T>(name: string, fn: () => T): { result: T; perf: PerfResult } {
    const mark = this.start(name);
    const result = fn();
    const perf = this.end(mark);
    return { result, perf };
  }

  /** Get all recorded results. */
  getResults(): PerfResult[] {
    return [...this.results];
  }

  /** Clear all recorded results. */
  clear(): void {
    this.results = [];
  }

  /** Format all results as a human-readable summary. */
  formatSummary(): string {
    if (this.results.length === 0) return 'No measurements recorded.';
    return this.results.map((r) => `${r.name}: ${r.durationMs.toFixed(2)}ms`).join('\n');
  }
}
