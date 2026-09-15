/*
 * Ten filters, one sawtooth, one cutoff, and a list.
 *
 * Reid ends Part 5 by asserting that every analogue filter design sounds
 * different from every other, and then has to leave it there, because a
 * magazine cannot hand you a Moog and a Korg and an Oberheim on the same page.
 * This is that paragraph as a select box: nine circuits from
 * `VirtualAnalogFilter` and the library's other filter for contrast, all built,
 * all fed from the same oscillator, all asked for the same corner.
 *
 * They are asked for the same corner and none of them puts it in the same
 * place. Ask for 1000 Hz and the Moog ladder measures 907, the half ladder
 * 1163, the Korg 35 870, the diode ladder 502 and the Oberheim 1542 - every
 * one of those numbers asserted in that package's own test suite. The mark on
 * the spectrum is the number you asked for, so the distance between the line
 * and the knee is the character of the circuit, drawn.
 *
 * Every filter runs all the time and the switch is a crossfade between gains,
 * the docs' `PolyblepExample` pattern: a model change during a held note is a
 * 10 ms ramp on two numbers rather than a rebuild, so there is no gap to hear
 * and no click to hear it in.
 */

import {
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  VirtualAnalogFilter,
} from "synthlet";
import { definePatch } from "../define";

/** Low enough that there are harmonics all the way up for each one to take. */
const FREQUENCY = 110;
const DEFAULT_CUTOFF = 1000;
const DEFAULT_RESONANCE = 0.7;
/** 1 is clean. It is a real nonlinearity on seven of the nine. */
const DEFAULT_DRIVE = 1;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

/** Long enough to cover a switch, short enough to hear as no gap at all. */
const CROSSFADE = 0.01;

/**
 * `VirtualAnalogFilter`'s nine, in the factory's own order.
 *
 * The kit's select writes the option's *position* into the param, so the list
 * below is the enum: position 0 is `MOOG_LADDER` because `MOOG_LADDER` is 0. A
 * lookup table would be a second statement of the same fact, and a second
 * statement is the one that drifts.
 */
const VAF_TYPES = [
  VirtualAnalogFilter.MOOG_LADDER,
  VirtualAnalogFilter.MOOG_HALF_LADDER,
  VirtualAnalogFilter.KORG35_LPF,
  VirtualAnalogFilter.KORG35_HPF,
  VirtualAnalogFilter.DIODE_LADDER,
  VirtualAnalogFilter.OBERHEIM_LPF,
  VirtualAnalogFilter.OBERHEIM_HPF,
  VirtualAnalogFilter.OBERHEIM_BPF,
  VirtualAnalogFilter.OBERHEIM_BSF,
];

/** The nine, then the tenth: the library's clean digital filter, for contrast. */
const MODELS = [
  "Moog ladder — 4-pole",
  "Moog half ladder — 2-pole",
  "Korg 35 low-pass",
  "Korg 35 high-pass",
  "Diode ladder",
  "Oberheim low-pass",
  "Oberheim high-pass",
  "Oberheim band-pass",
  "Oberheim band-stop",
  "Svf — the digital one",
];

/** The `Svf`'s Q at the two ends of the one resonance knob. */
const Q_MIN = Math.SQRT1_2;
const Q_MAX = 20;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });

  // Three knobs, ten filters. A node connected to a parameter in a factory's
  // options replaces that parameter's value, so one `Param` per quantity fans
  // out to every model and the comparison cannot become a comparison of two
  // settings.
  const cutoff = Param.input(ac, DEFAULT_CUTOFF);
  const resonance = Param.input(ac, DEFAULT_RESONANCE);
  const drive = Param.input(ac, DEFAULT_DRIVE);

  // The same knob in the other filter's units: `VirtualAnalogFilter` calls it
  // resonance and takes 0 to 1, `Svf` calls it Q and takes 0.025 to 40. That
  // arithmetic is what `Param.lin` is for, and it is why the reader sees one
  // control rather than two that have to be kept in step.
  const q = Param.lin(ac, resonance, Q_MIN, Q_MAX);

  const vafs = VAF_TYPES.map((type) =>
    VirtualAnalogFilter(ac, { type, frequency: cutoff, resonance, drive }),
  );
  const svf = Svf(ac, { type: SvfType.LowPass, frequency: cutoff, Q: q });

  const arms = [...vafs, svf];
  // One gain per arm, the first one open.
  const gains = arms.map((_, index) => Gain.val(ac, index === 0 ? 1 : 0));
  const mix = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  // Last and at zero; the analyser is before it, so a silent widget draws.
  const out = Gain.val(ac, 0);

  arms.forEach((filter, index) => {
    osc.connect(filter).connect(gains[index]).connect(mix);
  });
  mix.connect(analyser).connect(level).connect(out);

  let chosen = 0;
  const model = {
    get value() {
      return chosen;
    },
    set value(next: number) {
      chosen = Math.min(arms.length - 1, Math.max(0, Math.round(next)));
      gains.forEach((gain, index) => {
        gain.gain.setTargetAtTime(
          index === chosen ? 1 : 0,
          ac.currentTime,
          CROSSFADE,
        );
      });
    },
  };

  return Compound({
    output: out,
    owns: [
      osc,
      cutoff,
      resonance,
      drive,
      q,
      ...arms,
      ...gains,
      mix,
      analyser,
      level,
    ],
    exposes: {
      osc,
      cutoff,
      resonance,
      drive,
      q,
      svf,
      mix,
      analyser,
      model,
    },
  });
}

export default definePatch({
  id: "filters/shootout",
  label: "Every filter sounds different",
  build,
  controls: [
    {
      id: "model",
      kind: "select",
      label: "Model",
      help: "Nine analogue circuits, and one that is not pretending to be one.",
      param: (s) => s.model,
      options: MODELS,
      default: 0,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "What every model is asked for. None of them puts it in the same place.",
      param: (s) => s.cutoff.input,
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
      help: "Feedback around the corner, in each circuit's own units.",
      param: (s) => s.resonance.input,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_RESONANCE,
    },
    {
      id: "drive",
      kind: "slider",
      label: "Drive",
      help: "How hard the input hits the nonlinearity. Seven of the nine have one.",
      param: (s) => s.drive.input,
      min: 0,
      max: 20,
      step: 0.1,
      default: DEFAULT_DRIVE,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The corner that was asked for, ruled over the corner that arrived.
      // This one line is the page: the trace under it moves when the model
      // changes and the line does not.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => [s.cutoff.input.value],
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
