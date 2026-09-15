/*
 * One delay line, three, and Roland's pair: the three ensemble designs.
 *
 * Part 62's argument runs in three steps, and `ChorusMode` is those three
 * steps. One modulated delay against the dry signal is the simple chorus of
 * Figure 3, and Reid says outright that the ear is not fooled by it. Three
 * paths modulated by one LFO at 0, 120 and 240 degrees is Figure 7, the classic
 * '70s string machine - the Eminent Solina's circuit. Roland's design is
 * Figure 15: a stereo pair whose two halves are chorusing differently, with the
 * dry signal left out of the output entirely because it would narrow the width
 * rather than add to it.
 *
 * The switch does **not** apply `CHORUS_MODE_DEFAULTS`, and that is the whole
 * point of the patch. The lesson's claim is that the three *voicings* differ at
 * the same settings; re-writing four knobs on every switch would hide exactly
 * that, and would turn a comparison of designs into a comparison of presets. A
 * mode change crossfades over 5 ms inside the module, so it is safe to switch
 * while a chord is holding - which is the thing worth doing here.
 *
 * The source is the string machine's own: a divide-down sawtooth, which is the
 * waveform every ensemble keyboard started from, doubled and detuned so that
 * the chorus has something with a little life in it to work on.
 *
 * No `diagram`: two oscillators into one mixer is two audio chains, and the
 * kit's layout puts every box on an audio cable in one row (ticket 10b).
 */

import {
  Chorus,
  ChorusMode,
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const FREQUENCY = 110;
/** Cents, either side of the pitch. Small: the chorus is the width, not this. */
const DETUNE = 7;
/** Two saws summed here, so the pair peaks at 1 rather than at 2. */
const SUM = 0.4;

const RATE = 0.5;
const DEPTH = 0.6;
const MIX = 0.5;
const WIDTH = 1;

const LEVEL = 0.125;

/**
 * `ChorusMode`'s own order. The select writes the position, so the list *is*
 * the enum: 0 Juno, 1 Ensemble, 2 Dimension.
 */
const MODES = [
  "Juno — one delay, one LFO",
  "Ensemble — three taps at 120°",
  "Dimension — Roland's stereo pair",
];

function build(ac: AudioContext) {
  const a = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
    detune: -DETUNE,
  });
  const b = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
    detune: DETUNE,
  });
  const sum = Gain.val(ac, SUM);

  // `width` touches the wet path only - Dattorro's rule that narrowing an
  // effect must not narrow its source - and `mix` at 0 is an exact bypass, so
  // the two ends of that slider are the before and after of the whole lesson.
  const chorus = Chorus(ac, {
    mode: ChorusMode.Juno,
    rate: RATE,
    depth: DEPTH,
    mix: MIX,
    width: WIDTH,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  a.connect(sum);
  b.connect(sum);
  sum.connect(chorus).connect(analyser).connect(level).connect(out);

  // One knob, two oscillators, opposite signs: what the reader moves is the
  // *interval* between the pair, which is the quantity the ear hears as
  // thickness. Two detune sliders would be two statements of one act.
  let cents = DETUNE;
  const detune = {
    get value() {
      return cents;
    },
    set value(next: number) {
      cents = next;
      a.detune.value = -cents;
      b.detune.value = cents;
    },
  };

  return Compound({
    output: out,
    owns: [a, b, sum, chorus, analyser, level],
    exposes: { a, b, sum, chorus, analyser, detune },
  });
}

export default definePatch({
  id: "effects/chorus",
  label: "Chorus and ensemble",
  build,
  controls: [
    {
      id: "mode",
      kind: "select",
      label: "Design",
      help: "Three ensemble circuits, at whatever settings the knobs are on.",
      param: (s) => s.chorus.mode,
      options: MODES,
      default: ChorusMode.Juno,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Rate",
      help: "A fraction of a hertz is a gentle chorus; 5 to 7 Hz is an ensemble.",
      param: (s) => s.chorus.rate,
      min: 0,
      max: 7,
      step: 0.01,
      unit: "Hz",
      default: RATE,
    },
    {
      id: "depth",
      kind: "slider",
      label: "Depth",
      help: "How far the delay swings, as much as this rate and voicing can carry.",
      param: (s) => s.chorus.depth,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEPTH,
    },
    {
      id: "mix",
      kind: "slider",
      label: "Mix",
      help: "0 is an exact bypass: the string machine with its ensemble switched off.",
      param: (s) => s.chorus.mix,
      min: 0,
      max: 1,
      step: 0.01,
      default: MIX,
    },
    {
      id: "width",
      kind: "slider",
      label: "Width",
      help: "The stereo field of the wet path only. Headphones, for this one.",
      param: (s) => s.chorus.width,
      min: 0,
      max: 1,
      step: 0.01,
      default: WIDTH,
    },
    {
      id: "detune",
      kind: "slider",
      label: "Detune",
      help: "The interval between the two sawtooths, before any chorus at all.",
      param: (s) => s.detune,
      min: 0,
      max: 25,
      step: 0.5,
      unit: "c",
      default: DETUNE,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
