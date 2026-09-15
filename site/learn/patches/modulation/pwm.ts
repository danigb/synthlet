/*
 * A pulse wave whose width will not sit still.
 *
 * Part 10's law is that a pulse of duty cycle 1:n has a sawtooth's harmonics
 * with every nth one missing, so moving the width does not change the loudness
 * or the pitch - it changes *which harmonics exist*. That is a claim about a
 * picture, so the picture is the point of this patch: the marks are the
 * harmonic series and the reader watches gaps open and close in it.
 *
 * The fundamental is 440 Hz rather than a bass note because the spectrum's
 * frequency axis is linear to Nyquist: at 110 Hz the first twelve harmonics
 * would be crowded into the leftmost thirty pixels and the gaps would be
 * invisible.
 */

import {
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const FREQUENCY = 440;
/** How many harmonics the marks predict. Twelve reaches 5.3 kHz. */
const PARTIALS = 12;

const WIDTH = 0.5;
const DEPTH = 0.2;
const RATE = 0.6;
/** Trimmed to about -18 dB. A square at full scale is painful. */
const LEVEL = 0.12;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: FREQUENCY,
    width: WIDTH,
  });

  // Bipolar, at unit depth; the amount below scales it. `width` clamps itself
  // to 0…1, and the intrinsic value is where the modulation is centred - so
  // 0.5 ± 0.45 is the whole of the usable travel and neither end sticks.
  const lfo = Lfo(ac, { type: LfoType.Triangle, frequency: RATE, gain: 1 });
  const depth = Param.mul(ac, lfo, DEPTH);
  depth.connect(osc.width);

  const level = Gain.val(ac, LEVEL);

  // Two analysers on one point, because the two pictures want two time scales.
  // The scope wants a few cycles of a 440 Hz wave (512 samples is five); the
  // spectrum wants enough of them to resolve a harmonic series.
  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 512;
  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const out = Gain.val(ac, 0);
  osc.connect(level);
  level.connect(scopeAnalyser);
  level.connect(analyser).connect(out);

  return Compound({
    output: out,
    owns: [osc, lfo, depth, level, scopeAnalyser, analyser],
    exposes: { osc, lfo, depth, analyser, scopeAnalyser },
  });
}

export default definePatch({
  id: "modulation/pwm",
  label: "Pulse width modulation",
  build,
  controls: [
    {
      id: "width",
      kind: "slider",
      label: "Width",
      help: "The duty cycle the modulation is centred on. 0.5 is a square.",
      param: (s) => s.osc.width,
      min: 0.05,
      max: 0.95,
      step: 0.01,
      default: WIDTH,
    },
    {
      id: "depth",
      kind: "slider",
      label: "PWM depth",
      help: "How far either side of that the width swings.",
      param: (s) => s.depth.gain,
      min: 0,
      max: 0.45,
      step: 0.01,
      default: DEPTH,
    },
    {
      id: "rate",
      kind: "slider",
      label: "PWM rate",
      help: "How fast it swings. Slow is the string-machine shimmer.",
      param: (s) => s.lfo.frequency,
      min: 0.05,
      max: 10,
      scale: "log",
      unit: "Hz",
      default: RATE,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Harmonics",
      source: (s) => s.analyser,
      // The prediction is the whole harmonic series; what the width decides is
      // which of these lines has a peak standing under it.
      options: {
        marks: () =>
          Array.from(
            { length: PARTIALS },
            (_, index) => FREQUENCY * (index + 1),
          ),
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
