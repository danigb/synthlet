/*
 * What happens when you ask an amplifier for more than it has.
 *
 * Reid's Figure 8: a VCA told to produce sixteen volts when it can only produce
 * ten. The tops of the waveform square off for as long as the demand is beyond
 * it, the sound turns harsh, and the harmonics that appear were never in the
 * signal - the amplifier made them.
 *
 * `ClipAmp` is that, deliberately: drive into a saturating curve, then a trim
 * on the way out. Its curve is `tanh`, which rounds the corners instead of
 * cutting them square, and rounded corners are most of what people mean when
 * they call a circuit warm.
 */

import {
  ClipAmp,
  ClipType,
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const LEVEL = 0.125;
/** A sine, so that every harmonic in the picture was put there by the curve. */
const FREQUENCY = 220;

const DRIVE = 0.5;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: FREQUENCY,
  });
  const clip = ClipAmp(ac, {
    type: ClipType.Tanh,
    preGain: DRIVE,
    postGain: 1,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(clip).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [osc, clip, analyser, level],
    exposes: { osc, clip, analyser },
  });
}

export default definePatch({
  id: "amplifiers/clip",
  label: "Drive",
  build,
  controls: [
    {
      id: "drive",
      kind: "slider",
      label: "Drive",
      help: "How hard the signal is pushed into the curve, before it.",
      param: (s) => s.clip.preGain,
      min: 0.25,
      max: 10,
      scale: "log",
      default: DRIVE,
    },
    {
      id: "output",
      kind: "slider",
      label: "Output",
      help: "The trim after the curve. Drive changes the shape; this does not.",
      param: (s) => s.clip.postGain,
      min: -24,
      max: 0,
      scale: "db",
      default: 1,
    },
  ],
  views: [
    // The waveform, not a contour: the flattening top *is* the lesson, and it
    // is a few cycles wide.
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
    {
      kind: "spectrum",
      label: "Harmonics",
      source: (s) => s.analyser,
      // Where the odd harmonics of a symmetrically clipped sine land: the
      // third, the fifth, the seventh. The even ones stay empty, because the
      // curve treats the top of the wave exactly as it treats the bottom.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: [1, 3, 5, 7, 9].map((n) => FREQUENCY * n),
      },
    },
  ],
});
