/*
 * One sawtooth, one cutoff, three ways down from it.
 *
 * The lesson is the *rate* of attenuation, so everything else is held still:
 * the three filters are built at once, they share a single cutoff, their
 * resonance is out of the way, and the switch is a crossfade between gains
 * rather than a rebuild - which is the docs' `PolyblepExample` pattern, and the
 * only way to compare two filters without a gap in the middle of the
 * comparison.
 *
 * Two of the three are 12 dB per octave and one is 24, and the two twelves are
 * not the same filter: a state variable filter and half a Moog ladder fall at
 * the same rate from corners that sit in different places. That is Part 5's
 * last sentence arriving early.
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

/** Low enough that there are harmonics all the way up to filter. */
const FREQUENCY = 110;
const DEFAULT_CUTOFF = 1000;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

/** Long enough to cover a switch, short enough to hear as no gap at all. */
const CROSSFADE = 0.01;

/**
 * The three, named by the thing the lesson is about.
 *
 * `Svf` is two poles solved rather than delayed; `MOOG_HALF_LADDER` is two
 * one-pole sections with a feedback path; `MOOG_LADDER` is four. The first two
 * fall at 12 dB per octave and the third at 24.
 */
const SLOPES = [
  "Svf — 12 dB/oct",
  "Moog half ladder — 12 dB/oct",
  "Moog ladder — 24 dB/oct",
];

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });

  // One cutoff, fanned out. A knob per filter would be three knobs that have to
  // agree, and the moment they did not the comparison would be of two settings
  // rather than of two filters.
  const cutoff = Param.input(ac, DEFAULT_CUTOFF);

  const svf = Svf(ac, {
    type: SvfType.LowPass,
    frequency: cutoff,
    Q: Math.SQRT1_2,
  });
  const half = VirtualAnalogFilter(ac, {
    type: VirtualAnalogFilter.MOOG_HALF_LADDER,
    frequency: cutoff,
    resonance: 0,
  });
  const ladder = VirtualAnalogFilter(ac, {
    type: VirtualAnalogFilter.MOOG_LADDER,
    frequency: cutoff,
    resonance: 0,
  });

  // One gain per arm, one of them open. All three filters run all the time, so
  // switching is a ramp on two numbers and the filters never lose their state.
  const gains = [Gain.val(ac, 1), Gain.val(ac, 0), Gain.val(ac, 0)];
  const mix = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(svf).connect(gains[0]).connect(mix);
  osc.connect(half).connect(gains[1]).connect(mix);
  osc.connect(ladder).connect(gains[2]).connect(mix);
  mix.connect(analyser).connect(level).connect(out);

  let chosen = 0;
  const slope = {
    get value() {
      return chosen;
    },
    set value(next: number) {
      chosen = Math.min(gains.length - 1, Math.max(0, Math.round(next)));
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
    owns: [osc, cutoff, svf, half, ladder, ...gains, mix, analyser, level],
    exposes: { osc, cutoff, svf, half, ladder, mix, analyser, slope },
  });
}

export default definePatch({
  id: "filters/slope",
  label: "Cutoff and slope",
  build,
  controls: [
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "Where the corner is. The signal is already 3 dB down here.",
      param: (s) => s.cutoff.input,
      min: 60,
      max: 16000,
      scale: "log",
      unit: "Hz",
      default: DEFAULT_CUTOFF,
    },
    {
      id: "slope",
      kind: "select",
      label: "Slope",
      help: "How fast the filter falls away above the corner.",
      param: (s) => s.slope,
      options: SLOPES,
      default: 0,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The cutoff you asked for, drawn over the cutoff you got. A corner is
      // defined as the point where the signal is 3 dB down, so the trace is
      // already bending *before* the line - and where each filter's knee really
      // sits, against the same line, is the next-but-one lesson.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => [s.cutoff.input.value],
      },
    },
  ],
});
