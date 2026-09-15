/*
 * A gain with a signal on it, which is the whole of what a VCA is.
 *
 * Reid's Figure 7: a tone generator, an amplifier, and a low-frequency
 * oscillator wired to the amplifier's control input. Turning the volume knob
 * back and forth a few times a second is tremolo, and an LFO is that hand.
 *
 * There is no module called `Vca` in this library and there does not need to
 * be: `GainNode.gain` is an `AudioParam`, an `AudioParam` accepts a connection,
 * and a connection is a control voltage. The box below is a native node the
 * browser has always had.
 */

import {
  Compound,
  Gain,
  Lfo,
  LfoType,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const LEVEL = 0.125;
const FREQUENCY = 220;

const RATE = 5;
const DEPTH = 0.5;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });

  // The VCA. Its own gain sits at 1 and the LFO is summed onto that, so the
  // depth below is how far the level swings either side of where it was.
  const vca = Gain.val(ac, 1);

  const lfo = Lfo(ac, { type: LfoType.Sine, frequency: RATE });
  // And the amount knob - which is a gain in a control path, and therefore a
  // second VCA hiding in plain sight. The next lesson is about that.
  const depth = Gain.val(ac, DEPTH);
  lfo.connect(depth).connect(vca.gain);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(vca).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [osc, vca, lfo, depth, analyser, level],
    exposes: { osc, vca, lfo, depth, analyser },
  });
}

export default definePatch({
  id: "amplifiers/vca",
  label: "Tremolo",
  build,
  controls: [
    {
      id: "depth",
      kind: "slider",
      label: "Depth",
      help: "How far the LFO swings the gain either side of its own level.",
      param: (s) => s.depth.gain,
      min: 0,
      max: 1,
      default: DEPTH,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Rate",
      help: "How fast. Above about twenty a second it stops being tremolo.",
      param: (s) => s.lfo.frequency,
      min: 0.1,
      max: 20,
      scale: "log",
      unit: "Hz",
      default: RATE,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 3 },
    },
    { kind: "diagram" },
  ],
  /*
   * `depth` is an exposes key as well as a control id, so that knob ties itself
   * to the LFO's box; `rate` writes `lfo.frequency`, whose key is `lfo`, so it
   * is named. Both sit on the controller because both are the modulation, not
   * the amplifier.
   */
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      { id: "vca", label: "Gain", kind: "modifier", exposedAs: "vca" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "lfo",
        label: "Lfo",
        kind: "controller",
        exposedAs: ["lfo", "depth"],
        controls: ["rate"],
      },
    ],
    edges: [
      { from: "osc", to: "vca" },
      { from: "vca", to: "out" },
      { from: "lfo", to: "vca", param: "gain" },
    ],
  },
});
