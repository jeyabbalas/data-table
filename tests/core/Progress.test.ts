import { describe, it, expect } from 'vitest';
import {
  estimateTimeRemaining,
  formatProgress,
  formatBytes,
  formatDuration,
  type ProgressInfo,
} from '@/core/Progress';

describe('Progress utilities', () => {
  describe('estimateTimeRemaining', () => {
    it('should return undefined for 0% progress', () => {
      expect(estimateTimeRemaining(Date.now() - 1000, 0)).toBeUndefined();
    });

    it('should return undefined for 100% progress', () => {
      expect(estimateTimeRemaining(Date.now() - 1000, 100)).toBeUndefined();
    });

    it('should estimate time remaining correctly', () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const remaining = estimateTimeRemaining(startTime, 50);
      // At 50%, should estimate ~5 seconds remaining
      expect(remaining).toBeGreaterThan(4000);
      expect(remaining).toBeLessThan(6000);
    });

    it('should return undefined for negative progress', () => {
      expect(estimateTimeRemaining(Date.now() - 1000, -10)).toBeUndefined();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(5242880)).toBe('5.0 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });

  describe('formatDuration', () => {
    it('should format sub-second durations', () => {
      expect(formatDuration(500)).toBe('less than 1s');
      expect(formatDuration(999)).toBe('less than 1s');
    });

    it('should format seconds correctly', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(59999)).toBe('60s');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(120000)).toBe('2m');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(7200000)).toBe('2h');
    });
  });

  describe('formatProgress', () => {
    it('should format basic progress info', () => {
      const info: ProgressInfo = {
        stage: 'parsing',
        percent: 45,
        cancelable: true,
      };
      const formatted = formatProgress(info);
      expect(formatted).toContain('Parsing');
      expect(formatted).toContain('45%');
    });

    it('should include loaded/total when provided', () => {
      const info: ProgressInfo = {
        stage: 'reading',
        percent: 50,
        loaded: 1048576,
        total: 2097152,
        cancelable: true,
      };
      const formatted = formatProgress(info);
      expect(formatted).toContain('Reading');
      expect(formatted).toContain('50%');
      expect(formatted).toContain('1.0 MB');
      expect(formatted).toContain('2.0 MB');
    });

    it('should include time remaining when provided', () => {
      const info: ProgressInfo = {
        stage: 'indexing',
        percent: 75,
        estimatedRemaining: 30000,
        cancelable: false,
      };
      const formatted = formatProgress(info);
      expect(formatted).toContain('Indexing');
      expect(formatted).toContain('75%');
      expect(formatted).toContain('30s remaining');
    });

    it('should format all stages correctly', () => {
      const stages = ['reading', 'parsing', 'indexing', 'analyzing'] as const;
      for (const stage of stages) {
        const info: ProgressInfo = {
          stage,
          percent: 50,
          cancelable: true,
        };
        const formatted = formatProgress(info);
        expect(formatted).toContain(stage.charAt(0).toUpperCase() + stage.slice(1));
      }
    });
  });
});
