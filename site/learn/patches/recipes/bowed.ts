/*
 * A bowed string: a sawtooth, a body, and a bow that arrives late.
 *
 * The sawtooth is not an approximation. Part 48's whole point is that the
 * force a bowed string exerts *at the bridge* - which is what the body hears -
 * is a sawtooth, produced by the stick-slip cycle: the string is dragged by the
 * bow, lets go, flies back, is caught again. Synthesising a violin from a saw
 * is therefore physics rather than convenience.
 *
 * The body is Part 49's own table, from an Analogue Systems RS360 filter bank:
 * **VCF1 300 Hz Q 3.5, VCF2 700 Hz Q 3.5, VCF3 3 kHz Q 2**. Those six numbers
 * are verbatim. The three gains are this patch's, because Reid's column is an
 * input level into a *parallel* bank and this chain is in **series** - and the
 * licence for that is Part 50's Sorceror patch, where his own resonant
 * high-pass and fixed filter bank sit in series so that the responses multiply
 * rather than add. A `Bell` boosts a region of the source instead of replacing
 * it, which is what a body resonance does; and a series chain is the one shape
 * the diagram layout can draw.
 *
 * The vibrato is Part 51's: 5 to 8 Hz, up to about a quarter tone, and
 * arriving *after* the initial bowing rather than on it.
 */

import {
  AdsrAmp,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "D4";

/** Part 49's RS360 table: the frequencies and the Qs are Reid's. */
const FORMANTS = [
  { frequency: 300, Q: 3.5, gain: 15 },
  { frequency: 700, Q: 3.5, gain: 12 },
  { frequency: 3000, Q: 2, gain: 10 },
];

const DEFAULT_ATTACK = 0.25;
/** Reid's 5 to 8 Hz, in the middle. */
const VIBRATO_RATE = 6;
const DEFAULT_VIBRATO_DELAY = 1.2;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));

  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start,
  });

  const f1 = Svf(ac, { type: SvfType.Bell, ...FORMANTS[0] });
  const f2 = Svf(ac, { type: SvfType.Bell, ...FORMANTS[1] });
  const f3 = Svf(ac, { type: SvfType.Bell, ...FORMANTS[2] });

  const gate = Param(ac);
  const amp = AdsrAmp(ac, {
    gate,
    attack: DEFAULT_ATTACK,
    decay: 0.2,
    sustain: 0.9,
    release: 0.3,
  });

  // In cents, so the wobble is the same size at every pitch - which is what a
  // player's finger does, and what a frequency offset in hertz would not.
  const lfo = Lfo(ac, {
    type: LfoType.Sine,
    frequency: VIBRATO_RATE,
    gain: 0,
    attack: DEFAULT_VIBRATO_DELAY,
    gate,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(f1).connect(f2).connect(f3).connect(amp);
  amp.connect(analyser).connect(level).connect(out);
  lfo.connect(osc.detune);

  const held = new Set<string>();
  const play = (note: string) => {
    held.add(note);
    osc.frequency.value = toFrequency(toMidi(note));
    gate.input.value = 1;
  };
  const stop = (note: string) => {
    held.delete(note);
    if (held.size === 0) gate.input.value = 0;
  };

  return Compound({
    output: out,
    owns: [osc, f1, f2, f3, gate, amp, lfo, analyser, level],
    exposes: { osc, f1, f2, f3, amp, lfo, analyser, play, stop },
  });
}

export default definePatch({
  id: "recipes/bowed",
  label: "Bowed strings",
  build,
  controls: [
    {
      id: "formant1",
      kind: "slider",
      label: "Formant 1 — 300 Hz",
      help: "The lowest body resonance. All three at zero leaves a bare sawtooth.",
      param: (s) => s.f1.gain,
      min: -12,
      max: 24,
      step: 1,
      unit: "dB",
      default: FORMANTS[0].gain,
    },
    {
      id: "formant2",
      kind: "slider",
      label: "Formant 2 — 700 Hz",
      help: "The middle of Reid's three, at the same Q as the first.",
      param: (s) => s.f2.gain,
      min: -12,
      max: 24,
      step: 1,
      unit: "dB",
      default: FORMANTS[1].gain,
    },
    {
      id: "formant3",
      kind: "slider",
      label: "Formant 3 — 3 kHz",
      help: "The broad one. It is the rosin, and taking it out takes the bow away.",
      param: (s) => s.f3.gain,
      min: -12,
      max: 24,
      step: 1,
      unit: "dB",
      default: FORMANTS[2].gain,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "The bow getting the string moving. Nothing about it is instant.",
      param: (s) => s.amp.attack,
      min: 0.01,
      max: 1.5,
      scale: "time",
      unit: "s",
      default: DEFAULT_ATTACK,
    },
    {
      id: "vibratoDelay",
      kind: "slider",
      label: "Vibrato delay",
      help: "How long the vibrato takes to arrive. A player starts the note without it.",
      param: (s) => s.lfo.attack,
      min: 0,
      max: 3,
      scale: "time",
      unit: "s",
      default: DEFAULT_VIBRATO_DELAY,
    },
    {
      id: "vibratoDepth",
      kind: "slider",
      label: "Vibrato depth",
      help: "Fifty cents is a quarter tone, which is Reid's ceiling for a violin.",
      param: (s) => s.lfo.gain,
      min: 0,
      max: 50,
      step: 1,
      unit: "cents",
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.stop(note),
      options: { from: "C3", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // Part 49's three, ruled over the sawtooth they are shaping. They do not
      // move when the note does: a body does not follow the player's hand.
      options: { marks: () => FORMANTS.map((formant) => formant.frequency) },
    },
    { kind: "diagram", label: "The patch" },
  ],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      {
        id: "f1",
        label: "Svf",
        kind: "modifier",
        exposedAs: "f1",
        controls: ["formant1"],
      },
      {
        id: "f2",
        label: "Svf",
        kind: "modifier",
        exposedAs: "f2",
        controls: ["formant2"],
      },
      {
        id: "f3",
        label: "Svf",
        kind: "modifier",
        exposedAs: "f3",
        controls: ["formant3"],
      },
      {
        id: "amp",
        label: "AdsrAmp",
        kind: "modifier",
        exposedAs: "amp",
        controls: ["attack"],
      },
      { id: "out", label: "out", kind: "output" },
      {
        id: "lfo",
        label: "Lfo",
        kind: "controller",
        controls: ["vibratoDelay", "vibratoDepth"],
      },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    // The order matters. A controller takes the column of the **first** box it
    // feeds, so declaring `keys -> amp` before `keys -> osc` puts the keyboard
    // under the amplifier and the LFO under the oscillator - four columns
    // apart, and neither cable drawn through the other.
    edges: [
      { from: "osc", to: "f1" },
      { from: "f1", to: "f2" },
      { from: "f2", to: "f3" },
      { from: "f3", to: "amp" },
      { from: "amp", to: "out" },
      { from: "lfo", to: "osc", param: "detune" },
      { from: "keys", to: "amp", param: "gate" },
      { from: "keys", to: "osc", param: "frequency" },
    ],
  },
});
