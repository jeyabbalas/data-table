/**
 * Phase 4: PatternDetector behavior locked.
 *
 * Covers the documented detector set (UUID, email, URL, IPv4, phone,
 * identifier) plus negative-assertion locks for **patterns explicitly
 * NOT detected today** (currency, percentage, units). The negative locks
 * mean adding currency/percent/unit detection later becomes a deliberate,
 * observable change rather than a silent feature creep.
 */
import { describe, expect, it } from 'vitest';

import { detectPattern } from '@/data/PatternDetector';

describe('PatternDetector — supported patterns', () => {
  it('UUID — clean lowercase v4-shaped values resolve to "uuid"', () => {
    const result = detectPattern([
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(result.pattern).toBe('uuid');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('UUID — mixed-case is accepted (regex is case-insensitive)', () => {
    const result = detectPattern([
      '550E8400-E29B-41D4-A716-446655440000',
      '6BA7B810-9DAD-11d1-80B4-00C04FD430C8',
    ]);
    expect(result.pattern).toBe('uuid');
  });

  it('email — common shapes resolve to "email"', () => {
    const result = detectPattern([
      'alice@example.com',
      'bob.smith@company.co.uk',
      'first+tag@domain.io',
      'user_name@sub.domain.example',
    ]);
    expect(result.pattern).toBe('email');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('url — http/https URLs resolve to "url"', () => {
    const result = detectPattern([
      'https://example.com',
      'http://docs.example.com/path?q=1',
      'https://sub.domain.example/a/b/c#frag',
    ]);
    expect(result.pattern).toBe('url');
  });

  it('IPv4 — quad-octet addresses resolve to "ip"', () => {
    const result = detectPattern([
      '192.168.1.1',
      '10.0.0.42',
      '172.16.254.1',
      '8.8.8.8',
      '255.255.255.255',
    ]);
    expect(result.pattern).toBe('ip');
  });

  it('phone — international formats resolve to "phone"', () => {
    const result = detectPattern([
      '+1-555-123-4567',
      '+44 20 7946 0958',
      '(555) 123-4567',
      '555.123.4567',
    ]);
    expect(result.pattern).toBe('phone');
  });

  it('identifier — SKU-style codes resolve to "identifier"', () => {
    const result = detectPattern(['SKU-12345', 'ABC-987', 'XYZ_5550', 'ID-1000']);
    expect(result.pattern).toBe('identifier');
  });
});

describe('PatternDetector — confidence threshold', () => {
  it('a 50/50 mix of UUID and email returns the higher-count pattern (or both at exactly 50% picks priority)', () => {
    const result = detectPattern([
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'alice@example.com',
      'bob@example.com',
    ]);
    // 2 UUIDs vs 2 emails — UUID has lower priority number, so UUID wins.
    expect(result.pattern).toBe('uuid');
    // Confidence is matched/total = 2/4 = 0.5.
    expect(result.confidence).toBeCloseTo(0.5, 1);
  });

  it('mixed unstructured data → null pattern', () => {
    const result = detectPattern([
      'Lorem ipsum dolor',
      'just some text',
      'Hello world',
      'Generic description here',
    ]);
    expect(result.pattern).toBeNull();
  });

  it('empty values array → null pattern, confidence 0', () => {
    const result = detectPattern([]);
    expect(result.pattern).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.samplesTested).toBe(0);
  });
});

describe('PatternDetector — deferred (NOT detected) patterns lock-test', () => {
  /**
   * Phase 4 deferral: PatternDetector does NOT detect currency,
   * percentages, or units today. The brief asks to test these — we lock
   * the absence so adding the detectors later is a deliberate,
   * observable change. Track as a follow-up feature item in the
   * Phase 4 report (§Issues deferred).
   */

  it('currency strings ("$1,234.56") return null pattern (not detected today)', () => {
    const result = detectPattern(['$1,234.56', '$99.00', '$10,000.99', '$5.50']);
    expect(result.pattern).toBeNull();
  });

  it('percentage strings ("12.5%") return null pattern (not detected today)', () => {
    const result = detectPattern(['12.5%', '99.9%', '0.5%', '100%']);
    expect(result.pattern).toBeNull();
  });

  it('unit-suffixed strings ("100kg", "5km") return null pattern (not detected today)', () => {
    const result = detectPattern(['100kg', '5km', '250mg', '15cm']);
    expect(result.pattern).toBeNull();
  });
});
