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
 * How long a mode change takes to cross-fade, in milliseconds.
 *
 * A mode change is a topology change - a different voice count on different
 * base delays through a different output matrix - so it cannot be stepped.
 * `rune06` fades out, switches at the fade envelope's zero and fades back in,
 * with `FADE_MS = 5.0`, and this is that.
 */
const FADE_MS = 5;

/**
 * A voicing: five tables and an output matrix.
 *
 * Every candidate topology in the survey - Juno, Solina, Dimension D, white
 * chorus, the Hammond scanner - is the same computation. N taps on one line
 * per channel, read with `readHermite`, moved by an LFO bank, combined by an
 * output matrix. What separates one from another is voice count, LFO rate set,
 * phase offsets, output matrix and wet EQ, and that is data rather than code.
 * It is why "which algorithm" was the wrong question and why three of them fit
 * inside `vision.md`'s `< ~10 KB` inline-processor budget.
 */
export type Voicing = {
  voices: readonly Voice[];
  /** Multiplier on `rate` for the slow accumulator. */
  slowMul: number;
  /** Multiplier on `rate` for the fast accumulator. See `FAST_MULTIPLIER`. */
  fastMul: number;
  /** This voicing's own excursion ceiling in ms, the other half of the clamp. */
  maxDepthMs: number;
  /** What `Chorus(ac, { mode })` should set the other four knobs to. */
  defaults: { rate: number; depth: number; mix: number; width: number };
};

const voice = (
  delayMs: number,
  phase: number,
  source: Source,
  gainL: number,
  gainR: number,
  slow = 1,
  fast = 0,
  modScale = 1,
): Voice => ({ delayMs, modScale, phase, slow, fast, source, gainL, gainR });

/**
 * Plaits' `Ensemble` mixes its two accumulators `slow * 160 + fast * 16`
 * samples, with the comment `// Max deviation: 176`. Those are the
 * proportions; normalising them to 1 keeps `depth` meaning the same thing in
 * every voicing.
 */
const ENSEMBLE_SLOW = 160 / 176;
const ENSEMBLE_FAST = 16 / 176;

/**
 * The three voicings, with every number's source beside it. A number with no
 * citation is a number nobody can re-derive.
 *
 * The output matrix is the pair of gains on each voice, and it is where
 * `DIMENSION` differs from `JUNO`: the same two antiphase taps, combined as a
 * difference instead of one to each channel. That is the whole of the SDD-320
 * trick, and it is the argument for both voicings fitting rather than the
 * argument against one of them.
 */
/**
 * **No voicing has feedback, and that was measured rather than assumed.**
 *
 * Dattorro's Table 6 offers "white chorus" - blend 0.7071, feedforward 1.0,
 * feedback 0.7071 from a *fixed* tap at the nominal centre, deliberately not
 * modulated because "we prefer not to feed back a modulating signal because
 * the modulation induces pitch change". The claim is that the circuit then
 * approximates an allpass and the comb colouration of the summed troughs
 * cancels.
 *
 * Measured here as peak-to-peak magnitude ripple over 100 Hz - 10 kHz, from
 * the impulse response of one voice frozen at 3 ms + 2 ms (LTI, so the
 * response is exact; rectangular FFT, because a window would zero the
 * impulse):
 *
 * | structure | ripple |
 * | --- | --- |
 * | plain feedforward, blend 1.0 / ff 0.7071 | **15.31 dB** |
 * | white chorus, fixed feedback tap | 30.62 dB |
 * | white chorus, feedback from the moving tap | 22.63 dB |
 *
 * Every variant measures *more* coloured than the plain feedforward path, not
 * less, so it is dropped. Two caveats worth stating: Dattorro's argument is
 * about the summed response under modulation rather than one frozen tap, so
 * this is evidence against carrying it here rather than a refutation of his
 * design; and the real Juno has no feedback path at all, which is the other
 * reason the answer came out this way.
 */
