/*
 * Three oscillators, one pitch, one spectrum, and the lesson the spectrum view
 * was built for.
 *
 * Part 17 states the Shannon-Nyquist theorem and then does the thing that makes
 * it audible: it samples a 10 kHz sine at 13.33 kHz and shows that the samples
 * describe a 3.33 kHz wave instead. Anything above half the sample rate folds
 * over and reappears the same distance below it, under an alias - and, Reid
 * says, once it is there you cannot take it out again.
 *
 * A sawtooth at 4 kHz has harmonics at 8, 12, 16 kHz and on up, so most of them
 * are above Nyquist before the note is even played. What an oscillator does
 * about that is the whole difference between the three arms here.
 *
 * - **Naive.** A one-cycle ramp in a buffer, read at whatever rate the pitch
 *   needs. It is a native `AudioBufferSourceNode` on purpose: the library's job
 *   is not to ship a broken oscillator, and this lesson's job is to show one.
 *   The wrap discontinuity is resampled by plain linear interpolation, so every
 *   harmonic above Nyquist folds straight back down the axis and lands between
 *   the ones that belong there.
 * - **PolyBLEP.** The same saw with the discontinuity replaced by a
 *   band-limited step, which is what the library ships.
 * - **PolyBLEP, decimated.** The band-limited saw sampled too slowly on
 *   purpose, with the anti-alias filter switched off - Part 17's Figure 17,
 *   with a knob on it.
 *
 * Every arm runs all the time and the switch is a crossfade between gains
 * (`filters/shootout`'s pattern), so the comparison cannot become a comparison
 * of two settings.
 *
 * No `diagram`: three parallel arms is three audio chains, and the kit's layout
 * draws every box on an audio cable in one row (ticket 10b). The naive arm is
 * also a native node, which a diagram cannot label (ticket 10c).
 */

import {
  Compound,
  Decimator,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** One cycle of a ramp. Small enough to be crude, which is the point. */
const TABLE_LENGTH = 1024;

/** High enough that most of a saw's harmonics are already above Nyquist. */
const FREQUENCY = 4000;

const RATE = 11025;
const BITS = 24;

/** How many harmonics to rule over the trace. */
const HARMONICS = 24;

const CROSSFADE = 0.01;
const LEVEL = 0.125;

const OSCILLATORS = [
  "Naive wavetable",
  "PolyBLEP",
  "PolyBLEP, decimated",
] as const;

function build(ac: AudioContext) {
  // Arm 0: a naive wavetable oscillator, built out of native parts because the
  // library does not contain one.
  const table = ac.createBuffer(1, TABLE_LENGTH, ac.sampleRate);
  const ramp = table.getChannelData(0);
  for (let i = 0; i < TABLE_LENGTH; i++) {
    ramp[i] = 1 - (2 * i) / TABLE_LENGTH;
  }
  const naive = new AudioBufferSourceNode(ac, { buffer: table, loop: true });
  naive.start();
  let stopped = false;

  // Arm 1: the library's oscillator, which replaces each discontinuity with a
  // band-limited step so that the harmonics above Nyquist are never generated.
  const blep = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });

  // Arm 2: the same clean saw, sampled too slowly. `antialias: 0` is Reid's
  // missing low-pass filter before the converter; `reconstruct: 0` is the
  // missing one after it.
  const decimated = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });
  const decimator = Decimator(ac, {
    rate: RATE,
    bits: BITS,
    antialias: 0,
    reconstruct: 0,
  });
  decimated.connect(decimator);

  const arms = [naive, blep, decimator];
  const gains = arms.map((_, index) => Gain.val(ac, index === 0 ? 1 : 0));
  const mix = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  arms.forEach((arm, index) => arm.connect(gains[index]).connect(mix));
  mix.connect(scopeAnalyser);
  mix.connect(analyser).connect(level).connect(out);

  let chosen = 0;
  const oscillator = {
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

  // One pitch, three ways of asking for it: the naive arm has no frequency at
  // all, only a rate at which the table is read, which is itself most of the
  // lesson.
  let frequency = FREQUENCY;
  const frequencyRef = {
    get value() {
      return frequency;
    },
    set value(next: number) {
      frequency = next;
      naive.playbackRate.value = (frequency * TABLE_LENGTH) / ac.sampleRate;
      blep.frequency.value = frequency;
      decimated.frequency.value = frequency;
    },
  };
  frequencyRef.value = FREQUENCY;

  return Compound({
    output: out,
    owns: [
      naive,
      () => {
        if (stopped) return;
        stopped = true;
        naive.stop();
      },
      blep,
      decimated,
      decimator,
      ...gains,
      mix,
      analyser,
      scopeAnalyser,
      level,
    ],
    exposes: {
      naive,
      blep,
      decimated,
      decimator,
      mix,
      analyser,
      scopeAnalyser,
      oscillator,
      frequency: frequencyRef,
    },
  });
}

export default definePatch({
  id: "beyond/polyblep",
  label: "Band-limiting",
  build,
  controls: [
    {
      id: "oscillator",
      kind: "select",
      label: "Oscillator",
      help: "The same sawtooth, generated three ways.",
      param: (s) => s.oscillator,
      options: [...OSCILLATORS],
      default: 0,
    },
    {
      id: "frequency",
      kind: "slider",
      label: "Frequency",
      help: "Sweep it upward: the marks climb and the aliases slide the other way.",
      param: (s) => s.frequency,
      min: 200,
      max: 8000,
      scale: "log",
      unit: "Hz",
      default: FREQUENCY,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Sample rate",
      help: "The third arm's own, lower sample rate. Nyquist is half of it.",
      param: (s) => s.decimator.rate,
      min: 2000,
      max: 44100,
      scale: "log",
      unit: "Hz",
      default: RATE,
    },
    {
      id: "bits",
      kind: "slider",
      label: "Bits",
      help: "Reid's other limit: how finely the amplitude can be chopped up.",
      param: (s) => s.decimator.bits,
      min: 1,
      max: 24,
      step: 1,
      default: BITS,
    },
    {
      id: "antialias",
      kind: "toggle",
      label: "Anti-alias",
      help: "The low-pass filter before the converter. Off is where aliasing comes from.",
      param: (s) => s.decimator.antialias,
      default: 0,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // Where the partials *should* be. Anything standing between two marks is
      // a harmonic that folded over, and on the naive arm there are dozens of
      // them - moving downward as the pitch moves up, which is the one
      // behaviour no real harmonic has.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => {
          const nyquist = s.analyser.context.sampleRate / 2;
          const f = s.frequency.value;
          const found: number[] = [];
          for (let n = 1; n <= HARMONICS; n++) {
            if (n * f >= nyquist) break;
            found.push(n * f);
          }
          return found;
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
