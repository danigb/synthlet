import { createDelayLine, type DelayLine } from "./_delay";

/** Longest delay the lines are sized for, in seconds, unless overridden. */
export const DEFAULT_MAX_TIME = 2;

// How long a read head takes to hand over to its replacement. 20 ms is long
// enough that the two heads' contents average rather than butt together, and
// short enough that a `time` sweep still tracks: the target moves on during
// the fade, so a continuous sweep is a run of back-to-back handovers rather
// than one long smear.
export const CROSSFADE_MS = 20;

// `mod`'s rate. Fixed, and documented, because it is the vibrato/chorus/flange
// excursion rather than a general-purpose LFO - anything else is an `Lfo` into
// a `Param` on `time`, which is a different (and also useful) effect.
export const MOD_RATE_HZ = 0.7;

// Peak excursion at `mod = 1`. 3 ms at 0.7 Hz is about +/-23 cents, which is a
// musical vibrato rather than a warble, and large enough to measure.
export const MOD_DEPTH_MS = 3;

// Least time between one handover finishing and the next starting. Without it
// a `time` sweep is a continuous crossfade: two heads are always live, always
// separated by whatever distance the target covered during the fade, and the
// output is their comb. Worst when that separation is near half a period of
// the signal, which a slow sweep hits squarely. With a gap the heads are
// single for most of the sweep and the pitch through it is the real one - and
// it costs nothing on a one-off `time` change, where no fade has just run.
const FADE_GAP_MS = 100;

// A target this far from the current head, in samples, is a new delay time and
// gets a crossfade; anything closer is ramped. The threshold is deliberately
// about one sample: ramping is what bends pitch, so the ramp exists only to
// settle sub-sample residue, never to travel.
const RETARGET_SAMPLES = 1;

// Fastest the ramp may move the head, in samples per sample. 1/512 is a
// resampling ratio of 0.998, about 3.4 cents - below the threshold of hearing
// for a pitch change, and the reason a `time` change of any real size has to
// go through the crossfade instead.
const RAMP_SLEW = 1 / 512;

// Reading closer than this to the write pointer would read samples this block
// has not written yet. `time`'s minimum of 0.2 ms is 8.8 samples at 44.1 kHz,
// so this only ever bites on a badly clamped input.
const MIN_DELAY = 2;

// Dattorro's input diffusers, at 44.1 kHz: two short mutually-prime allpasses
// per channel, in the loop rather than on the input, so diffusion accumulates
// generation over generation the way `tone` does.
const AP1_SAMPLES = 142;
const AP2_SAMPLES = 379;
const AP1_COEFFICIENT = 0.75;
const AP2_COEFFICIENT = 0.625;
const AP_MOD_SAMPLES = 12;

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

/** One-pole coefficient for a cutoff in Hz. */
const onePole = (hz: number, sampleRate: number) =>
  1 - Math.exp((-TAU * hz) / sampleRate);

type Channel = {
  line: DelayLine;
  ap1: DelayLine;
  ap2: DelayLine;
  /** Active read head, in samples. */
  delay: number;
  /** The head being retired, frozen for the length of the crossfade. */
  old: number;
  /** Crossfade progress; 1 means no crossfade is running. */
  fade: number;
  /** Where the head wants to be, recomputed every sample. */
  target: number;
  /** Samples since the last crossfade finished. */
  since: number;
  /** Filter states: tilt low side, tilt high side, stability high-pass. */
  lp: number;
  hpTilt: number;
  hpFb: number;
};

/**
 * A stereo feedback delay: two lines, a rotation cross-feed matrix, and a
 * feedback path that filters, diffuses and saturates.
 *
 * Pure: it touches no worklet globals, so the tests drive it directly.
 */
