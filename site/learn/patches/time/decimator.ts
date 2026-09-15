/*
 * Sample and hold, run fast enough to be an analogue-to-digital converter.
 *
 * Part 17 gets to digital audio by pointing out that a sample-and-hold running
 * at 44,100 Hz is the front half of one. Everything that makes sampling
 * strange is already in the module from chapter 5 - it is only the rate that
 * changed - and this page is Reid's Figures 15, 17 and 18 as three numbers you
 * can type in.
 *
 * Sample a 10 kHz sine at 13,333 Hz and the difference between the two,
 * 3,333 Hz, appears in the output as a tone that was never in the input. That
 * is aliasing, and it is not a defect of the arithmetic: two different input
 * frequencies genuinely produce the same sequence of samples, so nothing
 * downstream can tell them apart. The only fix is to refuse the input, which
 * is what the anti-alias filter does.
 *
 * `reconstruct` is the other filter, after the quantiser rather than before
 * it, and it is why a compact disc does not sound like a staircase.
 */

import {
  Compound,
  Decimator,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** Reid's own numbers: a 10 kHz tone, sampled at 13.333 kHz. */
const FREQUENCY = 10000;
const RATE = 13333;
const BITS = 24;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: FREQUENCY,
  });
  const crush = Decimator(ac, {
    rate: RATE,
    bits: BITS,
    antialias: 0,
    reconstruct: 0,
  });
  osc.connect(crush);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  // A short window, the one `DecimatorExample` chose: 256 samples is about six
  // milliseconds, which is where the steps are wide enough to count.
  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 256;
  crush.connect(scopeAnalyser);

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  crush.connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [osc, crush, analyser, scopeAnalyser, level],
    exposes: { osc, crush, analyser, scopeAnalyser },
  });
}

export default definePatch({
  id: "time/decimator",
  label: "From sample and hold to digital audio",
  build,
  controls: [
    {
      id: "frequency",
      kind: "slider",
      label: "Tone",
      help: "The input. Everything above half the sample rate folds back.",
      param: (s) => s.osc.frequency,
      min: 100,
      max: 15000,
      scale: "log",
      unit: "Hz",
      default: FREQUENCY,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Sample rate",
      help: "How often the switch closes. Half of it is the Nyquist limit.",
      param: (s) => s.crush.rate,
      min: 2000,
      max: 48000,
      scale: "log",
      unit: "Hz",
      default: RATE,
    },
    {
      id: "bits",
      kind: "slider",
      label: "Bit depth",
      help: "How finely each held value is measured. 24 is transparent.",
      param: (s) => s.crush.bits,
      min: 1,
      max: 24,
      step: 0.1,
      default: BITS,
    },
    {
      id: "antialias",
      kind: "toggle",
      label: "Anti-alias filter",
      help: "A low-pass before the hold, so nothing too high gets sampled.",
      param: (s) => s.crush.antialias,
      default: 0,
    },
    {
      id: "reconstruct",
      kind: "toggle",
      label: "Reconstruction filter",
      help: "The same low-pass after the quantiser, which smooths the steps.",
      param: (s) => s.crush.reconstruct,
      default: 0,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "The spectrum",
      source: (s) => s.analyser,
      // Three marks: the Nyquist limit, the tone that was asked for, and where
      // the arithmetic says the fold will land. All three sit well above 1 kHz,
      // which is the half of a linear axis that reads (tickets `09b`, `11b`).
      options: {
        marks: (s) => {
          const rate = s.crush.rate.value;
          const frequency = s.osc.frequency.value;
          const alias = Math.abs(
            frequency - Math.round(frequency / rate) * rate,
          );
          return [rate / 2, frequency, alias];
        },
      },
    },
    { kind: "scope", label: "The staircase", source: (s) => s.scopeAnalyser },
  ],
});
