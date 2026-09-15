/*
 * Imperfection, as four knobs.
 *
 * Part 46 explains why a string machine sounds like an ensemble and a
 * dual-oscillator polysynth does not: it is not the number of oscillators, it
 * is that no two of the players are doing exactly the same thing at exactly the
 * same moment. Reid gets there with detune and beating. The digital version of
 * the same argument is that a perfectly stable oscillator is the unusual object,
 * and a synth that never drifts sounds like a synth that was switched on a
 * second ago.
 *
 * So everything here is a small, aimless amount of wrong. The two oscillators
 * wander in pitch and in level on their own. The filter's corner is moved by an
 * `Lfo` in `Drift` mode - two octaves of gradient noise sampled along the
 * phase, which has a rate and no period, and "a rate and no period" is what
 * "analogue" means in practice. And the delay at the end has aged.
 *
 * `pitchChaos` and `ampChaos` default to 0.5 on the module and are **inaudible
 * at any value while the matching spread is 0**, because the chaos parameter
 * decides how wild the deviation is and the spread decides how far it may
 * reach. A knob that does nothing until a second knob moves is a bad lesson, so
 * one control writes both - the `sound/harmonics` precedent for two statements
 * of one act.
 *
 * No `diagram`: two oscillators into one mixer is two audio chains, and the
 * kit's layout draws them in one row (ticket 10b).
 */

import {
  AnalogDelay,
  AnalogDelayMode,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Svf,
  SvfType,
  WavetableOscillator,
} from "synthlet";
import { definePatch } from "../define";

const FREQUENCY = 110;
/** Cents. Small enough to be one instrument, big enough to beat. */
const DETUNE = 6;
const SUM = 0.4;

const CUTOFF = 1400;
const RESONANCE = 1.2;

const DRIFT_RATE = 0.6;
const DRIFT_DEPTH = 0;

const AGE = 0.3;

const PITCH_CHAOS = 0;
const AMP_CHAOS = 0;
/** Semitones of pitch deviation at full chaos. A quarter tone is plenty. */
const PITCH_REACH = 0.5;
/** How far the level may fall at full chaos. */
const AMP_REACH = 0.6;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const a = WavetableOscillator(ac, {
    frequency: FREQUENCY,
    morph: 0.55,
    pitchChaos: PITCH_CHAOS,
    pitchSpread: 0,
    ampChaos: AMP_CHAOS,
    ampSpread: 0,
  });
  const b = WavetableOscillator(ac, {
    frequency: FREQUENCY,
    detune: DETUNE,
    morph: 0.7,
    pitchChaos: PITCH_CHAOS,
    pitchSpread: 0,
    ampChaos: AMP_CHAOS,
    ampSpread: 0,
  });
  const oscillators = [a, b];
  const sum = Gain.val(ac, SUM);

  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: RESONANCE,
  });

  // `lfo.gain` *is* the depth in hertz, because an `AudioParam` sums its inputs
  // with its own value - `filters/sweep`'s idiom. No amount module, no scaling.
  const drift = Lfo(ac, {
    type: LfoType.Drift,
    frequency: DRIFT_RATE,
    gain: DRIFT_DEPTH,
  });
  drift.connect(filter.frequency);

  const delay = AnalogDelay(ac, {
    mode: AnalogDelayMode.Bbd,
    time: 0.28,
    feedback: 0.25,
    mix: 0.25,
    age: AGE,
    wobble: AGE,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  a.connect(sum);
  b.connect(sum);
  sum.connect(filter).connect(delay);
  delay.connect(analyser).connect(level).connect(out);

  let pitchChaos = PITCH_CHAOS;
  const pitchChaosRef = {
    get value() {
      return pitchChaos;
    },
    set value(next: number) {
      pitchChaos = next;
      for (const osc of oscillators) {
        osc.pitchChaos.value = pitchChaos;
        osc.pitchSpread.value = PITCH_REACH * pitchChaos;
      }
    },
  };

  let ampChaos = AMP_CHAOS;
  const ampChaosRef = {
    get value() {
      return ampChaos;
    },
    set value(next: number) {
      ampChaos = next;
      for (const osc of oscillators) {
        osc.ampChaos.value = ampChaos;
        osc.ampSpread.value = AMP_REACH * ampChaos;
      }
    },
  };

  // One wear knob, as the hardware has: an old machine wobbles *and* has lost
  // its top end, and separating the two here would be offering a choice nobody
  // is asking this lesson for.
  let age = AGE;
  const ageRef = {
    get value() {
      return age;
    },
    set value(next: number) {
      age = next;
      delay.age.value = age;
      delay.wobble.value = age;
    },
  };

  return Compound({
    output: out,
    owns: [a, b, sum, filter, drift, delay, analyser, level],
    exposes: {
      a,
      b,
      sum,
      filter,
      drift,
      delay,
      analyser,
      pitchChaos: pitchChaosRef,
      ampChaos: ampChaosRef,
      age: ageRef,
    },
  });
}

export default definePatch({
  id: "beyond/drift",
  label: "Analogue imperfection",
  build,
  controls: [
    {
      id: "pitchChaos",
      kind: "slider",
      label: "Pitch chaos",
      help: "How badly each oscillator keeps its pitch, cycle by cycle.",
      param: (s) => s.pitchChaos,
      min: 0,
      max: 1,
      step: 0.01,
      default: PITCH_CHAOS,
    },
    {
      id: "ampChaos",
      kind: "slider",
      label: "Level chaos",
      help: "The same wandering, in loudness rather than in pitch.",
      param: (s) => s.ampChaos,
      min: 0,
      max: 1,
      step: 0.01,
      default: AMP_CHAOS,
    },
    {
      id: "driftDepth",
      kind: "slider",
      label: "Drift depth",
      help: "How far the filter's corner wanders. In hertz, either side of it.",
      param: (s) => s.drift.gain,
      min: 0,
      max: 2000,
      unit: "Hz",
      default: DRIFT_DEPTH,
    },
    {
      id: "driftRate",
      kind: "slider",
      label: "Drift rate",
      help: "How fast it wanders. It has a rate and no period, so it never repeats.",
      param: (s) => s.drift.frequency,
      min: 0.05,
      max: 4,
      scale: "log",
      unit: "Hz",
      default: DRIFT_RATE,
    },
    {
      id: "age",
      kind: "slider",
      label: "Age",
      help: "How long the delay at the end has been in service.",
      param: (s) => s.age,
      min: 0,
      max: 1,
      step: 0.01,
      default: AGE,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
