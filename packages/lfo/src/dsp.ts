/**
 * The shapes, as a specification.
 *
 * An LFO waveform has no analytic reference to check it against - a filter has
 * a transfer function, but a shape *is* its definition. So the table below is
 * load-bearing in a way a comment is not: `dsp.test.ts` asserts every row of
 * it, and the package README and the docs page repeat it. If a generator below
 * changes, the table is what says whether the change was the fix or the bug.
 *
 * ## The phase convention: φ=0 is zero-and-rising
 *
 * Every continuous shape crosses zero going up at φ=0. `Sine` always did;
 * `Triangle`, the ramps and the `Exp*` family did not, and were realigned.
 *
 * The reason is that φ=0 is about to become observable. Nothing could reset
 * the phase, so an `Lfo` free-ran from context time zero and reached φ=0 at an
 * arbitrary moment; once `sync` lands, φ=0 is *the value every note-on snaps
 * the LFO to*. A `Triangle` vibrato that starts at −1 would begin every note at
 * maximum downward pitch deviation. A modulation source's zero point is no
 * modulation.
 *
 * `Square` and `Impulse` are the two exceptions, and cannot be otherwise:
 * a square has no zero crossing, and the impulse's single sample *is* the
 * cycle boundary.
 *
 * | shape            | φ=0  | φ=¼     | φ=½ | φ=¾     | discontinuity |
 * | ---------------- | ---- | ------- | --- | ------- | ------------- |
 * | `None`           | 0    | 0       | 0   | 0       | -             |
 * | `Sine`           | 0    | +1      | 0   | −1      | -             |
 * | `Triangle`       | 0    | +1      | 0   | −1      | -             |
 * | `RampUp`         | 0    | +0.5    | −1  | −0.5    | φ=½           |
 * | `RampDown`       | 0    | −0.5    | +1  | +0.5    | φ=½           |
 * | `Square`         | +1   | +1      | −1  | −1      | φ=0, φ=½      |
 * | `ExpRampUp`      | 0    | +0.1246 | −1  | −0.1246 | φ=½           |
 * | `ExpRampDown`    | 0    | −0.1246 | +1  | +0.1246 | φ=½           |
 * | `ExpTriangle`    | 0    | +1      | 0   | −1      | -             |
 * | `RandSampleHold` | held | held    | held | held   | φ=0           |
 * | `Impulse`        | 1    | 0       | 0   | 0       | φ=0           |
 *
 * ## The `Exp*` family is the linear family, more curved
 *
 * `ExpTriangle` used to be `bipolar(concave(|bipolar(φ)|))`, which peaks where
 * `Triangle` troughs: it was phase-inverted against the shape it is named
 * after, and had been since the package was written. It is now `curve()` of
 * the triangle - the MMA concave transform applied to the magnitude with the
 * sign preserved - so each `Exp*` shape has the same zeros, the same peaks and
 * the same sign as its linear partner everywhere, and only bends between them.
 *
 * That is what `dsp.test.ts` asserts, and it asserts it without naming a
 * coefficient: `|Exp(φ)| ≤ |Linear(φ)|` with matching signs. The 5/12
 * correction factor is one legitimate fixed opinion about how much to bend;
 * pinning it in a test would make the opinion untouchable.
 */
import { createGateDetector } from "./_gate";

export enum LfoType {
  None = 0,
  Sine = 1,
  Triangle = 2,
  RampUp = 3,
  RampDown = 4,
  Square = 5,
  ExpRampUp = 6,
  ExpRampDown = 7,
  ExpTriangle = 8,
  RandSampleHold = 9,
  Impulse = 10,
}

/**
 * Convert unipolar [0, 1] to bipolar [-1, 1]
 * @param value unipolar value
 * @returns bipolar value
 */
export function bipolar(value: number): number {
  return 2.0 * value - 1.0;
}

/**
 * Create a concave/convex transform function using the correction factor.
 *
 * This is the MMA concave transform as presented by Will Pirkle (Tritone
 * Systems) in "Designing Software Synthesizer Plug-Ins in C++" and SynthLab,
 * including the 5.0/12.0 correction coefficient.
 *
 * @see https://www.willpirkle.com/
 * @param coeff correction factor
 */
