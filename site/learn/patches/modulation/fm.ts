/*
 * Vibrato, sped up until it stops being vibrato.
 *
 * `PolyblepOscillator.frequency` is a-rate and bipolar, which means a node
 * patched into it is linear frequency modulation with no new module: a
 * modulator deeper than the base pitch sweeps through zero and out the other
 * side rather than being rectified at the bottom. So Chowning's discovery is
 * two oscillators and a gain in this library, exactly as it was two VCOs and a
 * VCA on a modular (Part 13, Figure 9).
 *
 * Two knobs decide everything. The modulator's *frequency* decides where the
 * sidebands are - `c ± n·m`, which is what the marks draw - and the modulator's
 * *amplitude* decides how many of them matter, through the modulation index
 * `ß = deviation / m`. The amount node's gain is therefore `ß · m` and not `ß`,
 * which is why moving the rate does not change the timbre.
 *
 * The carrier is fixed at 1 kHz. It is high for a musical note and it is the
 * lowest pitch at which sidebands a kilohertz apart are far enough apart to
 * see on a spectrum whose frequency axis is linear to Nyquist.
 */

import {
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const CARRIER = 1000;

/** Part 13's C:M ratios: three that are harmonic, and one that is not. */
const RATIO_NAMES = ["1:1", "1:2", "1:3", "1:4", "1:1.21"];
const RATIOS = [1, 2, 3, 4, 1.21];

const INDEX = 1;
/** `Param.gain` is clamped to this, and a deviation past it would silently stick. */
const MAX_DEVIATION = 20000;
/** How many orders of sideband the marks predict. */
const ORDERS = 8;
const LEVEL = 0.12;

function build(ac: AudioContext) {
  const carrier = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: CARRIER,
  });
  const modulator = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: CARRIER * RATIOS[0],
  });
  // Reid's VCA1: the modulator's amplitude, in hertz of deviation.
  const depth = Param.mul(ac, modulator, 0);
  depth.connect(carrier.frequency);

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  const out = Gain.val(ac, 0);
  carrier.connect(level);
  level.connect(scopeAnalyser);
  level.connect(analyser).connect(out);

  let ratio = 0;
  let rate = CARRIER * RATIOS[0];
  let index = INDEX;
  const apply = () => {
    modulator.frequency.value = rate;
    depth.gain.value = Math.min(MAX_DEVIATION, index * rate);
  };
  apply();

  // Three accessors rather than three parameters, because the deviation is a
  // product: whichever of the three the reader moves, `ß · m` has to be worked
  // out again. `ratio` and `rate` are two descriptions of one act, the way
  // `strip` and `cutoff` are in `sound/harmonics` - the list snaps the
  // modulator onto a C:M ratio, the slider puts it anywhere.
  const ratioRef = {
    get value() {
      return ratio;
    },
    set value(next: number) {
      ratio = Math.min(RATIOS.length - 1, Math.max(0, Math.round(next)));
      rate = CARRIER * RATIOS[ratio];
      apply();
    },
  };
  const rateRef = {
    get value() {
      return rate;
    },
    set value(next: number) {
      rate = next;
      apply();
    },
  };
  const indexRef = {
    get value() {
      return index;
    },
    set value(next: number) {
      index = Math.max(0, next);
      apply();
    },
  };

  return Compound({
    output: out,
    owns: [carrier, modulator, depth, level, analyser, scopeAnalyser],
    exposes: {
      carrier,
      modulator,
      depth,
      analyser,
      scopeAnalyser,
      ratio: ratioRef,
      rate: rateRef,
      index: indexRef,
    },
  });
}

export default definePatch({
  id: "modulation/fm",
  label: "Frequency modulation",
  build,
  controls: [
    {
      id: "ratio",
      kind: "select",
      label: "C:M ratio",
      help: "The modulator as a ratio of the carrier. Whole numbers are harmonic.",
      param: (s) => s.ratio,
      options: RATIO_NAMES,
      default: 0,
    },
    {
      id: "index",
      kind: "slider",
      label: "Index",
      help: "How far the modulator swings the carrier, in modulator frequencies.",
      param: (s) => s.index,
      min: 0,
      max: 20,
      step: 0.05,
      default: INDEX,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Modulator",
      help: "The modulator's own frequency. Sweep it up from half a hertz.",
      param: (s) => s.rate,
      min: 0.5,
      max: 4000,
      scale: "log",
      unit: "Hz",
      default: CARRIER,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Sidebands",
      source: (s) => s.analyser,
      /*
       * `c ± n·m`, folded.
       *
       * A lower sideband below zero is not missing: Part 13's answer is that a
       * negative frequency is the same frequency with its phase inverted, so it
       * reflects back and is subtracted from whatever is already there. Taking
       * the absolute value is that reflection, and it is why 1:1 draws a plain
       * harmonic series.
       */
      options: {
        marks: (s) => {
          const c = s.carrier.frequency.value;
          const m = s.rate.value;
          const found = new Set<number>();
          for (let n = -ORDERS; n <= ORDERS; n++) {
            found.add(Math.round(Math.abs(c + n * m)));
          }
          return [...found];
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
