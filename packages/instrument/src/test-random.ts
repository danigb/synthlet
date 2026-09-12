// A deterministic stand-in for `Math.random`, for the tests only.
//
// A copy of `packages/arp/src/test-random.ts`, and copied rather than shared
// for the reason that file gives: it must not reach a bundle, and the
// mechanism that keeps it out is that nothing imports it from `index.ts`.
// `copy_files.sh` does not carry it, because a test seam drifting is a test
// failure rather than a defect in a shipped module.
//
// It feeds `createArpState`'s `random` argument, which exists so the random
// arp modes can be asserted as a *sequence* rather than as a distribution.
// There is deliberately no user-facing `seed`.
//
// **Never import this from `index.ts`.** `tsup` bundles from that entrypoint,
// so an unimported file cannot reach a published package - which is the whole
// mechanism keeping this out of the bundle.

/**
 * xorshift32. Thirty-two bits of state, three shifts, and a period of 2^32-1:
 * enough for a note picker, and small enough to be obviously reproducible
 * across processes and platforms - which is the property the tests need.
 *
 * The `>>> 0` after each left shift keeps the intermediate unsigned; without
 * them `<<` produces a signed 32-bit value and the stream differs from every
 * other implementation of the same generator.
 */
export function xorshift32(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}
