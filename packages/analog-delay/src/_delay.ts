// DON'T EDIT THIS FILE unless inside scripts/_delay.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Synthlet's one circular buffer.
//
// Six packages grew their own before this existed - Faust's bitmask rings in
// `reverb-delay`, `chorus` and `dattorro-reverb`, a modulo ring in
// `karplus-strong`, a shift-based FIFO in `flex-audio-buffer-source`, a
// monotonic deque in `lookahead-limiter` - sharing no naming, no wrap rule and
// no interpolation. The 4th-order Lagrange read in `reverb-delay` is written
// out again at every call site. This file is the one they should have been.
//
// Three decisions worth stating, because they are the ones a second
// implementation would get differently:
//
// 1. **The size is a power of two and wrapping is a mask, not a modulo.** A
//    modulo of a negative number is negative in JavaScript, so a modulo ring
//    needs a branch or an added bias at every read. `&` needs neither:
//    bitwise operators coerce to int32 two's complement first, so `(-9) & 7`
//    is `7` and a read that runs off the start of the buffer wraps correctly
//    with no test at all.
//
// 2. **The write pointer increments.** stmlib's decrements, which makes a read
//    an addition; incrementing reads more naturally in JavaScript and matches
//    the `writeIndex` already in `karplus-strong`. Delay `d` is then
//    `writePtr - 1 - d`: delay 0 is the sample written most recently.
//
// 3. **Fractional reads are Hermite, not linear.** Two-point interpolation is
//    a lowpass whose corner moves with the fractional part, so a delay line
//    read with it darkens as it is swept and, in a feedback loop, damps by
//    accident rather than by design - the defect measured in `karplus-strong`.
//    The 4-point, 3rd-order Hermite kernel here is exact for cubics, which is
//    both the reason to prefer it and the property its test asserts.

/**
 * A circular buffer with integer, linear and Hermite reads, plus a Schroeder
 * allpass built on the same storage.
 *
 * Every method is allocation-free; the single `Float32Array` is allocated in
 * `createDelayLine` and never replaced.
 */
export type DelayLine = {
  /** Stores one sample and advances the write pointer. */
  write(sample: number): void;
  /**
   * The sample written `delay` writes ago. `delay` is truncated to an integer
   * and must be in `[0, size - 4]`.
   */
  read(delay: number): number;
  /**
   * Two-point linear read. Exact at integer delays; elsewhere it is the
   * straight line between neighbours, and so slightly lowpassed. Prefer
   * `readHermite` unless the cheaper read is measured to be enough.
   */
  readLinear(delay: number): number;
  /**
   * Four-point, 3rd-order Hermite read. Reads `delay - 1` through
   * `delay + 2`, so `delay` must be in `[1, size - 4]`.
   */
  readHermite(delay: number): number;
  /**
   * One Schroeder allpass section: reads fractionally at `delay`, writes the
   * feedback sum, returns the allpass output. Flat magnitude for
   * `|coefficient| < 1`; the fractional read is what lets `delay` be
   * modulated.
   */
  allpass(sample: number, delay: number, coefficient: number): number;
  /** Zeroes the buffer and rewinds the write pointer. */
  reset(): void;
  /** Allocated length: a power of two, at least `maxSamples + 4`. */
  readonly size: number;
};

/**
 * Allocates a delay line able to hold `maxSamples` of history.
 *
 * The buffer is the next power of two at or above `maxSamples + 4`. The `+ 4`
 * is Hermite's support: it reads one sample newer and two older than the
 * requested delay, so the longest usable delay has to stay clear of the write
 * pointer at both ends.
 */
export function createDelayLine(maxSamples: number): DelayLine {
  let size = 4;
  while (size < maxSamples + 4) size *= 2;
  const mask = size - 1;
  const buffer = new Float32Array(size);
  let writePtr = 0;

  const write = (sample: number) => {
    buffer[writePtr] = sample;
    writePtr = (writePtr + 1) & mask;
  };

  return {
    write,
    size,

    read(delay) {
      return buffer[(writePtr - 1 - (delay | 0)) & mask];
    },

    readLinear(delay) {
      const i = delay | 0;
      const f = delay - i;
      const base = writePtr - 1 - i;
      const y0 = buffer[base & mask];
      const y1 = buffer[(base - 1) & mask];
      return y0 + (y1 - y0) * f;
    },

    readHermite,

    allpass(sample, delay, coefficient) {
      const delayed = readHermite(delay);
      const sum = sample + coefficient * delayed;
      write(sum);
      return delayed - coefficient * sum;
    },

    reset() {
      buffer.fill(0);
      writePtr = 0;
    },
  };

  // Niemitalo's 4-point, 3rd-order Hermite (x-form), the same kernel as
  // stmlib's `ReadHermite`. `ym1` is one sample *newer* than `y0` because
  // increasing delay runs backwards in time; the kernel only needs the four
  // points to be evenly spaced and consistently ordered, so a cubic in write
  // index is still reproduced exactly.
  function readHermite(delay: number) {
    const i = delay | 0;
    const f = delay - i;
    const base = writePtr - 1 - i;
    const ym1 = buffer[(base + 1) & mask];
    const y0 = buffer[base & mask];
    const y1 = buffer[(base - 1) & mask];
    const y2 = buffer[(base - 2) & mask];

    const c1 = 0.5 * (y1 - ym1);
    const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * f + c2) * f + c1) * f + y0;
  }
}
