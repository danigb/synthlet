import { createDelayLine, type DelayLine } from "./_delay";

/**
 * The two machines. They read the *same* delay line at different tap
 * positions - integer multiples on tape, the MN3011's deliberately irrational
 * ones on BBD - which is the difference in kind that earns the enum.
 */
export enum AnalogDelayMode {
  Tape = 0,
  Bbd = 1,
}

/** Longest delay the lines are sized for, in seconds, unless overridden. */
export const DEFAULT_MAX_TIME = 1.5;

// The transport's inertia: a one-pole towards the target delay, read with
// Hermite interpolation, per Zavalishin & Parker (DAFx-18) and modelled on
// Mutable's `LoopingSamplePlayer`, whose coefficient this is. Because the head
// *travels* to its new position rather than handing over to a second head,
// everything already in the line is resampled on the way - which is the pitch
// bend this package exists for, and exactly what `digital-delay` is built not
// to do.
//
// Scaled by sample rate so the glide takes the same wall-clock time at 44.1
// and 48 kHz: 1 / 5e-5 is 20000 samples, about 450 ms.
const GLIDE_COEFFICIENT = 5e-5;

// Wow and flutter. **The honest handling of a documented gap:** the research
// found no sourced rate or depth for the RE-201, EP-3 or Echorec, and
// studio-deck standards (DIN 0.2%, pro decks ~0.1%) are explicitly not
// applicable - tape echoes are widely described as far worse, but nobody
// quantifies it. So one figure is derived and the rest are labelled.
//
// **Derived.** The Echorec's drum turns at 71 RPM. Wow is once-per-revolution
// eccentricity, so the rotation rate *is* the wow rate: 71/60 = 1.18 Hz.
const WOW_RATE_HZ = 1.2;
// **Physically motivated, not sourced.** Flutter comes from bearing and scrape
// mechanisms an order of magnitude above the drum rate.
const FLUTTER_RATE_HZ = 7;
// **Chosen by ear against reference recordings.** At full depth the wow is
// about 1.5% (26 cents) and the flutter about 0.9% (15 cents).
const WOW_DEPTH_MS = 2;
const FLUTTER_DEPTH_MS = 0.2;
// What `age` alone implies before `wobble` scales it: a machine at `age = 0`
// still has a transport, so the floor is not zero.
const WOBBLE_AGE_FLOOR = 0.35;

// The MN3005: 4096 stages, clocked 10-100 kHz. `delay = stages / (2 x clock)`
// is arithmetically verified against four Panasonic datasheets, so the
// clock - and with it the bandwidth - follows from `time` rather than taste.
const BBD_STAGES = 4096;
const BBD_CLOCK_MIN_HZ = 10000;
const BBD_CLOCK_MAX_HZ = 100000;
// The fixed anti-alias/reconstruction corner, from the datasheet's own test
// jig (20 kHz, -24 dB/oct in and -36 dB/oct out). That is Panasonic's generic
// jig rather than any pedal's design, and the slopes here are one pole each
// rather than four and six - the corner is the load-bearing part.
const BBD_FILTER_HZ = 20000;

// Tape's bandwidth falls with speed through gap loss: the recorded wavelength
// is `speed / frequency`, response collapses once that approaches the head
// gap, and `speed` is `head spacing / time`. So the shape is the same
// `k / time` the BBD derivation produces - but **this constant is modelled by
// analogy, not sourced**: no measured curve was found for any tape echo. At
// 0.15 s it puts the corner at 20 kHz, at 0.3 s at 10 kHz, at 1.5 s at 2 kHz.
const TAPE_GAP_HZ_SECONDS = 3000;
const BANDWIDTH_MIN_HZ = 200;
const BANDWIDTH_MAX_HZ = 20000;

// `age` is four things on one curve, and the curve is a **design choice, not a
// sourced measurement**. Each of the four is independently measurable, which
// is what keeps the composite verifiable rather than vibes.
const AGE_BANDWIDTH = 0.7; // bandwidth multiplier falls to 0.3 at age 1
const AGE_DRIVE = 6; // saturator drive rises from 1 to 7
const AGE_NOISE = 3e-4; // hiss, about -70 dBFS at age 1

