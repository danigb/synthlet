/*
 * A cowbell, a pair of claves, a struck bell, and the ring-modulated bell Reid
 * built in Part 11 and cashed in at Part 40.
 *
 * The cowbell is the chapter's best experiment because Reid makes a falsifiable
 * claim about it: the Roland CR-8000's two tones are **587 Hz and 845 Hz**, a
 * ratio of 1 : 1.44, taken by ear off the machine, and "even small deviations
 * from these pitches destroy the cowbell illusion". Two sliders, and you can
 * check.
 *
 * They are triangles rather than pulses - pulses are "far too bright and
 * 'synth-y'" - through a 12 dB/oct band-pass at 2.64 kHz with a little
 * resonance, on a two-stage A/D1/D2 contour: "a high-amplitude, short-duration
 * impact followed by a more extended tail". Here that contour is not an
 * envelope generator at all. `ModalResonator.modes.cowbell()` gives each tone
 * **two rows at the same ratio** - a loud short one and a quiet long one - and
 * two modes at one frequency struck together are one sine whose envelope is
 * the sum of two exponentials. Which is the same shape, with nothing to
 * trigger.
 *
 * The claves are one mode, because Part 41 says the TR-808's are "a single
 * Bridged-T oscillator and an output amplifier - the signal is not even
 * modified before being passed to the output". **Reid gives no frequency for
 * them**, only "an even shorter Decay than the cowbell", so 2500 Hz is
 * `ClaveDrum`'s and the lesson says so. `CowBellDrum` and `ClaveDrum` are the
 * shipped versions of these two; 13c is why the reader cannot open them here.
 *
 * The struck bell is Part 40's tuning: strike partials at 2 : 3 : 4 so the ear
 * supplies the missing 1 - his 100, 150 and 200 Hz, heard as 50 - with a
 * near-degenerate partner beating against the 2 and a hum an octave down.
 *
 * And the fourth is the cheap one: two sine waves multiplied together, which
 * is Part 11's Case 3 and every toy bell ever made.
 *
 * No diagram: two sources (13b).
 */

import {
  AdAmp,
  Compound,
  Gain,
  Impulse,
  ModalResonator,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  RingMod,
  RingModType,
  type ResonatorMode,
} from "synthlet";
import { definePatch } from "../define";

/** The CR-8000's two, by ear, in Part 41. */
const TONE_1 = 587;
const TONE_2 = 845;

/** `ClaveDrum`'s pitch. Reid gives none. */
const CLAVE = 2500;
/** Part 40's bell is tuned by its strike note; this is where the patch puts it. */
const BELL = 220;

const DEFAULT_DECAY = 0.6;
const DEFAULT_CARRIER = 371;
const DEFAULT_MODULATOR = 100;

const DRUMS = [
  "Cowbell (CR-8000)",
  "Claves (TR-808)",
  "Bell — struck",
  "Bell — ring modulation",
];

/** Per mode: where the resonator is tuned, and how long it rings. */
const TUNING = [TONE_1, CLAVE, BELL, BELL];
const DECAY_SCALE = [1, 0.13, 5, 1];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

/**
 * The cowbell table, rebuilt from the two sliders.
 *
 * Two rows per tone at the same ratio: a loud short one and a quiet long one,
 * which is the impact and the tail.
 */
const cowbell = (lower: number, upper: number): ResonatorMode[] => [
  { ratio: 1, level: 0.3, decay: 0.1 },
  { ratio: 1, level: 0.15, decay: 1 },
  { ratio: upper / lower, level: 0.35, decay: 0.1 },
  { ratio: upper / lower, level: 0.2, decay: 1 },
];

