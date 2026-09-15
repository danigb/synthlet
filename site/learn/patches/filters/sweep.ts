/*
 * A filter that moves, which is the sound everybody means by "analogue".
 *
 * Everything up to here has been a static filter - a tone control, and Reid
 * says so in as many words. What turns it into an instrument is a second and a
 * third thing writing the cutoff while a note is held: a contour that happens
 * once per key, and an oscillator too slow to hear that never stops. Both
 * arrive at the same parameter and are summed with the number already in it, so
 * the cutoff is a floor plus a shape plus a wobble.
 *
 * The envelope reaches the filter through a `Param` rather than directly,
 * because a contour generator's output is 0 to 1 whatever its times say: the
 * `Param`'s gain is what gives it hertz, and it is the "envelope amount" knob
 * on every front panel since the Minimoog. Chapter 3 built that knob; this page
 * points it at a ladder.
 *
 * The diagram leaves the `Lfo` out. The kit draws one control cable per box, at
 * the box's centre, so a second modulator arriving at the same filter would be
 * drawn exactly on top of the first - two cables, one line. Ticket 10b.
 */

import {
  AdsrAmp,
  AdsrEnv,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  toFrequency,
  toMidi,
  VirtualAnalogFilter,
} from "synthlet";
import { definePatch } from "../define";

const FIRST_NOTE = "C3";

/** The floor the sweep starts from: closed enough to have somewhere to go. */
const BASE = 200;
/** Hz of cutoff at the top of the contour, before the LFO is added to it. */
const AMOUNT = 4000;
const DECAY = 0.4;
const RESONANCE = 0.7;
/** A wah, which is the middle of Reid's three zones. */
const LFO_RATE = 5;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(FIRST_NOTE)),
  });

  // `frequency` is a number here and a node twice below. A parameter given a
  // number keeps it and sums whatever is connected on top, so this 200 Hz is
  // the bottom of every sweep on the page rather than a starting position.
  const ladder = VirtualAnalogFilter(ac, {
    type: VirtualAnalogFilter.MOOG_LADDER,
    frequency: BASE,
    resonance: RESONANCE,
  });

  // One gate, two contours. That is what a synthesiser's keyboard has always
  // sent: the filter's envelope and the amplifier's are separate devices
  // reading the same timing signal, and they are shaped independently.
  const gate = Param(ac);
  const amp = AdsrAmp(ac, {
    gate,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.8,
    release: 0.3,
  });

  // `sustain: 0` on purpose: the classic analogue note is a sweep that falls
  // back to the floor while the key is still down, which is why it reads as a
  // pluck rather than as a pad.
  const env = AdsrEnv(ac, {
    gate,
    attack: 0.005,
    decay: DECAY,
    sustain: 0,
    release: 0.2,
  });
  const amount = Param.mul(ac, env, AMOUNT);
  amount.connect(ladder.frequency);

  // The second modulator, at the same parameter. `gain: 0` is off, so the page
  // arrives as an envelope sweep and the LFO is something the reader adds.
  const lfo = Lfo(ac, { type: LfoType.Sine, frequency: LFO_RATE, gain: 0 });
  lfo.connect(ladder.frequency);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  // Last and at zero; the analyser is before it, so a silent widget draws.
  const out = Gain.val(ac, 0);

  osc
    .connect(ladder)
    .connect(amp)
    .connect(analyser)
    .connect(level)
    .connect(out);

  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.value = toFrequency(toMidi(note));
      gate.input.value = 1;
    },
    off(note: string) {
      held.delete(note);
      // The last key up closes the gate, so a roll is one note and not a
      // stutter of half-finished releases.
      if (held.size === 0) gate.input.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [osc, ladder, gate, amp, env, amount, lfo, analyser, level],
    exposes: { osc, ladder, amp, env, amount, lfo, analyser, keys },
  });
}

export default definePatch({
  id: "filters/sweep",
  label: "The sweep",
  build,
  controls: [
    {
      id: "envAmount",
      kind: "slider",
      label: "Envelope amount",
      help: "How many hertz the contour is worth. At zero the filter never moves.",
      param: (s) => s.amount.gain,
      min: 0,
      max: 8000,
      unit: "Hz",
      default: AMOUNT,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "How long the sweep takes to fall back to the floor.",
      param: (s) => s.env.decay,
      min: 0.02,
      max: 2,
      scale: "time",
      unit: "s",
      default: DECAY,
    },
    {
      id: "lfoDepth",
      kind: "slider",
      label: "LFO depth",
      help: "How far the cutoff swings either side of wherever it is.",
      param: (s) => s.lfo.gain,
      min: 0,
      max: 4000,
      unit: "Hz",
      default: 0,
    },
    {
      id: "lfoRate",
      kind: "slider",
      label: "LFO rate",
      help: "Three zones: a tide near 0.1, a wah near 1, a growl near 15.",
      param: (s) => s.lfo.frequency,
      min: 0.1,
      max: 20,
      scale: "log",
      unit: "Hz",
      default: LFO_RATE,
    },
    {
      id: "resonance",
      kind: "slider",
      label: "Resonance",
      help: "How loud the corner is, and therefore how much of the sweep you hear.",
      param: (s) => s.ladder.resonance,
      min: 0,
      max: 1,
      step: 0.01,
      default: RESONANCE,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.keys.on(note),
      noteOff: (s) => (note) => s.keys.off(note),
      options: { from: "C2", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The floor, which is the one part of the cutoff that never moves. The
      // trace leaves it on every key and comes back to it, and that gap is the
      // envelope amount drawn rather than described.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => [s.ladder.frequency.value],
      },
    },
    { kind: "diagram" },
  ],
  /*
   * The envelope's path, which is the half of the patch a picture helps with.
   *
   * `amount` is a `Param` standing in a control cable, and it is drawn as its
   * own box because that is the thing the reader is turning: the envelope is
   * 0 to 1 and this is what makes it hertz. The keyboard hangs under the
   * envelope it gates, the way `amplifiers/env-amount` draws the same chain.
   */
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      {
        id: "ladder",
        label: "VirtualAnalogFilter",
        kind: "modifier",
        exposedAs: "ladder",
        controls: ["resonance"],
      },
      { id: "amp", label: "AdsrAmp", kind: "modifier", exposedAs: "amp" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "amount",
        label: "Param",
        kind: "controller",
        exposedAs: "amount",
        controls: ["envAmount"],
      },
      {
        id: "env",
        label: "AdsrEnv",
        kind: "controller",
        exposedAs: "env",
        controls: ["decay"],
      },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "ladder" },
      { from: "ladder", to: "amp" },
      { from: "amp", to: "out" },
      { from: "amount", to: "ladder", param: "frequency" },
      { from: "env", to: "amount", param: "input" },
      { from: "keys", to: "env", param: "gate" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
