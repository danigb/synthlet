// A deterministic stand-in for `Math.random`, for the tests only.
//
// It lives here rather than in `dsp.ts` because the shipped bundle should not
// grow for a testing concern, and because there is no user-facing `seed`: see
// `createArpeggiator`'s `random` argument, which is the seam this feeds.
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
