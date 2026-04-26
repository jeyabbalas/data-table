/**
 * ULID-style identifier generator for annotations.
 *
 * Output: `ann_` + 26 Crockford base32 chars — 10 timestamp + 16 randomness.
 *
 * - Lexicographic sort matches creation order (useful when diffing JSON).
 * - Monotonic within the same millisecond: if the timestamp hasn't advanced
 *   since the last call, the 80-bit random suffix is incremented by one.
 *   Prevents id collisions in tight loops such as `addMany`.
 * - Crockford alphabet excludes `I`, `L`, `O`, `U` to avoid human confusion.
 * - Randomness via WebCrypto; falls back to `Math.random()` only if
 *   `crypto.getRandomValues` is missing (never in our browser targets).
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

let lastTimestamp = -1;
const lastRandom = new Uint8Array(10);

function encodeTimestamp(ms: number): string {
  // 48-bit timestamp → 10 Crockford chars (5 bits each).
  let out = '';
  let value = ms;
  for (let i = 9; i >= 0; i--) {
    out = CROCKFORD[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

function encodeRandomness(bytes: Uint8Array): string {
  // 80 bits → 16 Crockford chars (5 bits each). Read bits MSB-first.
  let out = '';
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      out += CROCKFORD[(bitBuffer >>> bitCount) & 0x1f];
    }
  }
  return out;
}

function fillRandomBytes(target: Uint8Array<ArrayBuffer>): void {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(target);
    return;
  }
  // Defensive fallback — unreachable in supported browsers / node ≥ 18.
  for (let i = 0; i < target.length; i++) {
    target[i] = Math.floor(Math.random() * 256);
  }
}

function incrementRandomness(bytes: Uint8Array<ArrayBuffer>): void {
  // Treat bytes as big-endian 80-bit counter; increment by one with carry.
  for (let i = bytes.length - 1; i >= 0; i--) {
    const v = bytes[i] + 1;
    bytes[i] = v & 0xff;
    if (v < 256) return;
    // Carry into next byte.
  }
  // Overflow — should never happen in practice (would require 2⁸⁰ same-ms ids).
  // Roll over by refilling with fresh randomness.
  fillRandomBytes(bytes);
}

/**
 * Generate a new annotation id.
 *
 * @example
 *   generateAnnotationId(); // 'ann_01HXYZABCDEFGHJKMNPQRSTVWX'
 */
export function generateAnnotationId(): string {
  const now = Date.now();
  const bytes = new Uint8Array(10);
  if (now === lastTimestamp) {
    // Same-ms burst — increment the previous suffix to stay monotonic.
    bytes.set(lastRandom);
    incrementRandomness(bytes);
  } else {
    fillRandomBytes(bytes);
    lastTimestamp = now;
  }
  lastRandom.set(bytes);
  return `ann_${encodeTimestamp(now)}${encodeRandomness(bytes)}`;
}

/**
 * Cheap shape check — matches the `ann_` prefix + 26 Crockford chars output
 * of {@link generateAnnotationId}. Used for diagnostics; the store accepts
 * any non-empty string as an externally-supplied id.
 */
export function isAnnotationIdShape(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (s.length !== 30) return false;
  if (!s.startsWith('ann_')) return false;
  for (let i = 4; i < s.length; i++) {
    if (CROCKFORD.indexOf(s[i]) === -1) return false;
  }
  return true;
}
