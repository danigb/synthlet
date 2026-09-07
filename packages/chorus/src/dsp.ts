import { createDelayLine, DelayLine } from "./_delay";

/**
 * A chorus: N taps on one delay line per channel, read fractionally at
 * positions an LFO bank moves, summed through an output matrix.
 *
 * This replaces 257 lines of Faust output that carried its own 8192-sample
 * bitmask ring and its own two-point linear interpolator, which is the one
 * combination Dattorro (1997) 6.1 rules out by name:
 *
 * > "Linear interpolation is a time-varying low-pass filtering process.
 * > Indeed, a multivoice (more than two) chorus design using linear
 * > interpolation subjects the signal to significantly audible amounts of
 * > low-pass filtering attributable to the interpolation."
 *
 * The read here is `_delay.ts`'s 4-point Hermite, and the three papers that
 * look like they disagree about that reconcile once you notice Dattorro's
 * objection is to *two-point* linear specifically. Valimaki (1995) 3.5 shows
 * why plain allpass measures worse than linear under modulation - it is
 * recursive, so every per-sample coefficient change elicits the filter's
 * natural response - and Niemitalo (2001) 7 picks 4-point Hermite for
 * un-oversampled audio by name. Hermite is FIR, so Valimaki's transient never
 * arises, and it is 4-point, so Dattorro's warning does not apply.
 */
export enum ChorusMode {
  Juno = 0,
  Ensemble = 1,
  Dimension = 2,
}

/**
 * The longest base delay plus excursion any voicing asks for, in milliseconds.
 *
 * The lines are allocated for this once, in the factory, and never again: a
 * mode change is a different row of a table, not a different buffer.
 * `createDelayLine` rounds up to the next power of two at or above
 * `maxSamples + 4`, so at 96 kHz this is 1920 samples in a 2048-sample line.
 *
 * Sized from the sample rate the engine is actually running at rather than
 * from a hardcoded 96 kHz: the guarantee that matters is one allocation in the
 * factory, and honouring it at the real rate costs a third fewer bytes at
 * 44.1 kHz for the same promise.
 */
const MAX_DELAY_MS = 20;

const TAU = 2 * Math.PI;

/**
 * The golden ratio, the real number worst approximated by any fraction.
 *
 * It is here because of what the old engine got wrong. Its eight LFOs ran at
 * `rate x {1, 1/2, 1/3, 1/4, 1/6, 1/7, 1/8}` Hz, every one of them a rational
 * fraction of every other, so the whole eight-voice pattern closed on a period
 * of `8/rate` seconds - a sixteen-second loop at the default setting. That is
 * the RS-101 construction, one clock divided 1:2:4:8, and the RS-101 is
 * described as sounding correspondingly more regular than the RS-09, which
 * used four *independent* LFOs. Mutable's `Ensemble` takes the other road with
 * two accumulators at 0.75 Hz and 6.57 Hz.
 *
 * Those two are the numbers to steal, but their exact ratio is `219/25`, so
 * the pair still closes after 25 slow cycles - 33 s at the default rate, and
 * inside the 60 s this package holds itself to. `6*PHI - 1 = 8.7082` is
 * irrational by construction, and it puts the fast LFO at 6.531 Hz against
 * Plaits' 6.57: 0.6 % away, musically the same pair, and incommensurate for
 * good rather than for 33 seconds.
 */
const PHI = (1 + Math.sqrt(5)) / 2;

/** The `ENSEMBLE` fast/slow rate ratio. See `PHI`. */
export const FAST_MULTIPLIER = 6 * PHI - 1;

