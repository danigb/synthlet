/*
 * The "envelope amount" knob, which is an amplifier standing in a control
 * cable.
 *
 * A contour generator's output is 0 to 1 whatever its knobs say, so something
 * has to decide how much of it arrives at the filter - and Reid's Figure 10 is
 * that something: a VCA between the envelope and the cutoff, with an attenuator
 * on it. Every synth has this knob and almost nobody notices it is the same
 * module as the one in the audio path.
 *
 * Here it is `Param.mul`, whose `gain` is the knob and whose output is added to
 * the filter's own cutoff - so the two sliders are the bottom of the sweep and
 * how far above it the sweep goes.
 */

import {
  AdsrAmp,
  AdsrEnv,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const LEVEL = 0.125;
const FIRST_NOTE = "C3";

/** Closed enough that the envelope has somewhere to go. */
const CUTOFF = 200;
/** Hz of cutoff at the top of the contour. */
const AMOUNT = 2500;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(FIRST_NOTE)),
  });
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: 4,
  });
  // A plain gate on the amplifier: this page is about the filter's contour, so
  // the loudness has none of its own to confuse it with.
  const amp = AdsrAmp(ac, {
    attack: 0.004,
    decay: 0,
    sustain: 1,
    release: 0.15,
  });

  const env = AdsrEnv(ac, {
    attack: 0.01,
    decay: 0.45,
    sustain: 0.1,
    release: 0.25,
  });
  // The VCA in the control path. `gain` is the attenuator on Reid's figure and
  // the "envelope amount" on every front panel since.
  const amount = Param.mul(ac, env, AMOUNT);
  amount.connect(filter.frequency);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc
    .connect(filter)
    .connect(amp)
    .connect(analyser)
    .connect(level)
    .connect(out);

  // Two gates from one key, which is what a synth's keyboard has always sent:
  // the amplifier's contour and the filter's are separate devices reading the
  // same timing signal.
  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.value = toFrequency(toMidi(note));
      env.gate.value = 1;
      amp.gate.value = 1;
    },
    off(note: string) {
      held.delete(note);
      if (held.size > 0) return;
      env.gate.value = 0;
      amp.gate.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [osc, filter, amp, env, amount, analyser, level],
    exposes: { osc, filter, amp, env, amount, analyser, keys },
  });
}

export default definePatch({
  id: "amplifiers/env-amount",
  label: "Envelope amount",
  build,
  controls: [
    {
      id: "amount",
      kind: "slider",
      label: "Envelope amount",
      help: "How much of the contour reaches the cutoff. At zero the filter never moves.",
      param: (s) => s.amount.gain,
      min: 0,
      max: 6000,
      unit: "Hz",
      default: AMOUNT,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "Where the filter sits before the envelope adds anything.",
      param: (s) => s.filter.frequency,
      min: 60,
      max: 8000,
      scale: "log",
      unit: "Hz",
      default: CUTOFF,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.keys.on(note),
      noteOff: (s) => (note) => s.keys.off(note),
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    { kind: "diagram" },
  ],
  /*
   * Reid's Figure 10, with the audio path across the top and the control path
   * hanging under the box it arrives at. The order of the nodes below is the
   * order of the rows: `amount` under the filter, `env` under `amount`, the
   * keys under that - the control chain read bottom to top.
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
        id: "filter",
        label: "Svf",
        kind: "modifier",
        exposedAs: "filter",
        controls: ["cutoff"],
      },
      { id: "amp", label: "AdsrAmp", kind: "modifier", exposedAs: "amp" },
      { id: "out", label: "out", kind: "output" },
      // A modifier, not a controller: it is an amplifier, and which of the two
      // a module is depends on where its output goes and nothing else. That is
      // the lesson. Its knob is called `amount` and so is its exposes key, so
      // nothing declares the tie twice.
      { id: "amount", label: "Param", kind: "modifier", exposedAs: "amount" },
      { id: "env", label: "AdsrEnv", kind: "controller", exposedAs: "env" },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "filter" },
      { from: "filter", to: "amp" },
      { from: "amp", to: "out" },
      { from: "amount", to: "filter", param: "frequency" },
      { from: "env", to: "amount", param: "input" },
      { from: "keys", to: "env", param: "gate" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
