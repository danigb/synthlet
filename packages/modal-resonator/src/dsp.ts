/**
 * A bank of tuned, decaying resonators driven by a mode table, with no Web
 * Audio anywhere near it.
 *
 * Every mode is the cheapest thing that rings. Synth Secrets Parts 31 to 41 are
 * ten chapters of tables - a ratio, a level and a decay per partial - followed
 * by a struggle to play them on four oscillators and four contour generators.
 * Here a table row is one mode, and one node plays the table.
 *
 * ## The mode is a rotating, decaying phasor
 *
 * Each mode is a 2-vector `(u, v)`, rotated by `w` and shrunk by `r` every
 * sample. The input enters on `u`; `v` is the output:
 *
 * ```
 * c = r cos w,  s = r sin w          w = 2 pi f / sampleRate
 * u' = c u - s v + g x
 * v' = s u + c v
 * ```
 *
 * A unit impulse leaves `(g, 0)`, and from then on the vector turns and shrinks:
 * `v[n] = g r^n sin(n w)`. Three properties follow directly, and each one is a
 * requirement:
 *
 * - **The envelope is exactly `g r^n`, at every frequency.** So `g` is the
 *   table's `level` (tilted by `brightness`) with no normalisation term: a
 *   unit impulse puts every mode's envelope at its level whatever its decay
 *   and whatever its pitch. The output itself is sine-phase, so it starts at
 *   zero rather than clicking, and its first *peak* lands a quarter cycle in.
 * - **Decay is exact.** `r = exp(-ln(1000) / (seconds * sampleRate))`, so after
 *   `seconds` the envelope is `1/1000`: -60 dB, the library's convention.
 * - **A new `w` changes the pitch and nothing else.** A rotation preserves the
 *   vector's length, so a ringing mode keeps its loudness through a pitch
 *   envelope and through a `setModes` swap.
 *
 * ## Why not the direct form
 *
 * The textbook two-pole resonator, `y = a1 y[1] + a2 y[2] + g x`, is two
 * multiplies instead of four, and it is what the ticket specified. It stores
 * two past *samples*, not an amplitude, so when `a1` changes under a ringing
 * mode the amplitude those two samples imply changes with it - roughly as
 * `1 / sqrt(f)`. Measured before this was written: a 2000 -> 100 Hz drum sweep
 * comes out 12.9 dB louder than it went in, and swapping a table from a mode
 * at 3520 Hz to one at 440 Hz triples the peak. This form measures -0.32 dB
 * and 0.92x on the same two cases.
 *
 * ## Interpolation
 *
 * `frequency` and `decay` are k-rate. The two coefficients of each mode ramp
 * linearly across the block from the last block's values to this one's, the
 * `ParameterInterpolator` pattern of Mutable Instruments' code. Part way along
 * the ramp `|(c, s)|` is on the chord between two points of a circle of radius
 * `r`, so inside it: interpolation can only ever add a sliver of damping, and
 * the bank is stable unconditionally.
 *
 * ## Mono, deliberately
 *
 * A body is one object. Input channels are summed and the output is one
 * channel: sixty-four resonators per channel would double the cost for a
 * stereo image a `StereoPannerNode` after the node gives for free.
 */

import { harmonic, ResonatorMode } from "./modes";

/** Pool size when the construction option is absent - `granite`'s 64 halved. */
export const DEFAULT_MAX_MODES = 32;

/** The largest pool a node may ask for. */
export const MAX_MODES_LIMIT = 256;

/** The table a node starts with, before any `setModes`. */
export const DEFAULT_MODES = 8;

/**
 * Modes at or above this fraction of the sample rate are silenced.
 *
 * A resonator tuned at or past Nyquist is not a resonator - it rings at an
 * alias - and thirty-two harmonic modes at 2 kHz put the top twenty-three past
 * it at 44.1 kHz. Just under 0.5, so a mode that would ring at an audible alias
 * is gone before it gets there.
 */
export const SILENCE_RATIO = 0.45;

/**
 * Energy (`u^2 + v^2`) below which a mode's state is flushed to zero: -300 dB.
 *
 * A decaying mode eventually runs in denormals - at `decay: 0.01` the output is
 * below 1e-30 after 4209 samples - and a processor that keeps running on
 * subnormals keeps paying for them. The library's usual answer, an alternating
 * `DENORMAL` injected into the path, would make "nothing in, nothing out"
 * false by construction; `decimator` made the same call for the same reason.
 */