/**
 * The deepest excursion that is still musical at a given LFO rate, in
 * milliseconds.
 *
 * Martens & Marui (2006) tested 25 listeners across vibrato, flange and stereo
 * chorus at 2/3/4/6/9 Hz with depths log-spaced over 0.04-1.0 ms, and found
 * the useful-range boundaries substantially the same for all three effects.
 * Regressed on modulation *period*, which linearises them, the upper bound -
 * useful to "too extreme" - is `D(us) = 4800*(1/rate) - 350`, R^2 = 0.94. It
 * could only be fitted at 4, 6 and 9 Hz: at 2 and 3 Hz nothing in the tested
 * range ever became too extreme, which is why the voicing's own ceiling has to
 * be the other half of the clamp.
 *
 * The shape is that faster LFOs need proportionally less depth, and it is what
 * makes one `depth` knob musical across the whole `rate` range instead of at
 * one setting. Exported so the coupling can be asserted against the derivation
 * rather than only against a trend.
 */
export const usefulDepthMs = (rateHz: number) =>
  rateHz > 0 ? (4800 / rateHz - 350) / 1000 : Infinity;

/** Where a voice reads. The mid is both lines averaged, for a centred voice. */
export enum Source {
  Left = 0,
  Right = 1,
  Mid = 2,
}

/**
 * One tap.
 *
 * A voice knows where it sits, how far it swings and what it contributes to
 * each output channel. It does not know which voicing it belongs to, and that
 * separation is what makes the three voicings a table rather than three code
 * paths.
 */
export type Voice = {
  /** Base delay in milliseconds, before modulation. */
  delayMs: number;
  /** Share of the voicing's excursion this voice takes, usually 1. */
  modScale: number;
  /** LFO phase offset in cycles, 0 to 1. */
  phase: number;
  /** Weight on the slow accumulator. */
  slow: number;
  /** Weight on the fast accumulator. */
  fast: number;
  source: Source;
  gainL: number;
  gainR: number;
};

/**
 * A hand-written chorus engine.
 *
 * Pure: it touches no worklet globals, so the tests drive it directly through
 * `render()`.
 */
