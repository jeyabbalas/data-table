import { describe, it, expect } from 'vitest';
import { DataLoader } from '@/data/DataLoader';
import type { WorkerBridge } from '@/data/WorkerBridge';

describe('DataLoader', () => {
  // Create a mock bridge for testing format detection methods
  const mockBridge = {} as WorkerBridge;

  describe('detectFormatFromFile', () => {
    it('should detect CSV from file extension', () => {
      const mockFile = new File([''], 'data.csv', { type: 'text/csv' });
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('csv');
    });

    it('should detect JSON from file extension', () => {
      const mockFile = new File([''], 'data.json', {
        type: 'application/json',
      });
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('json');
    });

    it('should detect Parquet from file extension', () => {
      const mockFile = new File([''], 'data.parquet');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('parquet');
    });

    it('should default to CSV for unknown extension', () => {
      const mockFile = new File([''], 'data.txt');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('csv');
    });

    it('should handle uppercase extensions', () => {
      const mockFile = new File([''], 'DATA.JSON');
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromFile(mockFile)).toBe('json');
    });
  });

  describe('detectFormatFromURL', () => {
    it('should detect CSV from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromURL('https://example.com/data.csv')).toBe(
        'csv'
      );
    });

    it('should detect JSON from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromURL('https://example.com/data.json')).toBe(
        'json'
      );
    });

    it('should detect Parquet from URL path', () => {
      const loader = new DataLoader(mockBridge);
      expect(
        loader.detectFormatFromURL('https://example.com/data.parquet')
      ).toBe('parquet');
    });

    it('should handle URLs with query parameters', () => {
      const loader = new DataLoader(mockBridge);
      // URL.pathname correctly excludes query string
      expect(
        loader.detectFormatFromURL('https://example.com/path/file.json?token=abc')
      ).toBe('json');
    });

    it('should handle raw GitHub URLs', () => {
      const loader = new DataLoader(mockBridge);
      expect(
        loader.detectFormatFromURL(
          'https://raw.githubusercontent.com/user/repo/main/data.csv'
        )
      ).toBe('csv');
    });
  });

  describe('detectFormatFromContent', () => {
    it('should detect JSON array from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('[{"a": 1}]')).toBe('json');
    });

    it('should detect JSON object from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('{"a": 1}')).toBe('json');
    });

    it('should detect JSON with leading whitespace', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('  \n[{"a": 1}]')).toBe('json');
    });

    it('should detect CSV from content', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('a,b,c\n1,2,3')).toBe('csv');
    });

    it('should detect Parquet from ArrayBuffer', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent(new ArrayBuffer(10))).toBe(
        'parquet'
      );
    });

    it('should default to CSV for non-JSON text', () => {
      const loader = new DataLoader(mockBridge);
      expect(loader.detectFormatFromContent('some random text')).toBe('csv');
    });
  });
});