export const FLUSH_ENERGY = 1e-30;

/** Fields per table row: ratio, level, decay. */
export const FIELDS = 3;

/** ln(1000): the exponent that makes a decay time a time to -60 dB. */
const T60 = Math.log(1000);

/**
 * The largest pole radius a mode may have. `exp(-x)` rounds to exactly 1 for
 * `x` below about 1e-16, and an undamped rotation never decays; this keeps a
 * table decay of a billion from producing one.
 */
const MAX_RADIUS = 1 - 1e-12;

/** `processorOptions.maxModes`, made safe: an integer in `1 ... MAX_MODES_LIMIT`. */
export function clampMaxModes(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : NaN;
  if (!(n >= 1)) return DEFAULT_MAX_MODES;
  return n > MAX_MODES_LIMIT ? MAX_MODES_LIMIT : n;
}

/**
 * A mode table as a flat `Float64Array` of `ratio, level, decay` triples, at
 * most `max` rows long: the shape that crosses the port.
 */
export function packModes(
  modes: readonly ResonatorMode[],
  max: number,
): Float64Array {
  const count = Math.min(modes.length, max);
  const data = new Float64Array(count * FIELDS);
  for (let k = 0; k < count; k++) {
    data[k * FIELDS] = modes[k].ratio;
    data[k * FIELDS + 1] = modes[k].level;
    data[k * FIELDS + 2] = modes[k].decay;
  }
  return data;
}

export type ResonatorBankOptions = {
  /**
   * Ramp the coefficients across each block. Always on in the processor; off
   * only in the test that proves the ramp is what removes the zipper.
   */
  interpolate?: boolean;
};

/**
 * A bank of at most `maxModes` resonators. Everything is allocated here, once:
 * `setModes`, `update` and `process` allocate nothing, and a table swap copies
 * into the pool rather than replacing it.
 *
 * Call `update` once per block with the three parameter values, then
 * `process` with that block's input channels and the output channel.
 */
