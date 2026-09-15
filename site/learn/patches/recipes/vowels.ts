/*
 * Six vowels, three formants, and the proof that a formant is not a filter
 * that follows the keyboard.
 *
 * Part 23 gives the adult-male table and this patch copies all six rows of it
 * verbatim. The Qs and the relative levels come from the extended `ee` row of
 * the same part - F1 Q 5, F2 Q 20, F3 Q 50 - with one honest change: `Svf.Q`
 * stops at 40, so the third formant asks for 40 where Reid asked for 50, and
 * the lesson says so rather than rounding it quietly.
 *
 * Two things are being shown at once. **Formants do not move with pitch**:
 * play up the keyboard and the three marks stay exactly where they are, which
 * is the opposite of the key-tracking filter chapter 4 spent a page on. And
 * **a vowel is a shape, not a pitch**: switch the source to noise, play
 * nothing, and the mouth is still saying the word.
 *
 * Three `Bell` filters in series rather than three band-passes in parallel: a
 * resonance in a cavity *boosts* a region of whatever is driving it rather
 * than replacing it, and Part 50's Sorceror patch puts Reid's own filter bank
 * and high-pass in series for the same reason.
 *
 * No diagram: two sources into a mixer cannot be laid out yet (13b).
 */

import {
  Compound,
  Gain,
  Noise,
  NoiseType,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

/**
 * Part 23's adult-male table, all six rows, in the order the part prints them.
 *
 * `morph` runs from each row to the next and wraps, so the list is a circle:
 * six rows make a mouth that keeps moving, where three would make a short one.
 */
const VOWELS = [
  { name: "ee — as in leap", formants: [270, 2300, 3000] },
  { name: "oo — as in loop", formants: [300, 870, 2250] },
  { name: "i — as in lip", formants: [400, 2000, 2550] },
  { name: "e — as in let", formants: [530, 1850, 2500] },
  { name: "u — as in lug", formants: [640, 1200, 2400] },
  { name: "a — as in lap", formants: [660, 1700, 2400] },
];

/** Reid's Qs, with the third clamped to what an `Svf` will take. */
const Q = [5, 20, 40];
/** His relative levels are 0 / -15 / -9 dB; these are the boosts that give them. */
const GAIN = [18, 3, 9];

const DEFAULT_NOTE = "A2";
const SOURCES = ["Sawtooth", "Noise"];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;
/** How fast a formant slides when the morph moves. A mouth, not a switch. */
const GLIDE = 0.02;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(DEFAULT_NOTE)),
  });
  const sawGain = Gain.val(ac, 1);

  const noise = Noise(ac, { type: NoiseType.White });
  const noiseGain = Gain.val(ac, 0);

  const src = Gain.val(ac, 1);

  const f1 = Svf(ac, {
    type: SvfType.Bell,
    frequency: VOWELS[0].formants[0],
    Q: Q[0],
    gain: GAIN[0],
  });
  const f2 = Svf(ac, {
    type: SvfType.Bell,
    frequency: VOWELS[0].formants[1],
    Q: Q[1],
    gain: GAIN[1],
  });
  const f3 = Svf(ac, {
    type: SvfType.Bell,
    frequency: VOWELS[0].formants[2],
    Q: Q[2],
    gain: GAIN[2],
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(sawGain).connect(src);
  noise.connect(noiseGain).connect(src);
  src.connect(f1).connect(f2).connect(f3);
  f3.connect(analyser).connect(level).connect(out);

  const filters = [f1, f2, f3];
  let row = 0;
  let amount = 0;
  let current = [...VOWELS[0].formants];

  /*
   * One accessor behind two knobs.
   *
   * `vowel` and `morph` both change the same three numbers, so neither can own
   * them - the `cutoff`/`strip` pattern from `sound/harmonics`. The
   * interpolation is geometric because the ear hears ratios: halfway between
   * 270 Hz and 300 Hz is 284 Hz, not 285.
   */
  const apply = () => {
    const from = VOWELS[row].formants;
    const to = VOWELS[(row + 1) % VOWELS.length].formants;
    const now = ac.currentTime;
    current = from.map((start, index) =>
      Math.round(start * Math.pow(to[index] / start, amount)),
    );
    filters.forEach((filter, index) => {
      filter.frequency.setTargetAtTime(current[index], now, GLIDE);
    });
  };

  const vowel = {
    get value() {
      return row;
    },
    set value(next: number) {
      row = Math.min(VOWELS.length - 1, Math.max(0, Math.round(next)));
      apply();
    },
  };

  const morph = {
    get value() {
      return amount;
    },
    set value(next: number) {
      amount = Math.min(1, Math.max(0, next));
      apply();
    },
  };

  let which = 0;
  const source = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      sawGain.gain.setTargetAtTime(which === 0 ? 1 : 0, now, CROSSFADE);
      noiseGain.gain.setTargetAtTime(which === 0 ? 0 : 1, now, CROSSFADE);
    },
  };

  /** Where the three formants are right now, for the spectrum's marks. */
  const formants = () => [...current];

  const play = (note: string) => {
    osc.frequency.value = toFrequency(toMidi(note));
  };
  // The saw drones: this patch is a mouth, and a mouth does not have a gate.
  const stop = () => {};

  return Compound({
    output: out,
    owns: [osc, sawGain, noise, noiseGain, src, f1, f2, f3, analyser, level],
    exposes: {
      osc,
      noise,
      f1,
      f2,
      f3,
      analyser,
      vowel,
      morph,
      source,
      formants,
      play,
      stop,
    },
  });
}

export default definePatch({
  id: "recipes/vowels",
  label: "Vowels",
  build,
  controls: [
    {
      id: "vowel",
      kind: "select",
      label: "Vowel",
      help: "Part 23's adult-male table, all six rows of it.",
      param: (s) => s.vowel,
      options: VOWELS.map((entry) => entry.name),
      default: 0,
    },
    {
      id: "source",
      kind: "select",
      label: "Source",
      help: "A sawtooth has a pitch and noise has none. Both still say the word.",
      param: (s) => s.source,
      options: SOURCES,
      default: 0,
    },
    {
      id: "morph",
      kind: "slider",
      label: "Morph",
      help: "Slide from this vowel to the next one down the list, and round again.",
      param: (s) => s.morph,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => () => s.stop(),
      options: { from: "C2", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The three formants, drawn. They move when the morph does and stand
      // still when the keyboard does, which is the whole lesson in one picture.
      options: { minDb: -100, maxDb: -10, marks: (s) => s.formants() },
    },
  ],
});