function concaveTransform(coeff = 5.0 / 12.0) {
  // concave/convex transform correction factor at x = 0
  const zero = Math.pow(10.0, -1.0 / coeff);
  // concave/convex transform correction factor
  const antiLog = coeff * Math.log10(1.0 + zero);
  // concave/convex transform scaling factor
  const scale = 1.0 / (-coeff * Math.log10(zero) + antiLog);

  // Perform the MMA concave transform on a unipolar value
  return (xn: number) => {
    if (xn >= 1.0) return 1.0;
    if (xn <= 0.0) return 0.0;
    const value = -coeff * scale * Math.log10(1.0 - xn + zero) + antiLog;
    return Math.max(0.0, Math.min(1.0, value));
  };
}

function createSampleAndHold(): Gen {
  let value = rand();
  return (phase, nextPhase) => {
    const out = value;
    if (nextPhase < phase) value = rand();
    return out;
  };
}

function createImpulse(): Gen {
  let active = true;

  return (phase, nextPhase) => {
    const out = active ? 1 : 0;
    active = nextPhase < phase;
    return out;
  };
}

type Gen = (phase: number, prev: number) => number;

// Shared, and allowed to be: `concaveTransform()` closes over three constants
// it computes with three logarithms, and returns a pure function of its
// argument. The rule this file follows is that *stateful* generators are
// per-instance - see `createGenerators` - not that nothing lives at module
// scope.
const concave = concaveTransform();

/** Fractional part, for a phase rotated past the end of its cycle. */
const wrap = (phase: number) => phase - Math.floor(phase);

/**
 * The concave transform applied to a bipolar value's magnitude, sign kept.
 *
 * This is what makes an `Exp*` shape the same shape as its linear partner: it
 * fixes the zeros and the peaks and bends only what is between them.
 */
const curve = (value: number) =>
  value < 0 ? -concave(-value) : concave(value);

const none: Gen = () => 0;
const sine: Gen = (phase) => Math.sin(phase * 2 * Math.PI);
// A quarter cycle later than the naive `1 - 2|bipolar(φ)|`, which starts at its
// trough. See the phase convention above.
const triangle: Gen = (phase) =>
  1.0 - 2.0 * Math.abs(bipolar(wrap(phase + 0.25)));
// Half a cycle later than the naive `bipolar(φ)`: the ordinary saw, zero at
// φ=0, peaking just before its jump at φ=½.
const rampUp: Gen = (phase) => bipolar(wrap(phase + 0.5));
const rampDown: Gen = (phase, prev) => -rampUp(phase, prev);
// `<` and not `<=`, so the two halves are exactly [0, ½) and [½, 1): equal
// duty, and a mean of exactly zero over an even-length cycle.
const square: Gen = (phase) => (phase < 0.5 ? +1.0 : -1.0);
const rand = () => bipolar(Math.random());
const expRampUp: Gen = (phase, prev) => curve(rampUp(phase, prev));
const expRampDown: Gen = (phase, prev) => -expRampUp(phase, prev);
const expTriangle: Gen = (phase, prev) => curve(triangle(phase, prev));

/**
 * A fresh generator bank, indexed by `LfoType`.
 *
 * The nine stateless shapes are shared, because they are pure functions of the
 * phase. `RandSampleHold` and `Impulse` are built per call, because they are
 * not: an `AudioWorkletGlobalScope` evaluates this module **once**, so a
 * generator constructed here at module scope would be one variable shared by
 * every `Lfo` of that type in the context. It was, and it showed - a fresh
 * sample-and-hold returned another instance's value, and a second `Impulse`
 * emitted nothing at all because the first had consumed the flag.
 *
 * Also the seam the tests read a shape through: a generator answers at an exact
 * phase, where a render only answers on its own grid.
 */
export function createGenerators(): Gen[] {
  return [
    none,
    sine,
    triangle,
    rampUp,
    rampDown,
    square,
    expRampUp,
    expRampDown,
    expTriangle,
    createSampleAndHold(),
    createImpulse(),
  ];
}

/**
 * The initial phase, normalised into `[0, 1)`.
 *
 * `"random"` draws once, here, at construction - which is the whole point of
 * the option: two `Lfo`s at 0.3 Hz built from the same factory are otherwise
 * the *same signal*, and the only way to separate them was to detune one.
 *
 * A number is taken modulo 1, so `1.25` and `-0.75` both mean 0.25. Anything
 * that is neither - a NaN, an infinity, an absent option - is 0, the phase this
 * package has always started at, so an unset `phase` changes nothing. The
 * comparison rather than `isFinite` is deliberate: every comparison against a
 * NaN is false, so a NaN falls through to 0 rather than seeding a phase nothing
 * recovers from. Copied from `polyblep-oscillator/src/dsp.ts`, which settled
 * this shape for the library.
 */