export const VOICINGS: readonly Voicing[] = [
  {
    // JUNO. Two lines modulated in antiphase from one LFO, one to each
    // channel, dry summed. `rune06`'s CE-2 model centres at
    // `CENTER_DELAY_MS = 3.0`; the Juno-60's three modes are 0.5 / 0.8 / 1 Hz
    // and are reachable through `rate` rather than needing their own rows.
    // 3 ms +/- 2 ms sits inside Dattorro Table 7's chorus range (1-30 ms,
    // nominal 5) rather than his doubling range (10-100), which is where the
    // engine this replaces had put its defaults.
    // Phases at a quarter and three quarters rather than 0 and a half: still
    // exactly antiphase, but it puts the two voices at opposite ends of their
    // travel when the LFO is stopped, so `rate: 0` is a static two-tap comb
    // rather than both voices landing on the same sample.
    voices: [
      voice(3, 0.25, Source.Left, 1, 0),
      voice(3, 0.75, Source.Right, 0, 1),
    ],
    slowMul: 1,
    fastMul: FAST_MULTIPLIER,
    maxDepthMs: 2,
    defaults: { rate: 0.5, depth: 0.6, mix: 0.5, width: 1 },
  },
  {
    // ENSEMBLE. Three taps 120 degrees apart on a dual-rate LFO pair - the
    // Solina and Roland string-machine construction, and the voicing that is
    // unreachable from JUNO at any knob setting because it needs a third voice
    // and incommensurate rates. Plaits' `Ensemble` is the known-good set of
    // numbers: a 192-sample base at 48 kHz (4.0 ms), three phases at exact
    // thirds, deviation `slow * 160 + fast * 16` with a maximum of 176 samples
    // (3.67 ms). The centre voice reads the mid of both lines so a stereo
    // source stays centred rather than leaning on whichever line it was given.
    voices: [
      voice(4, 0, Source.Left, 1, 0, ENSEMBLE_SLOW, ENSEMBLE_FAST),
      voice(
        4,
        1 / 3,
        Source.Mid,
        Math.SQRT1_2,
        Math.SQRT1_2,
        ENSEMBLE_SLOW,
        ENSEMBLE_FAST,
      ),
      voice(4, 2 / 3, Source.Right, 0, 1, ENSEMBLE_SLOW, ENSEMBLE_FAST),
    ],
    slowMul: 1,
    fastMul: FAST_MULTIPLIER,
    maxDepthMs: 3.67,
    // 0.75 Hz is Plaits' slow accumulator: `phase_1_ += 67289` is
    // `67289/2^32 * 48000 = 0.752 Hz`. The frequency travels between sample
    // rates; the increment does not.
    defaults: { rate: 0.75, depth: 0.7, mix: 0.5, width: 1 },
  },
  {
    // DIMENSION. Antiphase like JUNO, but the stereo output is formed as a
    // difference: `L = d0 - d1`, `R = d1 - d0`. The common-mode pitch
    // modulation cancels perceptually while the differential spatial motion
    // survives - chorus without the vibrato, which is what makes it usable on
    // sustained pads and on a bus where JUNO's wobble becomes seasickness.
    // SDD-320 numbers: 7.5-10 ms base, +/- 1.5-2.5 ms, 0.25 or 0.5 Hz.
    voices: [
      voice(8.5, 0.25, Source.Left, 1, -1),
      voice(8.5, 0.75, Source.Right, -1, 1),
    ],
    slowMul: 1,
    fastMul: FAST_MULTIPLIER,
    maxDepthMs: 2.5,
    defaults: { rate: 0.5, depth: 0.8, mix: 0.5, width: 1 },
  },
];

/** What each voicing sets the other four knobs to. */
export const CHORUS_MODE_DEFAULTS = VOICINGS.map((v) => v.defaults);

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

  // Targets, set by `update` once per block.
  let tMode = ChorusMode.Juno;
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

  // `mode` is structural, so it is resolved here rather than in the inner
  // loop: the loop branches on nothing `mode` decides.
  let mode = ChorusMode.Juno;
  let voicing = VOICINGS[mode];
  // 1 fully in, 0 fully out. A mode change fades the wet path out, swaps the
  // table at the envelope's zero, and fades back in.
  let fade = 1;
  let fadeDirection = 0;
  const fadeStep = 1 / Math.max(1, Math.round((FADE_MS / 1000) * sampleRate));

  // The LFO bank: two accumulators, and a voice reads whichever of them its
  // weights ask for. `phase += inc; if (phase >= 1) phase -= 1` is the house
  // idiom, and `Math.sin` rather than a wavetable is deliberate - the table is
  // exactly what broke in the engine this replaces. `fillTable` there ignored
  // its `fn` argument, so both of Faust's `os.oscp` tables held a cosine and
  // the per-voice phase offsets did not compute: `table[0]` read 1.000000
  // where `sin` gives 0.
  let slowPhase = 0;
  let fastPhase = 0;

  function update(
    modeIndex: number,
    rateHz: number,
    depthAmount: number,
    mixAmount: number,
    widthAmount: number,
  ) {
    const rounded = Math.round(modeIndex);
    tMode = rounded >= 0 && rounded < VOICINGS.length ? rounded : mode;
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
    mode = tMode;
    voicing = VOICINGS[mode];
    fade = 1;
    fadeDirection = 0;
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
      mode = tMode;
      voicing = VOICINGS[mode];
    }

    // Structural, and resolved once per block. The wet path is already at zero
    // when the swap happens, so the topology never changes under a live
    // signal.
    if (tMode !== mode && fadeDirection === 0) fadeDirection = -1;
    if (fadeDirection < 0 && fade <= 0) {
      mode = tMode;
      voicing = VOICINGS[mode];
      fadeDirection = 1;
    }

    const step = 1 / n;
    const dRate = (tRate - rate) * step;
    const dDepth = (tDepth - depth) * step;
    const dMix = (tMix - mix) * step;
    const dWidth = (tWidth - width) * step;
    const voices = voicing.voices;
    const perVoice = 1 / voices.length;
    const slowMul = voicing.slowMul;
    const fastMul = voicing.fastMul;
    const maxDepthMs = voicing.maxDepthMs;

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

      if (fadeDirection < 0) {
        fade -= fadeStep;
        if (fade < 0) fade = 0;
      } else if (fadeDirection > 0) {
        fade += fadeStep;
        if (fade >= 1) {
          fade = 1;
          fadeDirection = 0;
        }
      }

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
      const wet = mix * fade;
      outL[i] = dryL * (1 - mix) + (mid + side) * wet;
      outR[i] = dryR * (1 - mix) + (mid - side) * wet;
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