// The compander, after Raffel & Smith: 2:1 in, 2:1 out, referred to a level
// where a companded BBD spends most of its time. **The artifact is the point,
// not a defect to minimise** - its audible signature is the time-constant
// mismatch below, which is what makes it pump and smear transients rather than
// merely being quiet. The constants are chosen by ear and labelled as chosen.
const COMPANDER_REF = 0.25;
// Below this the detectors stop tracking, so silence gets a bounded gain
// instead of an unbounded one. It is also where the round trip stops being
// unity, which is the level dependence Tape does not have.
const COMPANDER_FLOOR = 0.01;
const COMPRESS_MS = 8;
const EXPAND_MS = 3;
// Extra drive in BBD mode: the charge on a bucket saturates sooner than tape.
const BBD_DRIVE = 1.5;

// Tap positions, as ratios of `time`.
//
// Tape: the RE-201's heads, whose 1 : 2 : 3 spacing Roland's own RE-202 manual
// confirms (it states 2x/3x/4x for that unit's four heads); the Echorec's drum
// gives 1 : 2 : 3 : 4 by geometry. Integer multiples, so mixing them is
// rhythmic subdivision.
const TAPE_RATIOS = [1, 2, 3];
// BBD: the MN3011's six taps, at stages 396 / 662 / 1194 / 1726 / 2790 / 3328
// read straight off the datasheet. Deliberately irrational, and the datasheet
// says why - mixing them yields "natural reverberation effect".
const BBD_TAP_STAGES = [396, 662, 1194, 1726, 2790, 3328];
const BBD_RATIOS = BBD_TAP_STAGES.map((stage) => stage / BBD_TAP_STAGES[0]);

// Reading closer than this to the write pointer would read samples this block
// has not written yet.
const MIN_DELAY = 2;

// Alternating sign, so it cannot accumulate as DC. Without it a tail decaying
// towards zero eventually runs entirely in denormals, and a loop that never
// stops running never recovers from that.
const DENORMAL = 1e-20;

const TAU = 2 * Math.PI;

/**
 * Mutable's cubic soft clipper. Near-linear for small signals, unity-bounded
 * beyond +/-3, and the reason `feedback` above 1 self-oscillates into a limit
 * cycle instead of clipping.
 */
export const softClip = (x: number) =>
  x < -3 ? -1 : x > 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x);

const clamp = (x: number, low: number, high: number) =>
  x < low ? low : x > high ? high : x;

/** Hermite's own smoothstep, so a tap fades in with zero slope at both ends. */
export const smoothstep = (x: number) =>
  x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/**
 * The BBD's clock, in Hz, for a delay in seconds: `stages / (2 x delay)`,
 * clamped to the MN3005's own 10-100 kHz range.
 *
 * Beyond 204.8 ms the model is extrapolating past the real chip, so the clock
 * is held at its minimum rather than continuing to fall. The alternative is a
 * model that quietly invents physics outside the range it was derived in.
 */
export const bbdClockHz = (time: number) =>
  clamp(
    BBD_STAGES / (2 * Math.max(time, 1e-6)),
    BBD_CLOCK_MIN_HZ,
    BBD_CLOCK_MAX_HZ,
  );

/**
 * BBD bandwidth in Hz: the fixed filter or half the clock, whichever is lower.
 * At 20.48 ms the clock is 100 kHz and the filter dominates; at 204.8 ms the
 * clock is 10 kHz and bandwidth collapses to 5 kHz. That is the "longer delay,
 * darker repeats" relationship, and it falls straight out of the formula.
 */
export const bbdBandwidthHz = (time: number) =>
  Math.min(BBD_FILTER_HZ, bbdClockHz(time) / 2);

/** Tape bandwidth in Hz, by the gap-loss analogy above. */
export const tapeBandwidthHz = (time: number) =>
  clamp(
    TAPE_GAP_HZ_SECONDS / Math.max(time, 1e-6),
    BANDWIDTH_MIN_HZ,
    BANDWIDTH_MAX_HZ,
  );

/**
 * The bandwidth actually used, in Hz: the mode's law, darkened by `age`.
 * Exported so the coupling can be asserted against the derivation rather than
 * only against a trend.
 */
export const bandwidthHz = (time: number, age: number, mode: number) =>
  (1 - AGE_BANDWIDTH * age) *
  (tapeBandwidthHz(time) +
    mode * (bbdBandwidthHz(time) - tapeBandwidthHz(time)));

/** One-pole coefficient for a cutoff in Hz. */
const onePole = (hz: number, sampleRate: number) =>
  1 - Math.exp((-TAU * hz) / sampleRate);

