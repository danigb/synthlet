/*
 * A stack of waves and a knob that slides between them.
 *
 * A wavetable oscillator is a pile of single-cycle waveforms - planes - with a
 * read position that can sit between two of them and crossfade. Nothing in
 * Synth Secrets is about this, which is why the chapter exists: the PPG Wave
 * was 1981, the Prophet VS was 1986, and the idea only became the thing every
 * software synth is built around long after Reid stopped writing.
 *
 * `setHarmonics(planes)` takes one array of harmonic magnitudes per plane and
 * is synchronous, so a table swap is three lines and no network. `planes[p][0]`
 * is the **fundamental**, not DC - unlike Web Audio's `PeriodicWave`, whose
 * index 0 is DC. Every plane is built at the same canonical phase, which is
 * what makes a morph between two of them a spectral interpolation rather than a
 * phase cancellation, and what makes the picture below readable.
 *
 * The module's *catalog* of tables is a third party's GitHub Pages mirror, so
 * this lesson does not use it: a lesson that fetches somebody else's host is a
 * lesson that breaks offline (ticket 14c). The three tables here are built in
 * this file, and the first of them is the one a fresh oscillator already has.
 *
 * No `diagram`: the knob and the LFO arrive at the same parameter port, and the
 * kit's layout would stack the two boxes on top of each other (ticket 10b).
 */

import {
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  shapeHarmonics,
  WavetableOscillator,
} from "synthlet";
import { definePatch } from "../define";

const FREQUENCY = 110;
const LFO_RATE = 0.2;
const LFO_DEPTH = 0;

/** Harmonics per plane. The 256-sample table holds 128, so this is unhurried. */
const PARTIALS = 64;
/** How many harmonics the marks predict. */
const MARKS = 16;

const LEVEL = 0.125;

/**
 * Sine, triangle, sawtooth, square - the table a fresh oscillator starts with.
 *
 * Written out rather than taken from `builtInHarmonics()` so that the three
 * table options in this file are all the same kind of thing: a list of planes,
 * each a list of harmonic magnitudes.
 */
const BUILT_IN = [
  shapeHarmonics("sine", PARTIALS),
  shapeHarmonics("triangle", PARTIALS),
  shapeHarmonics("sawtooth", PARTIALS),
  shapeHarmonics("square", PARTIALS),
];

/** Plane `p` is a sawtooth truncated to `p + 1` harmonics: additive, as a morph. */
const SWEEP = Array.from({ length: MARKS }, (_, p) =>
  Float32Array.from({ length: p + 1 }, (_, i) => 1 / (i + 1)),
);

/** Odd harmonics only, one more per plane: a sine becoming a square. */
const ODD = Array.from({ length: MARKS }, (_, p) =>
  Float32Array.from({ length: 2 * p + 1 }, (_, i) =>
    i % 2 === 0 ? 1 / (i + 1) : 0,
  ),
);

const TABLES = [
  { name: "Built-in shapes — sine to square", planes: BUILT_IN },
  { name: "Harmonic sweep — 1 to 16 partials", planes: SWEEP },
  { name: "Odd harmonics — sine to square", planes: ODD },
];

function build(ac: AudioContext) {
  const osc = WavetableOscillator(ac, { frequency: FREQUENCY });

  // The knob and the LFO sum at the parameter, which is what a morph knob with
  // an LFO amount beside it *is*: an `AudioParam` adds its inputs to its own
  // value, so no mixer is needed and no module has to know about the other.
  const morph = Param.input(ac, 0);
  morph.connect(osc.morph);
  const lfo = Lfo(ac, {
    type: LfoType.Sine,
    frequency: LFO_RATE,
    gain: LFO_DEPTH,
  });
  lfo.connect(osc.morph);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(scopeAnalyser);
  osc.connect(analyser).connect(level).connect(out);

  // A table change is `setHarmonics`, which builds the planes on this thread
  // and posts them. Morph jumps are ramped over 64 samples inside the worklet,
  // so neither dragging the slider nor swapping the table clicks.
  let table = 0;
  const tableRef = {
    get value() {
      return table;
    },
    set value(next: number) {
      table = Math.min(TABLES.length - 1, Math.max(0, Math.round(next)));
      osc.setHarmonics(TABLES[table].planes);
    },
  };

  return Compound({
    output: out,
    owns: [osc, morph, lfo, analyser, scopeAnalyser, level],
    exposes: {
      osc,
      morph,
      lfo,
      analyser,
      scopeAnalyser,
      table: tableRef,
    },
  });
}

export default definePatch({
  id: "beyond/wavetable",
  label: "Wavetables and morphing",
  build,
  controls: [
    {
      id: "table",
      kind: "select",
      label: "Table",
      help: "Three stacks of waves, built here rather than downloaded.",
      param: (s) => s.table,
      options: TABLES.map((entry) => entry.name),
      default: 0,
    },
    {
      id: "morph",
      kind: "slider",
      label: "Morph",
      help: "The read position through the stack: 0 is the first plane, 1 the last.",
      param: (s) => s.morph.input,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
    },
    {
      id: "lfoRate",
      kind: "slider",
      label: "LFO rate",
      help: "How fast the morph wanders on its own.",
      param: (s) => s.lfo.frequency,
      min: 0.02,
      max: 8,
      scale: "log",
      unit: "Hz",
      default: LFO_RATE,
    },
    {
      id: "lfoDepth",
      kind: "slider",
      label: "LFO depth",
      help: "How far. It sums with the knob rather than replacing it.",
      param: (s) => s.lfo.gain,
      min: 0,
      max: 0.5,
      step: 0.01,
      default: LFO_DEPTH,
    },
    {
      id: "frequency",
      kind: "slider",
      label: "Frequency",
      help: "The pitch. Low, so there are partials to watch appear.",
      param: (s) => s.osc.frequency,
      min: 55,
      max: 880,
      scale: "log",
      unit: "Hz",
      default: FREQUENCY,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Partials",
      source: (s) => s.analyser,
      // The first sixteen harmonics of whatever the pitch is. Partials arrive
      // and leave as the morph crosses a plane, and they arrive *on* the marks,
      // which is the claim that a morph is a spectral interpolation.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => {
          const f = s.osc.frequency.value;
          return Array.from({ length: MARKS }, (_, n) => (n + 1) * f);
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
