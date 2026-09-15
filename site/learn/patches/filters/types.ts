/*
 * One filter, five responses, and a knob that decides how loud the corner is.
 *
 * `Svf` is one topology read at different taps, which is why a single `type`
 * parameter turns a low-pass into a high-pass into a band-pass into a notch
 * without changing anything else in the chain: the same cutoff, the same Q, the
 * same saw going in. That is the whole argument of Part 6's second step, and it
 * is also the reason the option list below is in the DSP's own order - the
 * select writes the position, so the list *is* `SvfType`.
 */

import {
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
} from "synthlet";
import { definePatch } from "../define";

const FREQUENCY = 110;
const DEFAULT_CUTOFF = 1000;

/** `SvfType`'s first five, which are the five a synthesiser has a switch for. */
const TYPES = ["Bypass", "Low-pass", "Band-pass", "High-pass", "Notch"];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: DEFAULT_CUTOFF,
    Q: Math.SQRT1_2,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(filter).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [osc, filter, analyser, level],
    exposes: { osc, filter, analyser },
  });
}

export default definePatch({
  id: "filters/types",
  label: "Filter types",
  build,
  controls: [
    {
      id: "type",
      kind: "select",
      label: "Type",
      help: "Which end of the spectrum this filter keeps.",
      param: (s) => s.filter.type,
      options: TYPES,
      default: SvfType.LowPass,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "The corner the response turns at, wherever the response turns.",
      param: (s) => s.filter.frequency,
      min: 60,
      max: 16000,
      scale: "log",
      unit: "Hz",
      default: DEFAULT_CUTOFF,
    },
    {
      id: "resonance",
      kind: "slider",
      label: "Resonance",
      help: "How narrow the corner is. Q, on a filter that calls it Q.",
      param: (s) => s.filter.Q,
      min: 0.7,
      max: 20,
      scale: "log",
      default: Math.SQRT1_2,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The cutoff, ruled over the trace: the same line means four different
      // things depending on the switch, which is the point of the page.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => [s.filter.frequency.value],
      },
    },
  ],
});
