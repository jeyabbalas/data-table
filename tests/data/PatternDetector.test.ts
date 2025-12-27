import { describe, it, expect } from 'vitest';
import { detectPattern } from '@/data/PatternDetector';

describe('PatternDetector', () => {
  describe('detectPattern', () => {
    describe('email detection', () => {
      it('should detect email addresses', () => {
        const emails = [
          'john.doe@example.com',
          'jane@company.org',
          'bob.wilson@startup.io',
          'alice.chen@university.edu',
        ];
        const result = detectPattern(emails);
        expect(result.pattern).toBe('email');
        expect(result.confidence).toBe(1);
        expect(result.samplesTested).toBe(4);
        expect(result.samplesMatched).toBe(4);
      });

      it('should detect emails with subdomains', () => {
        const emails = [
          'user@mail.example.com',
          'admin@sub.domain.org',
        ];
        const result = detectPattern(emails);
        expect(result.pattern).toBe('email');
        expect(result.confidence).toBe(1);
      });
    });

    describe('URL detection', () => {
      it('should detect http URLs', () => {
        const urls = [
          'http://example.com',
          'http://example.com/path',
          'http://example.com/path?query=1',
        ];
        const result = detectPattern(urls);
        expect(result.pattern).toBe('url');
        expect(result.confidence).toBe(1);
      });

      it('should detect https URLs', () => {
        const urls = [
          'https://example.com',
          'https://secure.example.com/page',
          'https://example.com/users/john',
        ];
        const result = detectPattern(urls);
        expect(result.pattern).toBe('url');
        expect(result.confidence).toBe(1);
      });
    });

    describe('UUID detection', () => {
      it('should detect UUIDs', () => {
        const uuids = [
          '550e8400-e29b-41d4-a716-446655440000',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        ];
        const result = detectPattern(uuids);
        expect(result.pattern).toBe('uuid');
        expect(result.confidence).toBe(1);
      });

      it('should detect UUIDs case-insensitively', () => {
        const uuids = [
          '550E8400-E29B-41D4-A716-446655440000',
          '6BA7B810-9DAD-11D1-80B4-00C04FD430C8',
        ];
        const result = detectPattern(uuids);
        expect(result.pattern).toBe('uuid');
        expect(result.confidence).toBe(1);
      });
    });

    describe('IP address detection', () => {
      it('should detect IPv4 addresses', () => {
        const ips = [
          '192.168.1.100',
          '10.0.0.1',
          '172.16.254.1',
          '8.8.8.8',
        ];
        const result = detectPattern(ips);
        expect(result.pattern).toBe('ip');
        expect(result.confidence).toBe(1);
      });

      it('should detect special IP addresses', () => {
        const ips = [
          '127.0.0.1',
          '0.0.0.0',
          '255.255.255.255',
        ];
        const result = detectPattern(ips);
        expect(result.pattern).toBe('ip');
        expect(result.confidence).toBe(1);
      });
    });

    describe('phone number detection', () => {
      it('should detect international phone numbers', () => {
        const phones = [
          '+1-555-123-4567',
          '+44-20-7946-0958',
          '+86-10-1234-5678',
        ];
        const result = detectPattern(phones);
        expect(result.pattern).toBe('phone');
        expect(result.confidence).toBe(1);
      });

      it('should detect phone numbers with various formats', () => {
        const phones = [
          '+1-800-555-0199',
          '+91-98765-43210',
          '+49-30-12345678',
        ];
        const result = detectPattern(phones);
        expect(result.pattern).toBe('phone');
        expect(result.confidence).toBe(1);
      });
    });

    describe('identifier detection', () => {
      it('should detect identifiers with hyphens', () => {
        const identifiers = [
          'SKU-12345',
          'ID-789456',
          'REF-00001',
        ];
        const result = detectPattern(identifiers);
        expect(result.pattern).toBe('identifier');
        expect(result.confidence).toBe(1);
      });

      it('should detect identifiers with underscores', () => {
        const identifiers = [
          'SKU_12345',
          'ID_789456',
          'REF_00001',
        ];
        const result = detectPattern(identifiers);
        expect(result.pattern).toBe('identifier');
        expect(result.confidence).toBe(1);
      });

      it('should detect identifiers without separators', () => {
        const identifiers = [
          'ABC12345',
          'XYZ789456',
          'DEF00001',
        ];
        const result = detectPattern(identifiers);
        expect(result.pattern).toBe('identifier');
        expect(result.confidence).toBe(1);
      });
    });

    describe('no pattern (null)', () => {
      it('should return null for regular text', () => {
        const text = [
          'Hello world',
          'This is a test',
          'Random text here',
        ];
        const result = detectPattern(text);
        expect(result.pattern).toBe(null);
      });

      it('should return null for empty array', () => {
        const result = detectPattern([]);
        expect(result.pattern).toBe(null);
        expect(result.confidence).toBe(0);
        expect(result.samplesTested).toBe(0);
      });

      it('should return null for mixed patterns with low confidence', () => {
        const mixed = [
          'john@example.com',
          'regular text',
          'more text',
          'not an email',
        ];
        const result = detectPattern(mixed);
        // Email only matches 1/4 = 25%, so should not be confident
        expect(result.confidence).toBeLessThan(0.5);
      });
    });

    describe('priority handling', () => {
      it('should prefer UUID over other patterns when all match', () => {
        // UUID is most specific, should be preferred
        const uuids = [
          '550e8400-e29b-41d4-a716-446655440000',
        ];
        const result = detectPattern(uuids);
        expect(result.pattern).toBe('uuid');
      });
    });

    describe('confidence calculation', () => {
      it('should calculate correct confidence for partial matches', () => {
        const values = [
          'john@example.com',
          'jane@company.org',
          'not an email',
        ];
        const result = detectPattern(values);
        expect(result.samplesTested).toBe(3);
        expect(result.samplesMatched).toBe(2);
        expect(result.confidence).toBeCloseTo(2 / 3, 2);
      });
    });
  });
});