export function createChorus(sampleRate: number) {
  const msToSamples = sampleRate / 1000;
  const maxSamples = Math.ceil(MAX_DELAY_MS * msToSamples);
  const left = createDelayLine(maxSamples);
  const right = createDelayLine(maxSamples);

  /**
   * `readHermite` reads `delay - 1` through `delay + 2`, so the read has to
   * stay clear of the write pointer at both ends. Clamped here, at the read
   * site, rather than at the parameter - the same place `analog-delay` clamps,
   * and for the same reason: the parameter is a musical quantity and the bound
   * is a property of the buffer.
   */
  const limit = left.size - 4;
  const clampDelay = (samples: number) =>
    samples < 1 ? 1 : samples > limit ? limit : samples;

  // Two voices in antiphase on a 3 ms centre - the Juno shape, and the only
  // one this file knows about until the voicing table lands.
  const voices: Voice[] = [
    {
      delayMs: 3,
      modScale: 1,
      phase: 0,
      slow: 1,
      fast: 0,
      source: Source.Left,
      gainL: 1,
      gainR: 0,
    },
    {
      delayMs: 3,
      modScale: 1,
      phase: 0.5,
      slow: 1,
      fast: 0,
      source: Source.Right,
      gainL: 0,
      gainR: 1,
    },
  ];

  // Targets, set by `update` once per block.
  let tRate = 0.5;
  let tDepth = 0.5;
  let tMix = 0.5;
  let tWidth = 1;

  // The same values as they actually are right now, ramped towards the targets
  // one sample at a time. Every parameter here is k-rate, so stepping them at
  // block boundaries would put a 344 Hz staircase on anything modulating them
  // - the argument `digital-delay/src/dsp.ts` makes, and it applies doubly
  // here because the read position is what moves.
  let rate = tRate;
  let depth = tDepth;
  let mix = tMix;
  let width = tWidth;
  let primed = false;

  // The LFO bank: two accumulators, and a voice reads whichever of them its
  // weights ask for. `phase += inc; if (phase >= 1) phase -= 1` is the house
  // idiom, and `Math.sin` rather than a wavetable is deliberate - the table is
  // exactly what broke in the engine this replaces. `fillTable` there ignored
  // its `fn` argument, so both of Faust's `os.oscp` tables held a cosine and
  // the per-voice phase offsets did not compute: `table[0]` read 1.000000
  // where `sin` gives 0.
  let slowPhase = 0;
  let fastPhase = 0;

  /** The voicing's own excursion ceiling in ms. */
  const maxDepthMs = 2;
  /** Multipliers on `rate` for the two accumulators. */
  const slowMul = 1;
  const fastMul = FAST_MULTIPLIER;

  function update(
    rateHz: number,
    depthAmount: number,
    mixAmount: number,
    widthAmount: number,
  ) {
    tRate = rateHz;
    tDepth = depthAmount;
    tMix = mixAmount;
    tWidth = widthAmount;
  }

  function reset() {
    left.reset();
    right.reset();
    rate = tRate;
    depth = tDepth;
    mix = tMix;
    width = tWidth;
    primed = false;
    slowPhase = 0;
    fastPhase = 0;
  }

  function compute(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ) {
    const n = outL.length;
    if (n === 0) return;

    if (!primed) {
      // First block: adopt the constructed settings rather than ramping to
      // them from the descriptor defaults.
      primed = true;
      rate = tRate;
      depth = tDepth;
      mix = tMix;
      width = tWidth;
    }

    const step = 1 / n;
    const dRate = (tRate - rate) * step;
    const dDepth = (tDepth - depth) * step;
    const dMix = (tMix - mix) * step;
    const dWidth = (tWidth - width) * step;
    const perVoice = 1 / voices.length;

    for (let i = 0; i < n; i++) {
      rate += dRate;
      depth += dDepth;
      mix += dMix;
      width += dWidth;

      // The phase increment follows the ramped rate rather than the target, so
      // a jump in `rate` moves the speed and never the phase.
      const slowInc = (rate * slowMul) / sampleRate;
      const fastInc = (rate * fastMul) / sampleRate;
      slowPhase += slowInc;
      if (slowPhase >= 1) slowPhase -= 1;
      fastPhase += fastInc;
      if (fastPhase >= 1) fastPhase -= 1;

      // `rate: 0` leaves both increments at zero, so every phase holds where
      // it is. That is a legitimate setting - a static comb - as well as what
      // the tests need to read a base delay without chasing a moving tap.
      const useful = usefulDepthMs(rate);
      const excursion = depth * (useful < maxDepthMs ? useful : maxDepthMs);

      const dryL = inL[i];
      const dryR = inR[i];
      left.write(dryL);
      right.write(dryR);

      let wetL = 0;
      let wetR = 0;
      for (let v = 0; v < voices.length; v++) {
        const voice = voices[v];
        const modulation =
          voice.slow * Math.sin(TAU * (slowPhase + voice.phase)) +
          voice.fast * Math.sin(TAU * (fastPhase + voice.phase));
        const delay = clampDelay(
          (voice.delayMs + modulation * voice.modScale * excursion) *
            msToSamples,
        );
        const sample = read(voice.source, delay);
        wetL += sample * voice.gainL * perVoice;
        wetR += sample * voice.gainR * perVoice;
      }

      // Mid/side width, applied to the wet path only: the dry is the anchor
      // and narrowing the effect should not narrow the source.
      const mid = 0.5 * (wetL + wetR);
      const side = 0.5 * (wetL - wetR) * width;
      outL[i] = dryL * (1 - mix) + (mid + side) * mix;
      outR[i] = dryR * (1 - mix) + (mid - side) * mix;
    }
  }

  function read(source: Source, delay: number) {
    if (source === Source.Left) return left.readHermite(delay);
    if (source === Source.Right) return right.readHermite(delay);
    return 0.5 * (left.readHermite(delay) + right.readHermite(delay));
  }

  return { update, compute, reset };
}

export type Chorus = ReturnType<typeof createChorus>;
export type { DelayLine };
