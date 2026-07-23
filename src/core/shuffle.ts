/**
 * Cryptographically secure Fisher–Yates shuffle.
 *
 * Uses an injectable random source so the shuffle is deterministic under test
 * but defaults to a CSPRNG (Web Crypto `crypto.getRandomValues`, available in
 * Node >= 19 and all modern browsers / edge runtimes) in production.
 *
 * IMPORTANT: This must only ever run on the server. The browser must never
 * shuffle or learn deck order.
 */

import { assertFullDeck, type Card } from "./cards";

/**
 * Returns a uniformly random integer in [0, maxExclusive) using rejection
 * sampling over 32-bit values to avoid modulo bias.
 */
export type RandomInt = (maxExclusive: number) => number;

export function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0 || !Number.isInteger(maxExclusive)) {
    throw new Error(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  if (maxExclusive === 1) return 0;

  const globalCrypto: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (!globalCrypto || typeof globalCrypto.getRandomValues !== "function") {
    throw new Error("Secure randomness (crypto.getRandomValues) is unavailable in this runtime");
  }

  const range = 0x100000000; // 2^32
  const limit = range - (range % maxExclusive); // largest multiple of maxExclusive <= 2^32
  const buf = new Uint32Array(1);
  // Rejection sampling removes modulo bias.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    globalCrypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % maxExclusive;
  }
}

/**
 * Returns a new shuffled copy of `deck` using an unbiased Fisher–Yates pass.
 * Does not mutate the input. Validates that the input is a full, unique deck.
 */
export function secureShuffle(deck: readonly Card[], randomInt: RandomInt = cryptoRandomInt): Card[] {
  assertFullDeck(deck);
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