function initialPhase(phase: number | "random" | undefined): number {
  if (phase === "random") return Math.random();
  const wrapped = typeof phase === "number" ? phase - Math.floor(phase) : 0;
  return wrapped >= 0 && wrapped < 1 ? wrapped : 0;
}

/**
 * `ln(100)`: the ramp's own definition of "done".
 *
 * A one-pole never arrives, so a duration has to name a fraction. This library
 * says a time parameter is **how long the move takes**, and takes 99% as the
 * move - so `attack` seconds is `attack * sampleRate` steps to 0.99, which
 * makes the coefficient `1 - exp(-LN100 / (attack * sampleRate))`.
 *
 * rune06 takes the other convention: its `tau = slider * 1.5` is a time
 * constant, 63.2% at tau. The two differ by exactly this factor, so a Juno-6
 * with its delay slider at maximum is `attack: 6.91`.
 */
const LN100 = Math.log(100);

type Params = {
  type: number[];
  frequency: ArrayLike<number>;
  gain: number[];
  offset: number[];
  sync: ArrayLike<number>;
  gate: ArrayLike<number>;
  delay: number[];
  attack: number[];
};

export function createLfo(
  sampleRate: number,
  audioRate: boolean,
  startPhase?: number | "random",
) {
  const dt = 1 / sampleRate;
  const generators = createGenerators();

  /**
   * Where the phase starts, and where a `sync` edge restarts it.
   *
   * One value, two jobs, because they are the same thing. Fixed at
   * construction: an `AudioParam` would imply it meant something continuously,
   * and it is a one-time initial condition.
   */
  const phaseStart = initialPhase(startPhase);

  // Two detectors, not one. `sync` and `gate` are separate edges with separate
  // memory, and sharing a detector would make a `sync` pulse eat a `gate` one.
  const detectSync = createGateDetector();
  const detectGate = createGateDetector();

  // Params
  let $type = 1;
  let $gain = 1;
  let $offset = 0;
  let $delay = -1;
  let $attack = -1;

  // State
  let gen: Gen = generators[1] ?? none;
  let phase = phaseStart;

  /**
   * The depth envelope: hold at zero for `delay`, ramp to full over `attack`,
   * then stay. `out = gen(phase) * amp * gain + offset`.
   *
   * The most common thing an LFO does is fade in - vibrato that arrives a
   * moment after the note rather than on it - and it is the one feature a
   * Juno-6 LFO needs that this package did not have. It is *not* an `AdEnv`
   * through a `GainNode`: an AD decays where this stays, retriggers on every
   * edge where this ignores legato, and cannot freeze.
   *
   * `running` starts true, so an LFO whose `gate` is never connected fades in
   * once from construction and stays at full depth. That is a deliberate
   * departure from rune06, whose LFO starts silent because a `Synth` always
   * drives it; a standalone node has no such guarantee, and "constructed with
   * `attack: 2` and never heard from again" is not a behaviour to ship.
   */
  let enveloped = false;
  let amp = 0;
  let held = 0;
  let running = true;
  let holdLength = 0;
  let coefficient = 1;

  function read(params: Params) {
    if (params.type[0] !== $type) {
      $type = params.type[0];
      gen = generators[Math.floor($type)] ?? none;
    }
    $offset = params.offset[0];
    $gain = params.gain[0];

    if (params.delay[0] !== $delay) {
      $delay = params.delay[0];
      holdLength = Math.round($delay * sampleRate);
    }
    if (params.attack[0] !== $attack) {
      $attack = params.attack[0];
      // `attack: 0` is an instant jump, not a division by zero.
      coefficient =
        $attack > 0 ? 1 - Math.exp(-LN100 / ($attack * sampleRate)) : 1;
    }
    // Decided here rather than per sample: with both at zero there is no
    // envelope, `amp` is exactly 1, and every patch written before this
    // parameter existed renders bit-identically.
    enveloped = $delay + $attack > 0;
    if (!enveloped) amp = 1;
  }

  /** One step of the depth envelope, given this sample's gate value. */
  function advanceDepth(gate: number) {
    const edge = detectGate(gate);
    if (edge === true) {
      // A note after silence restarts the fade.
      amp = 0;
      held = 0;
      running = true;
    } else if (edge === false) {
      // A release **freezes** it rather than resetting it, so the next note
      // continues from where this one left off.
      running = false;
    }
    if (running) {
      if (held < holdLength) held++;
      else amp += coefficient * (1 - amp);
    }
    return amp;
  }

  function generateControlRate(output: Float32Array, params: Params) {
    read(params);

    // The edge is still detected per sample - a gate held high across a whole
    // block must fire once, not once per block - but the reset it causes lands
    // on the block boundary, which is what "control rate" means.
    const sync = params.sync;
    let reset = false;
    for (let i = 0; i < sync.length; i++) {
      if (detectSync(sync[i]) === true) reset = true;
    }
    if (reset) phase = phaseStart;

    // One envelope step per block, from the whole block's gate: same rule as
    // the reset above, and the same reason.
    if (enveloped) {
      const gate = params.gate;
      for (let i = 0; i < gate.length; i++) advanceDepth(gate[i]);
    }

    // This generator writes one value per block, which is what it is for.
    // rate-ok: block-constant by construction
    let nextPhase = phase + output.length * dt * params.frequency[0];
    if (nextPhase >= 1) {
      nextPhase -= 1;
    } else if (nextPhase < 0) {
      nextPhase += 1;
    }
    const value = gen(phase, nextPhase) * amp * $gain + $offset;
    output.fill(value);
    phase = nextPhase;
  }

  // `read()` runs once per block and the shaping parameters are k-rate, so the
  // generator and the two scalars are fixed for the whole block: hoisting them
  // turns 128 closure-variable reads and 128 indirect loads into a handful.
  // Measured at 34% of this function on node 24 (`benchmarks/lfo-rate/`), which
  // is why it is written this way and not the obvious way.
  //
  // `frequency` is a-rate, so the increment joins them **conditionally**: an
  // a-rate parameter arrives as either one value or one per sample, and Chrome
  // hands length 1 both for an unconnected parameter and for a connected
  // constant. So the branch is taken once per block, the unmodulated path keeps
  // the hoisted increment and is bit-identical to what it was, and only a
  // genuinely varying rate pays per sample.
  function generateAudioRate(output: Float32Array, params: Params) {
    read(params);
    const generate = gen;
    const gain = $gain;
    const offset = $offset;
    const length = output.length;
    const frequency = params.frequency;
    const fRate = frequency.length > 1;
    const increment = fRate ? 0 : dt * frequency[0];
    // The house a-rate idiom, hoisted once per block: an a-rate parameter
    // arrives as either one value or one per sample, and the length-1 case is
    // the common one. `scripts/_worklet.ts` has the reasoning and
    // `scripts/check-param-rates.mjs` enforces it.
    const sync = params.sync;
    const syncRate = sync.length > 1;
    const gate = params.gate;
    const gateRate = gate.length > 1;
    // One hoisted, perfectly predicted branch rather than a second copy of this
    // loop: duplicating it to save the test would duplicate the arithmetic
    // `dsp.test.ts` asserts the waveform specification against.
    const fade = enveloped;
    let current = phase;

    for (let i = 0; i < length; i++) {
      // The reset lands on this sample, not between it and the last one: an
      // LFO does not need the sub-sample crossing instant that the two
      // oscillators interpolate, because 2.9 ms is nothing against a 5 Hz
      // cycle. Deliberate, not forgotten - see `params.ts`.
      if (detectSync(syncRate ? sync[i] : sync[0]) === true) {
        current = phaseStart;
      }
      if (fade) advanceDepth(gateRate ? gate[i] : gate[0]);
      let nextPhase = current + (fRate ? dt * frequency[i] : increment);
      if (nextPhase >= 1) {
        nextPhase -= 1;
      } else if (nextPhase < 0) {
        // The other half of a bipolar `frequency`: a negative increment runs
        // the phase backwards, and it has to come back round at 0.
        nextPhase += 1;
      }
      output[i] = generate(current, nextPhase) * amp * gain + offset;
      current = nextPhase;
    }

    phase = current;
  }

  return audioRate ? generateAudioRate : generateControlRate;
}