type Channel = {
  line: DelayLine;
  /** Where the head is, gliding towards `target` one sample at a time. */
  delay: number;
  /** Where the head wants to be, recomputed every sample. */
  target: number;
  /** Anti-alias filter, on the way into the line. */
  lpPre: number;
  /** Reconstruction filter, on the way out. */
  lpPost: number;
  /** Stability high-pass on the feedback path. */
  hpFb: number;
  /** Compander detectors. They run in both modes so a mode wipe is not cold. */
  cEnv: number;
  eEnv: number;
};

/**
 * A glide-based echo with tape and bucket-brigade character.
 *
 * Pure: it touches no worklet globals, so the tests drive it directly.
 */
export function createAnalogDelay(
  sampleRate: number,
  maxTime = DEFAULT_MAX_TIME,
) {
  const maxSamples = Math.ceil(maxTime * sampleRate);
  const glideK = GLIDE_COEFFICIENT * (44100 / sampleRate);
  const wowInc = (TAU * WOW_RATE_HZ) / sampleRate;
  const flutterInc = (TAU * FLUTTER_RATE_HZ) / sampleRate;
  const wowDepth = (WOW_DEPTH_MS / 1000) * sampleRate;
  const flutterDepth = (FLUTTER_DEPTH_MS / 1000) * sampleRate;
  const timeConstant = (ms: number) => 1 - Math.exp(-1000 / (ms * sampleRate));
  const compressA = timeConstant(COMPRESS_MS);
  const expandA = timeConstant(EXPAND_MS);

  const channel = (): Channel => ({
    line: createDelayLine(maxSamples),
    delay: MIN_DELAY,
    target: MIN_DELAY,
    lpPre: 0,
    lpPost: 0,
    hpFb: 0,
    cEnv: 0,
    eEnv: 0,
  });

  const left = channel();
  const right = channel();

  // Targets, set by `update` once per block.
  let tTime = 0.3;
  let tFeedback = 0.4;
  let tMix = 0.3;
  let tTaps = 0;
  let tAge = 0.3;
  let tWobble = 0.3;
  let tSpread = 0;
  let tMode = 0;

  // The same values as they actually are right now, ramped towards the targets
  // one sample at a time, for the reason `digital-delay` gives: every
  // parameter is k-rate, so stepping them at block boundaries would put a
  // 344 Hz staircase on anything modulating them.
  let time = tTime;
  let feedback = tFeedback;
  let mix = tMix;
  let taps = tTaps;
  let age = tAge;
  let wobble = tWobble;
  let spread = tSpread;
  let mode = tMode;
  let drive = 1;
  let invDrive = 1;

  // Per-sample scratch, shared by both channels and allocated once.
  const tapeGains = new Float64Array(TAPE_RATIOS.length);
  const bbdGains = new Float64Array(BBD_RATIOS.length);
  let tapeWeight = 1;
  let bbdWeight = 0;
  let excursion = 0;

  let wowPhase = 0;
  let flutterPhase = 0;
  let hiss = 1;
  let denormal = DENORMAL;
  let primed = false;

  const clampDelay = (samples: number) =>
    samples < MIN_DELAY
      ? MIN_DELAY
      : samples > maxSamples
        ? maxSamples
        : samples;

  /**
   * The mode's taps, summed off the *same* line at multiples of the head
   * position. Both tables are read while a mode wipe is in flight and
   * crossfaded by level rather than by position: interpolating a tap from 3x
   * to 8.4x would sweep a read head across half a second of buffer in one
   * block, which is a whoosh, not a wipe. A tap whose gain is zero is not
   * read at all, so the common case - one mode, `taps` low - costs one read.
   *
   * `clampDelay` is what keeps the line sized for `maxTime` rather than for
   * `maxTime x 8.4`: at long `time` settings the later BBD taps fold back onto
   * the line's maximum instead of allocating 12 s of stereo buffer for a case
   * nobody asks for.
   */
  function readTaps(ch: Channel, read: number) {
    let sum = 0;
    if (tapeWeight > 0) {
      for (let k = 0; k < TAPE_RATIOS.length; k++) {
        const gain = tapeGains[k];
        if (gain > 0) {
          sum +=
            tapeWeight *
            gain *
            ch.line.readHermite(clampDelay(read * TAPE_RATIOS[k]));
        }
      }
    }
    if (bbdWeight > 0) {
      for (let k = 0; k < BBD_RATIOS.length; k++) {
        const gain = bbdGains[k];
        if (gain > 0) {
          sum +=
            bbdWeight *
            gain *
            ch.line.readHermite(clampDelay(read * BBD_RATIOS[k]));
        }
      }
    }
    return sum;
  }

  function update(
    time_: number,
    feedback_: number,
    mix_: number,
    taps_: number,
    age_: number,
    wobble_: number,
    spread_: number,
    mode_: number,
  ) {
    tTime = time_;
    tFeedback = feedback_;
    tMix = mix_;
    tTaps = taps_;
    tAge = age_;
    tWobble = wobble_;
    tSpread = spread_;
    tMode = mode_;
  }

  function compute(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ) {
    const n = outL.length;
    if (n === 0) return;

    // The coupling, once per block: `tone` is not a parameter here because
    // bandwidth is *derived* from `time` and `age`. Coefficients are the one
    // thing not ramped per sample - an `exp` per sample is not affordable, and
    // a cutoff moving in 2.9 ms steps is inaudible where a delay position
    // moving in 2.9 ms steps would not be.
    const lpA = onePole(
      clamp(
        bandwidthHz(tTime, tAge, tMode),
        BANDWIDTH_MIN_HZ,
        0.45 * sampleRate,
      ),
      sampleRate,
    );
    // Clouds' rule, as in `digital-delay`: the corner rises with feedback
    // because that is when a build-up has time to happen.
    const fbA = onePole(20 + 100 * tFeedback * tFeedback, sampleRate);
    const tDrive = 1 + AGE_DRIVE * tAge + tMode * BBD_DRIVE;

    if (!primed) {
      // First block: adopt the constructed settings rather than gliding to
      // them from the descriptor defaults - which, at 450 ms, would be audible.
      primed = true;
      time = tTime;
      feedback = tFeedback;
      mix = tMix;
      taps = tTaps;
      age = tAge;
      wobble = tWobble;
      spread = tSpread;
      mode = tMode;
      drive = tDrive;
      invDrive = 1 / tDrive;
      left.delay = left.target = clampDelay(time * sampleRate);
      right.delay = right.target = clampDelay(
        Math.min(time * (1 + spread), maxTime) * sampleRate,
      );
    }

    const step = 1 / n;
    const dTime = (tTime - time) * step;
    const dFeedback = (tFeedback - feedback) * step;
    const dMix = (tMix - mix) * step;
    const dTaps = (tTaps - taps) * step;
    const dAge = (tAge - age) * step;
    const dWobble = (tWobble - wobble) * step;
    const dSpread = (tSpread - spread) * step;
    const dMode = (tMode - mode) * step;
    const dDrive = (tDrive - drive) * step;
    const dInvDrive = (1 / tDrive - invDrive) * step;

    for (let i = 0; i < n; i++) {
      time += dTime;
      feedback += dFeedback;
      mix += dMix;
      taps += dTaps;
      age += dAge;
      wobble += dWobble;
      spread += dSpread;
      mode += dMode;
      drive += dDrive;
      invDrive += dInvDrive;

      // The tap envelope: the first tap is always at unity and tap k of N
      // fades in with a smoothstep over its own slice of the parameter, so
      // `taps = 1` has every tap at full and the sum is monotonic by
      // construction.
      let tapeSum = 1;
      tapeGains[0] = 1;
      for (let k = 1; k < TAPE_RATIOS.length; k++) {
        const gain = smoothstep(taps * (TAPE_RATIOS.length - 1) - (k - 1));
        tapeGains[k] = gain;
        tapeSum += gain;
      }
      let bbdSum = 1;
      bbdGains[0] = 1;
      for (let k = 1; k < BBD_RATIOS.length; k++) {
        const gain = smoothstep(taps * (BBD_RATIOS.length - 1) - (k - 1));
        bbdGains[k] = gain;
        bbdSum += gain;
      }
      tapeWeight = 1 - mode;
      bbdWeight = mode;
      // The head mixer's total gain. The feedback path takes the tap mix
      // *normalised* by it, so `taps` is decay-neutral and does not secretly
      // double as a feedback control; the wet output takes the unnormalised
      // mix, so selecting more heads is louder, as on the machine.
      const gainSum = tapeWeight * tapeSum + bbdWeight * bbdSum;
      const norm = 1 / gainSum;

      wowPhase += wowInc;
      if (wowPhase > TAU) wowPhase -= TAU;
      flutterPhase += flutterInc;
      if (flutterPhase > TAU) flutterPhase -= TAU;
      // Wow and flutter are modulations of delay *length*, so in a glide
      // architecture they bend pitch. That is the entire point.
      const depth = wobble * (WOBBLE_AGE_FLOOR + (1 - WOBBLE_AGE_FLOOR) * age);
      excursion =
        depth *
        (wowDepth * Math.sin(wowPhase) + flutterDepth * Math.sin(flutterPhase));

      // One hiss source for both channels rather than two: independent noise
      // would be more literal, but it would cost the exact null that makes
      // `spread = 0` mono-compatible.
      //
      // `Math.imul` rather than the usual `(x * a + c) & mask`: at 31 bits
      // that product is 2.4e18, past the 2^53 where doubles are still exact,
      // and the rounding collapses the sequence to a period of 10466 samples -
      // a 4.2 Hz buzz rather than hiss.
      hiss = (Math.imul(hiss, 1664525) + 1013904223) | 0;
      const noise = age > 0 ? age * age * AGE_NOISE * (hiss / 2147483648) : 0;

      left.target = clampDelay(time * sampleRate);
      // `spread` is a ratio rather than a fixed offset, so it stays musical at
      // every `time`: two machines, lightly apart.
      right.target = clampDelay(
        Math.min(time * (1 + spread), maxTime) * sampleRate,
      );

      denormal = -denormal;
      const dryL = inL[i];
      const dryR = inR[i];
      outL[i] =
        dryL + mix * (voice(left, dryL, norm, gainSum, lpA, fbA, noise) - dryL);
      outR[i] =
        dryR +
        mix * (voice(right, dryR, norm, gainSum, lpA, fbA, noise) - dryR);
    }
  }

  /**
   * One machine, one sample. The chain is the BBD's, after Raffel & Smith,
   * with the compander blended in by `mode` so Tape is an exact bypass of it:
   *
   *   read taps -> reconstruction filter -> expander -> wet, and feedback
   *   dry + feedback -> saturator -> compressor -> anti-alias filter -> line
   *
   * The filters are on the way in and out of the line rather than only in the
   * loop, which is why the *first* repeat is already darkened by `time`.
   */
  function voice(
    ch: Channel,
    dry: number,
    norm: number,
    gainSum: number,
    lpA: number,
    fbA: number,
    noise: number,
  ) {
    // The head travels to its target rather than handing over to a second
    // head: everything already in the line is resampled on the way, and the
    // pitch bends.
    ch.delay += (ch.target - ch.delay) * glideK;
    const mixed = readTaps(ch, ch.delay + excursion) * norm;

    ch.lpPost += lpA * (mixed - ch.lpPost);
    ch.eEnv += expandA * (Math.abs(ch.lpPost) - ch.eEnv);
    const expanded =
      (ch.eEnv < COMPANDER_FLOOR ? COMPANDER_FLOOR : ch.eEnv) / COMPANDER_REF;
    const wet = ch.lpPost + mode * (ch.lpPost * expanded - ch.lpPost);

    ch.hpFb += fbA * (wet - ch.hpFb);
    let x = dry + feedback * (wet - ch.hpFb) + noise + denormal;
    // Time-domain saturation on every pass, unconditionally: tape saturates
    // when it records, so repeats degrade rather than merely attenuating.
    x = softClip(x * drive) * invDrive;
    ch.cEnv += compressA * (Math.abs(x) - ch.cEnv);
    const compressed = Math.sqrt(
      COMPANDER_REF / (ch.cEnv < COMPANDER_FLOOR ? COMPANDER_FLOOR : ch.cEnv),
    );
    x = x + mode * (x * compressed - x);
    ch.lpPre += lpA * (x - ch.lpPre);
    ch.line.write(ch.lpPre);

    return wet * gainSum;
  }

  function reset() {
    for (const ch of [left, right]) {
      ch.line.reset();
      ch.lpPre = ch.lpPost = ch.hpFb = ch.cEnv = ch.eEnv = 0;
    }
    wowPhase = flutterPhase = 0;
    hiss = 1;
    primed = false;
  }

  return { update, compute, reset };
}
