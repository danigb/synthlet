/*
 * Every frequency at once, and a filter to take most of them away.
 *
 * A drum skin is a two-dimensional oscillator, so its overtones are not whole
 * multiples of anything and there are far more of them than a string's. No
 * waveform in the list before this one can do that; a noise generator can,
 * because it is all of them. The filter is here on the same page rather than
 * the next one because noise on its own is a hiss and noise with a corner on
 * it is a snare, and the distance between those two is one knob.
 */

import { Compound, Gain, Noise, NoiseType, Svf, SvfType } from "synthlet";
import { definePatch } from "../define";

/** Noise at full scale is painful; the docs' own example settles near this. */
const LEVEL = 0.125;

const CUTOFF = 2000;
const NOISE_TYPES = ["White", "Pink"];

function build(ac: AudioContext) {
  const noise = Noise(ac, { type: NoiseType.White });
  // Bypass, not low-pass: the filter is in the chain from the start and does
  // nothing until the switch turns it on. `SvfType.ByPass` is 0 and
  // `SvfType.LowPass` is 1, so the switch writes the type itself.
  const filter = Svf(ac, {
    type: SvfType.ByPass,
    frequency: CUTOFF,
    Q: 0.7,
  });
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  noise.connect(filter).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [noise, filter, analyser, level],
    exposes: { noise, filter, analyser },
  });
}

export default definePatch({
  id: "sound/noise",
  label: "Noise",
  build,
  controls: [
    {
      id: "type",
      kind: "select",
      label: "Type",
      help: "White is flat. Pink falls away at three decibels an octave.",
      param: (s) => s.noise.type,
      options: NOISE_TYPES,
      default: NoiseType.White,
    },
    {
      id: "filter",
      kind: "toggle",
      label: "Filter",
      help: "Off is a bypass; on is a low-pass at the cutoff below.",
      param: (s) => s.filter.type,
      default: SvfType.ByPass,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "Everything above this comes off, once the filter is on.",
      param: (s) => s.filter.frequency,
      min: 100,
      max: 12000,
      scale: "log",
      unit: "Hz",
      default: CUTOFF,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // No marks: the point of this picture is that there is nothing to
      // predict. A scope is left out for the same reason - the waveform of
      // noise is a grey smear, and it says less than the spectrum does.
      options: { minDb: -100, maxDb: -10 },
    },
    { kind: "diagram" },
  ],
  diagram: {
    nodes: [
      {
        id: "noise",
        label: "Noise",
        kind: "source",
        exposedAs: "noise",
        controls: ["type"],
      },
      // `filter` is an exposes key and a control id, so the switch ties itself
      // to this box; `cutoff` writes `filter.frequency` and has to be named.
      {
        id: "filter",
        label: "Svf",
        kind: "modifier",
        exposedAs: "filter",
        controls: ["cutoff"],
      },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [
      { from: "noise", to: "filter" },
      { from: "filter", to: "out" },
    ],
  },
});
