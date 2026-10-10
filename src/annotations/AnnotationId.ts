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
 * - Each id is one flat string built from a reused char-code buffer: no
 *   per-call typed array and no concatenation, whose rope of 27 pieces V8
 *   would otherwise keep alive for as long as the id lives (~250 bytes each).
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Char codes of {@link CROCKFORD}, indexed by 5-bit value. */
const CROCKFORD_CODES: readonly number[] = Array.from(CROCKFORD, (ch) => ch.charCodeAt(0));

const ID_LENGTH = 30;
const PREFIX_LENGTH = 4;
const TIMESTAMP_CHARS = 10;

let lastTimestamp = -1;
/** The last id's 80 random bits, big-endian; incremented in place in a same-ms burst. */
const lastRandom = new Uint8Array(10);
/**
 * Char codes of the id being built: `ann_`, then the timestamp, then the
 * randomness. A plain array of small integers: `String.fromCharCode.apply`
 * reads one about three times faster than a typed array.
 */
const idChars: number[] = Array.from('ann_'.padEnd(ID_LENGTH, '0'), (ch) => ch.charCodeAt(0));

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
    // Bounds-checked by `i < bytes.length`.
    const v = bytes[i]! + 1;
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
  if (now === lastTimestamp) {
    // Same-ms burst — increment the previous suffix to stay monotonic. The
    // timestamp's chars in `idChars` are already this millisecond's.
    incrementRandomness(lastRandom);
  } else {
    fillRandomBytes(lastRandom);
    lastTimestamp = now;
    // 48-bit timestamp → 10 Crockford chars (5 bits each), most significant
    // first. The value exceeds 32 bits, so no bitwise operators here.
    let value = now;
    for (let i = PREFIX_LENGTH + TIMESTAMP_CHARS - 1; i >= PREFIX_LENGTH; i--) {
      idChars[i] = CROCKFORD_CODES[value % 32]!;
      value = Math.floor(value / 32);
    }
  }

  // 80 random bits → 16 Crockford chars (5 bits each), read MSB-first. At
  // most 4 bits carry over between bytes, so 12 bits of buffer suffice.
  let bitBuffer = 0;
  let bitCount = 0;
  let out = PREFIX_LENGTH + TIMESTAMP_CHARS;
  for (const byte of lastRandom) {
    bitBuffer = ((bitBuffer << 8) | byte) & 0xfff;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      idChars[out++] = CROCKFORD_CODES[(bitBuffer >>> bitCount) & 0x1f]!;
    }
  }
  // One flat (sequential) string from all 30 codes.
  return String.fromCharCode.apply(null, idChars);
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
    // Bounds-checked by `i < s.length`.
    if (CROCKFORD.indexOf(s[i]!) === -1) return false;
  }
  return true;
}
