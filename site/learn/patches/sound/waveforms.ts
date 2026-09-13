/*
 * The four shapes, and the one knob that turns a square into a reed.
 *
 * A waveform name is shorthand for a set of harmonics, so stepping through the
 * list is stepping through four harmonic recipes: none above the fundamental,
 * the odd ones falling away fast, all of them at 1/n, the odd ones at 1/n. The
 * width knob is the interesting one, because it does not change the shape's
 * name - it moves the second discontinuity of the pulse, and Reid's rule says
 * a duty cycle of 1:n loses every nth harmonic. That rule is visible: the
 * spectrum rules a line where each hole should be, and the holes are there.
 */

import {
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** High enough that a pulse's holes recur across the whole spectrum. */
const FREQUENCY = 220;
const HOLES = 12;

/** A fixed trim: four waveforms at full scale are painful in headphones. */
const LEVEL = 0.125;

const DEFAULT_WIDTH = 0.5;
const WAVEFORMS = ["Sine", "Triangle", "Sawtooth", "Square"];

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: FREQUENCY,
    width: DEFAULT_WIDTH,
  });
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  // The trim is after the analyser, so the picture is of the oscillator and
  // the level is of the room. `out` is last and at zero, for Play to open.
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [osc, analyser, level],
    exposes: { osc, analyser },
  });
}

export default definePatch({
  id: "sound/waveforms",
  label: "Four waveforms",
  build,
  controls: [
    {
      id: "waveform",
      kind: "select",
      label: "Waveform",
      help: "Four shapes, in order of how many harmonics they carry.",
      param: (s) => s.osc.type,
      options: WAVEFORMS,
      default: PolyblepOscillatorType.Sine,
    },
    {
      id: "width",
      kind: "slider",
      label: "Width",
      help: "The pulse's duty cycle. It does nothing to a sine or a saw.",
      param: (s) => s.osc.width,
      min: 0.05,
      max: 0.95,
      step: 0.01,
      default: DEFAULT_WIDTH,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Harmonics",
      source: (s) => s.analyser,
      // Where the harmonics are *missing*, which is the claim worth checking:
      // harmonic k/width is the one a duty cycle of that width loses. Only the
      // square is a pulse, so for the other three there is nothing to predict
      // and the lines go away.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) =>
          Math.round(s.osc.type.value) === PolyblepOscillatorType.Square
            ? Array.from(
                { length: HOLES },
                (_, k) => (FREQUENCY * (k + 1)) / s.osc.width.value,
              )
            : [],
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
    { kind: "diagram" },
  ],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
        controls: ["waveform", "width"],
      },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [{ from: "osc", to: "out" }],
  },
});