export function createResonatorBank(
  sampleRate: number,
  maxModes: number,
  options: ResonatorBankOptions = {},
) {
  const max = clampMaxModes(maxModes);
  const interpolate = options.interpolate !== false;
  const limit = SILENCE_RATIO * sampleRate;

  // The table, sanitised: a row whose ratio is 0 is invalid and silent.
  const table = new Float64Array(max * FIELDS);
  let count = 0;

  // Per-mode state. `c`/`s` are where this block's ramp starts, `tc`/`ts` where
  // it ends, `g` the input gain. `live` says `c`/`s` belong to a mode that was
  // running last block - a mode that was silenced or is new has no previous
  // coefficients to ramp from, so it starts at its target.
  const u = new Float64Array(max);
  const v = new Float64Array(max);
  const c = new Float64Array(max);
  const s = new Float64Array(max);
  const tc = new Float64Array(max);
  const ts = new Float64Array(max);
  const g = new Float64Array(max);
  const valid = new Uint8Array(max);
  const live = new Uint8Array(max);

  // This block's running modes, so the sample loop never branches on a
  // silenced one.
  const active = new Int32Array(max);
  let activeCount = 0;

  // The mono sum of the input. The render quantum is 128; it grows only if a
  // host or a test drives a longer block.
  let scratch = new Float32Array(128);

  let dirty = true;
  let $frequency = NaN;
  let $decay = NaN;
  let $brightness = NaN;

  const silence = (k: number) => {
    u[k] = 0;
    v[k] = 0;
    live[k] = 0;
  };

  /**
   * Replace the table. Takes effect at the next `update`; modes that exist in
   * both tables keep ringing from where they are, modes past the end of the new
   * one are silenced, and modes new to it start from silence.
   *
   * A row with a non-finite field, a ratio or decay at or below zero, is kept
   * in place but silent, so a bad row cannot put a NaN into the sum. Rows past
   * the pool are dropped: the caller warns, this does not throw.
   */
  function setModes(data: ArrayLike<number>, rows: number) {
    const next = Math.max(
      0,
      Math.min(Math.floor(rows), max, Math.floor(data.length / FIELDS)),
    );
    for (let k = 0; k < next; k++) {
      const ratio = data[k * FIELDS];
      const level = data[k * FIELDS + 1];
      const decay = data[k * FIELDS + 2];
      const ok =
        ratio > 0 &&
        ratio < Infinity &&
        decay > 0 &&
        decay < Infinity &&
        Number.isFinite(level);
      table[k * FIELDS] = ok ? ratio : 0;
      table[k * FIELDS + 1] = ok ? level : 0;
      table[k * FIELDS + 2] = ok ? decay : 1;
    }
    for (let k = next; k < count; k++) silence(k);
    count = next;
    dirty = true;
  }

  /** This block's parameter values. Recomputes coefficients only on a change. */
  function update(frequency: number, decay: number, brightness: number) {
    if (
      dirty ||
      frequency !== $frequency ||
      decay !== $decay ||
      brightness !== $brightness
    ) {
      dirty = false;
      $frequency = frequency;
      $decay = decay;
      $brightness = brightness;

      let tilt = 1; // brightness^k, so Math.pow(0, 0) = 1 without a pow
      for (let k = 0; k < count; k++) {
        const ratio = table[k * FIELDS];
        const f = frequency * ratio;
        if (!(ratio > 0) || !(f < limit) || !(decay > 0)) {
          valid[k] = 0;
          g[k] = 0;
        } else {
          const seconds = decay * table[k * FIELDS + 2];
          let r = Math.exp(-T60 / (seconds * sampleRate));
          if (r > MAX_RADIUS) r = MAX_RADIUS;
          const w = (2 * Math.PI * f) / sampleRate;
          tc[k] = r * Math.cos(w);
          ts[k] = r * Math.sin(w);
          g[k] = table[k * FIELDS + 1] * tilt;
          valid[k] = 1;
        }
        tilt *= brightness;
      }
    }

    activeCount = 0;
    for (let k = 0; k < count; k++) {
      if (valid[k] === 0) {
        silence(k);
        continue;
      }
      if (live[k] === 0) {
        c[k] = tc[k];
        s[k] = ts[k];
        live[k] = 1;
      }
      // A mode that cannot be excited and is not ringing costs nothing.
      if (g[k] === 0 && u[k] === 0 && v[k] === 0) continue;
      active[activeCount++] = k;
    }
  }

  /**
   * Render one block. `input` is the input's channel list - empty when nothing
   * is connected, which is not a reason to stop: a disconnected exciter leaves
   * the modes ringing. `output` is overwritten.
   */
  function process(
    input: readonly Float32Array[] | undefined,
    output: Float32Array,
  ) {
    const n = output.length;
    if (scratch.length < n) scratch = new Float32Array(n);
    const x = scratch;

    // Sum the input channels to mono.
    const channels = input ? input.length : 0;
    if (channels === 0) {
      x.fill(0, 0, n);
    } else {
      x.set(input![0].subarray(0, n));
      for (let ch = 1; ch < channels; ch++) {
        const channel = input![ch];
        for (let i = 0; i < n; i++) x[i] += channel[i];
      }
    }

    output.fill(0);

    for (let a = 0; a < activeCount; a++) {
      const k = active[a];
      let U = u[k];
      let V = v[k];
      let C = c[k];
      let S = s[k];
      const gain = g[k];
      let dc = 0;
      let ds = 0;
      if (interpolate) {
        dc = (tc[k] - C) / n;
        ds = (ts[k] - S) / n;
      } else {
        C = tc[k];
        S = ts[k];
      }

      for (let i = 0; i < n; i++) {
        C += dc;
        S += ds;
        const next = C * U - S * V + gain * x[i];
        V = S * U + C * V;
        U = next;
        output[i] += V;
      }

      // Land exactly on the target, not on n additions of it.
      c[k] = tc[k];
      s[k] = ts[k];
      if (U * U + V * V < FLUSH_ENERGY) {
        U = 0;
        V = 0;
      }
      u[k] = U;
      v[k] = V;
    }
  }

  setModes(packModes(harmonic(DEFAULT_MODES), max), DEFAULT_MODES);

  return {
    setModes,
    update,
    process,
    /** The pool size this bank was built with, after clamping. */
    maxModes: max,
    /** Mode state, exposed for tests: the envelope of mode k is `hypot(u[k], v[k])`. */
    u,
    v,
    /** The sanitised table, exposed for tests. */
    table,
  };
}

export type ResonatorBank = ReturnType<typeof createResonatorBank>;