function build(ac: AudioContext) {
  const trigger = Param.input(ac, 0);
  const decay = Param.input(ac, DEFAULT_DECAY);
  const decayScale = Param.input(ac, 1);
  const scaled = Param.mul(ac, decay, decayScale);
  const frequency = Param.input(ac, TONE_1);

  const impulse = Impulse(ac, { trigger });
  const res = ModalResonator(ac, {
    frequency,
    decay: scaled,
    brightness: 1,
    modes: cowbell(TONE_1, TONE_2),
    maxModes: 16,
  });
  const resGain = Gain.val(ac, 1);

  // Part 11's Case 3, used as Part 40's bell: two sines, multiplied.
  const carrier = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: DEFAULT_CARRIER,
  });
  const modulator = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sine,
    frequency: DEFAULT_MODULATOR,
  });
  const ring = RingMod(ac, {
    type: RingModType.Ideal,
    modulator,
    offset: 0,
  });
  const ringAmp = AdAmp(ac, { trigger, attack: 0.001, decay: scaled });
  const ringGain = Gain.val(ac, 0);

  const bus = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  impulse.connect(res).connect(resGain).connect(bus);
  carrier.connect(ring).connect(ringAmp).connect(ringGain).connect(bus);
  bus.connect(analyser).connect(level).connect(out);

  let lower = TONE_1;
  let upper = TONE_2;
  let which = 0;

  const retune = () => {
    if (which !== 0) return;
    res.setModes(cowbell(lower, upper));
    frequency.input.value = lower;
  };

  const tone1 = {
    get value() {
      return lower;
    },
    set value(next: number) {
      lower = next;
      retune();
    },
  };

  const tone2 = {
    get value() {
      return upper;
    },
    set value(next: number) {
      upper = next;
      retune();
    },
  };

  const drum = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(DRUMS.length - 1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      const ringing = which === 3;
      resGain.gain.setTargetAtTime(ringing ? 0 : 1, now, CROSSFADE);
      ringGain.gain.setTargetAtTime(ringing ? 1 : 0, now, CROSSFADE);
      decayScale.input.setTargetAtTime(DECAY_SCALE[which], now, CROSSFADE);
      if (which === 0) {
        res.setModes(cowbell(lower, upper));
      } else if (which === 1) {
        res.setModes(ModalResonator.modes.harmonic(1));
      } else if (which === 2) {
        res.setModes(ModalResonator.modes.bell());
      }
      frequency.input.value = which === 0 ? lower : TUNING[which];
    },
  };

  /** What the book predicts is in there, for the marks. */
  const predicted = () => {
    if (which === 3) {
      const c = carrier.frequency.value;
      const m = modulator.frequency.value;
      return [Math.abs(c - m), c, c + m];
    }
    if (which === 1) return [CLAVE];
    if (which === 2) return [BELL, BELL * 2, BELL * 3, BELL * 4];
    return [lower, upper];
  };

  return Compound({
    output: out,
    owns: [
      trigger,
      decay,
      decayScale,
      scaled,
      frequency,
      impulse,
      res,
      resGain,
      carrier,
      modulator,
      ring,
      ringAmp,
      ringGain,
      bus,
      analyser,
      level,
    ],
    exposes: {
      trigger,
      decay,
      res,
      carrier,
      modulator,
      ring,
      analyser,
      tone1,
      tone2,
      drum,
      predicted,
    },
  });
}

export default definePatch({
  id: "recipes/bells",
  label: "Bells, cowbell, claves",
  build,
  controls: [
    {
      id: "tone1",
      kind: "slider",
      label: "Lower tone",
      help: "587 Hz is a cowbell. Reid says small deviations destroy the illusion; check.",
      param: (s) => s.tone1,
      min: 400,
      max: 800,
      step: 1,
      unit: "Hz",
      default: TONE_1,
    },
    {
      id: "tone2",
      kind: "slider",
      label: "Upper tone",
      help: "845 Hz, which is 1.44 times the lower one. 900 is not a cowbell.",
      param: (s) => s.tone2,
      min: 600,
      max: 1100,
      step: 1,
      unit: "Hz",
      default: TONE_2,
    },
    {
      id: "carrier",
      kind: "slider",
      label: "Bell carrier",
      help: "One of the two sines the ring modulator multiplies.",
      param: (s) => s.carrier.frequency,
      min: 200,
      max: 800,
      scale: "log",
      unit: "Hz",
      default: DEFAULT_CARRIER,
    },
    {
      id: "modulator",
      kind: "slider",
      label: "Bell modulator",
      help: "The other. The output is the sum and the difference, and neither is either.",
      param: (s) => s.modulator.frequency,
      min: 50,
      max: 400,
      scale: "log",
      unit: "Hz",
      default: DEFAULT_MODULATOR,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "Each sound scales this: the claves get a tenth of it and the bell five times.",
      param: (s) => s.decay.input,
      min: 0.05,
      max: 3,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "drum",
      kind: "select",
      label: "Sound",
      help: "Three tables in one resonator, and one pair of oscillators beside it.",
      param: (s) => s.drum,
      options: DRUMS,
      default: 0,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Strike it",
      help: "An impulse for the resonator, a contour for the ring modulator.",
      param: (s) => s.trigger.input,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // Six pixels apart at the cowbell's setting, which is why the marks are
      // here at all: the claim is what to look at, not what to look for.
      options: { minDb: -100, maxDb: -10, marks: (s) => s.predicted() },
    },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
  ],
});