export function createDigitalDelay(
  sampleRate: number,
  maxTime = DEFAULT_MAX_TIME,
) {
  const maxSamples = Math.ceil(maxTime * sampleRate);
  const fadeInc =
    1 / Math.max(1, Math.round((CROSSFADE_MS / 1000) * sampleRate));
  const fadeGap = Math.round((FADE_GAP_MS / 1000) * sampleRate);
  const modInc = (TAU * MOD_RATE_HZ) / sampleRate;
  const modDepth = (MOD_DEPTH_MS / 1000) * sampleRate;

  const scale = sampleRate / 44100;
  const ap1Len = AP1_SAMPLES * scale;
  const ap2Len = AP2_SAMPLES * scale;
  const apModDepth = AP_MOD_SAMPLES * scale;
  const apMax = Math.ceil(ap2Len + apModDepth);

  const channel = (): Channel => ({
    line: createDelayLine(maxSamples),
    ap1: createDelayLine(apMax),
    ap2: createDelayLine(apMax),
    delay: MIN_DELAY,
    old: MIN_DELAY,
    fade: 1,
    target: MIN_DELAY,
    since: 1e9,
    lp: 0,
    hpTilt: 0,
    hpFb: 0,
  });

  const left = channel();
  const right = channel();

  // Targets, set by `update` once per block.
  let tTime = 0.25;
  let tFeedback = 0.4;
  let tMix = 0.3;
  let tTone = 0;
  let tMod = 0;
  let tSpread = 0;
  let tCross = 0;
  let tDiffuse = 0;

  // The same values as they actually are right now, ramped towards the targets
  // one sample at a time. `time` is k-rate like every parameter in the
  // library, so stepping these at block boundaries would put a 344 Hz staircase
  // on anything modulating them.
  let time = tTime;
  let feedback = tFeedback;
  let mix = tMix;
  let mod = tMod;
  let spread = tSpread;
  let diffuse = tDiffuse;
  let lpMix = 0;
  let hpMix = 0;
  let cosine = 1;
  let sine = 0;
  let inCos = 1;
  let inSin = 0;

  let modPhase = 0;
  let denormal = DENORMAL;
  let primed = false;

  const clampDelay = (samples: number) =>
    samples < MIN_DELAY
      ? MIN_DELAY
      : samples > maxSamples
        ? maxSamples
        : samples;

  /**
   * Moves the head one sample towards its target: a crossfade for a real time
   * change, a slew for sub-sample residue, and nothing at all while a
   * crossfade is already in flight.
   */
  function advance(ch: Channel) {
    if (ch.fade < 1) return;
    ch.since++;
    const distance = ch.target - ch.delay;
    if (
      ch.since >= fadeGap &&
      (distance > RETARGET_SAMPLES || distance < -RETARGET_SAMPLES)
    ) {
      ch.old = ch.delay;
      ch.delay = ch.target;
      ch.fade = 0;
      ch.since = 0;
    } else {
      ch.delay +=
        distance > RAMP_SLEW
          ? RAMP_SLEW
          : distance < -RAMP_SLEW
            ? -RAMP_SLEW
            : distance;
    }
  }

  /**
   * The line, read at the head plus `excursion`. `excursion` moves the pointer
   * *within* the head, which is what bends pitch - as against moving the
   * target, which starts a crossfade and preserves it.
   */
  function readHead(ch: Channel, excursion: number) {
    const fresh = ch.line.readHermite(clampDelay(ch.delay + excursion));
    if (ch.fade >= 1) return fresh;
    const retiring = ch.line.readHermite(clampDelay(ch.old + excursion));
    const gain = 0.5 - 0.5 * Math.cos(Math.PI * ch.fade);
    ch.fade += fadeInc;
    return retiring + (fresh - retiring) * gain;
  }

  /**
   * The three things every serious feedback loop has, in order: a tilt so
   * repeats darken or thin generation over generation, a high-pass whose
   * corner rises with feedback so sub-bass cannot pile up, and a saturator so
   * the loop cannot run away. Only the first is a tone control; the other two
   * are what make high feedback musical rather than a hazard.
   */
  function loop(ch: Channel, x: number, lpA: number, hpA: number, fbA: number) {
    ch.lp += lpA * (x - ch.lp);
    const tilted = x + lpMix * (ch.lp - x);
    ch.hpTilt += hpA * (tilted - ch.hpTilt);
    const toned = tilted - hpMix * ch.hpTilt;
    ch.hpFb += fbA * (toned - ch.hpFb);
    return toned - ch.hpFb;
  }

  /**
   * Two Schroeder allpasses, blended in by `diffuse`. They run at every
   * setting, so a sweep never starts from a cold buffer, but at `diffuse = 0`
   * the blend returns `x` untouched: the parameter costs nothing when unused.
   */
  function scatter(ch: Channel, x: number, m1: number, m2: number) {
    const a = ch.ap1.allpass(x, ap1Len + m1, AP1_COEFFICIENT);
    const b = ch.ap2.allpass(a, ap2Len + m2, AP2_COEFFICIENT);
    return x + diffuse * (b - x);
  }

  function update(
    time_: number,
    feedback_: number,
    mix_: number,
    tone_: number,
    mod_: number,
    spread_: number,
    cross_: number,
    diffuse_: number,
  ) {
    tTime = time_;
    tFeedback = feedback_;
    tMix = mix_;
    tTone = tone_;
    tMod = mod_;
    tSpread = spread_;
    tCross = cross_;
    tDiffuse = diffuse_;
  }

  function compute(
    inL: Float32Array,
    inR: Float32Array,
    outL: Float32Array,
    outR: Float32Array,
  ) {
    const n = outL.length;
    if (n === 0) return;

    // `tone` is a tilt made of two one-poles whose contribution is the
    // parameter itself, so 0 is an exact bypass rather than an almost-bypass:
    // at `tone = 0` the loop filter is not in the signal path at all.
    const lowSide = tTone < 0 ? -tTone : 0;
    const highSide = tTone > 0 ? tTone : 0;
    const lpA = onePole(18000 * Math.pow(700 / 18000, lowSide), sampleRate);
    const hpA = onePole(20 * Math.pow(1200 / 20, highSide), sampleRate);
    // Clouds' rule: the corner rises with feedback because that is when a
    // build-up has time to happen. Always on - this is stability, not tone.
    const fbA = onePole(20 + 100 * tFeedback * tFeedback, sampleRate);

    // The cross-feed matrix is a rotation, not the symmetric `[[a, b], [b, a]]`
    // form. Symmetric is orthogonal only at its endpoints - `MtM = I` needs
    // both `a^2 + b^2 = 1` and `ab = 0` - so every intermediate setting would
    // change the loop gain and `cross` would secretly double as a feedback
    // control. The rotation is orthogonal for every angle, which is why the
    // measured decay time is invariant as `cross` sweeps.
    //
    // The dry signal enters the lines through the *half* angle of the same
    // rotation. That is what makes `cross = 1` a ping-pong rather than a
    // channel swap: with a mono source and both lines reading the same time,
    // a 90-degree feedback rotation alone moves energy L->R->L every loop
    // while leaving both channels equally loud at all times. Injecting at 45
    // degrees puts the source entirely in one line, and the loop's rotation
    // then hands it to the other - repeats alternate. Being a rotation too, it
    // adds no level of its own, and at `cross = 0` it is the identity, so the
    // mono-compatibility guarantee is untouched.
    const theta = tCross * Math.PI * 0.5;
    const tCos = Math.cos(theta);
    const tSin = Math.sin(theta);
    const tInCos = Math.cos(theta * 0.5);
    const tInSin = Math.sin(theta * 0.5);

    if (!primed) {
      // First block: adopt the constructed settings rather than ramping to
      // them from the descriptor defaults.
      primed = true;
      time = tTime;
      feedback = tFeedback;
      mix = tMix;
      mod = tMod;
      spread = tSpread;
      diffuse = tDiffuse;
      lpMix = lowSide;
      hpMix = highSide;
      cosine = tCos;
      sine = tSin;
      inCos = tInCos;
      inSin = tInSin;
      left.delay = left.target = clampDelay(time * sampleRate);
      right.delay = right.target = clampDelay(
        Math.min(time * (1 + spread), maxTime) * sampleRate,
      );
    }

    const step = 1 / n;
    const dTime = (tTime - time) * step;
    const dFeedback = (tFeedback - feedback) * step;
    const dMix = (tMix - mix) * step;
    const dMod = (tMod - mod) * step;
    const dSpread = (tSpread - spread) * step;
    const dDiffuse = (tDiffuse - diffuse) * step;
    const dLpMix = (lowSide - lpMix) * step;
    const dHpMix = (highSide - hpMix) * step;
    const dCos = (tCos - cosine) * step;
    const dSin = (tSin - sine) * step;
    const dInCos = (tInCos - inCos) * step;
    const dInSin = (tInSin - inSin) * step;

    for (let i = 0; i < n; i++) {
      time += dTime;
      feedback += dFeedback;
      mix += dMix;
      mod += dMod;
      spread += dSpread;
      diffuse += dDiffuse;
      lpMix += dLpMix;
      hpMix += dHpMix;
      cosine += dCos;
      sine += dSin;
      inCos += dInCos;
      inSin += dInSin;

      left.target = clampDelay(time * sampleRate);
      // `spread` is a ratio rather than a fixed offset, so it stays musical at
      // every `time`: small values are a Haas offset, 1 is the classic
      // dual-delay two-against-one.
      right.target = clampDelay(
        Math.min(time * (1 + spread), maxTime) * sampleRate,
      );

      modPhase += modInc;
      if (modPhase > TAU) modPhase -= TAU;

      let excursion = 0;
      let apMod1 = 0;
      let apMod2 = 0;
      if (mod > 0) {
        const s = Math.sin(modPhase);
        excursion = mod * modDepth * s;
        if (diffuse > 0) {
          const depth = mod * diffuse * apModDepth;
          apMod1 = depth * s;
          apMod2 = depth * Math.cos(modPhase);
        }
      }

      advance(left);
      advance(right);

      const wetL = readHead(left, excursion);
      const wetR = readHead(right, excursion);

      let fbL = cosine * wetL - sine * wetR;
      let fbR = sine * wetL + cosine * wetR;

      fbL = loop(left, fbL, lpA, hpA, fbA);
      fbR = loop(right, fbR, lpA, hpA, fbA);
      fbL = scatter(left, fbL, apMod1, apMod2);
      fbR = scatter(right, fbR, apMod1, apMod2);

      denormal = -denormal;
      // Clouds' blend rather than a bare `softClip`: at `feedback = 0` the
      // line stores the input exactly, and the saturator arrives in proportion
      // to how much of a loop there actually is.
      const blend = feedback < 1 ? feedback : 1;
      const dryL = inL[i];
      const dryR = inR[i];
      const injL = inCos * dryL - inSin * dryR;
      const injR = inSin * dryL + inCos * dryR;
      const sumL = injL + feedback * fbL + denormal;
      const sumR = injR + feedback * fbR + denormal;
      left.line.write(sumL + blend * (softClip(sumL) - sumL));
      right.line.write(sumR + blend * (softClip(sumR) - sumR));

      // The wet tap is the raw line read: the loop filter filters the loop,
      // not the output, which is what makes repeats darken generation over
      // generation instead of the whole effect being dull.
      outL[i] = dryL + mix * (wetL - dryL);
      outR[i] = dryR + mix * (wetR - dryR);
    }
  }

  function reset() {
    for (const ch of [left, right]) {
      ch.line.reset();
      ch.ap1.reset();
      ch.ap2.reset();
      ch.fade = 1;
      ch.since = 1e9;
      ch.lp = ch.hpTilt = ch.hpFb = 0;
    }
    modPhase = 0;
    primed = false;
  }

  return { update, compute, reset };
}
