/*
 * Two sine waves, multiplied instead of mixed.
 *
 * Part 11's arithmetic is that `cos(a)·cos(b)` is `cos(a+b) + cos(a−b)`, so a
 * carrier multiplied by a modulator comes out as a sum and a difference and
 * nothing else. `offset` is the DC the modulator is handed back after the DC
 * blockers, which is the whole AM↔RM continuum in one knob: at 0 the carrier
 * vanishes and only the sidebands are left; at 1 the carrier is back at full
 * amplitude with half-height sidebands beside it. The ARP 2600 had a switch.
 *
 * Reid's worked example is a 200 Hz carrier against a 100 Hz modulator. The
 * defaults here are ten times that, because the spectrum's frequency axis is
 * linear to Nyquist and three peaks 100 Hz apart would be three pixels apart.
 * The ratio is what the arithmetic is about, and the ratio is unchanged.
 */

import {
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
  RingMod,
  RingModType,
} from "synthlet";
import { definePatch } from "../define";

/** Reid's Case 2 - a carrier at twice the modulator - times ten. */
const CARRIER = 2000;
const MODULATOR = 1000;

/** 0 is a ring modulator. The knob opens it towards amplitude modulation. */
const OFFSET = 0;
const LEVEL = 0.12;

function build(ac: AudioContext) {
  const carrier = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: CARRIER,
  });
  const modulator = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: MODULATOR,
  });

  // The second signal arrives as a parameter rather than a second input,
  // because that is the only thing the library can wire - see the package's
  // README. It costs a mono down-mix and a clamp at ±10, and buys one module
  // that is both an amplitude modulator and a ring modulator.
  const ring = RingMod(ac, {
    type: RingModType.Ideal,
    modulator,
    offset: OFFSET,
    coupling: 1,
  });
  carrier.connect(ring);

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  const out = Gain.val(ac, 0);
  ring.connect(level);
  level.connect(scopeAnalyser);
  level.connect(analyser).connect(out);

  return Compound({
    output: out,
    owns: [carrier, modulator, ring, level, analyser, scopeAnalyser],
    exposes: { carrier, modulator, ring, analyser, scopeAnalyser },
  });
}

export default definePatch({
  id: "modulation/ring",
  label: "Ring modulation",
  build,
  controls: [
    {
      id: "carrier",
      kind: "slider",
      label: "Carrier",
      help: "The signal being modulated. On a synth this is the one you play.",
      param: (s) => s.carrier.frequency,
      min: 200,
      max: 6000,
      scale: "log",
      unit: "Hz",
      default: CARRIER,
    },
    {
      id: "modulator",
      kind: "slider",
      label: "Modulator",
      help: "The signal doing the modulating. It is never heard by itself.",
      param: (s) => s.modulator.frequency,
      min: 100,
      max: 3000,
      scale: "log",
      unit: "Hz",
      default: MODULATOR,
    },
    {
      id: "offset",
      kind: "slider",
      label: "Ring → amplitude",
      help: "0 takes the carrier away; 1 puts it back. Everything between is available.",
      param: (s) => s.ring.offset,
      min: 0,
      max: 1,
      step: 0.01,
      default: OFFSET,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Sum and difference",
      source: (s) => s.analyser,
      // Where Part 11 says the output is: the difference, the carrier, the
      // sum. Whether a peak stands under the middle one is what `offset` is.
      options: {
        marks: (s) => {
          const c = s.carrier.frequency.value;
          const m = s.modulator.frequency.value;
          return [Math.abs(c - m), c, c + m];
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
