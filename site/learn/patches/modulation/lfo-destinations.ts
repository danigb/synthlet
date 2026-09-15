/*
 * One wobble, three places to send it.
 *
 * Part 10 opens with three effects that every book treats as three different
 * things - vibrato, tremolo, growl - and then points out that they are one
 * oscillator running too slowly to hear, plugged into three different sockets.
 * So this patch has one `Lfo` and one destination switch, because the lesson is
 * that the switch is the whole difference.
 *
 * It is also the patch chapter 5's second lesson uses, with the switch left
 * alone and the LFO's own shape, delay and fade-in revealed instead: the same
 * synth teaches "where does it go" and then "what does it do when it gets
 * there".
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

/** `LfoType`'s order, which is the index the parameter receives. */
const SHAPES = [
  "none",
  "sine",
  "triangle",
  "ramp up",
  "ramp down",
  "square",
  "exp ramp up",
  "exp ramp down",
  "exp triangle",
  "random",
  "impulse",
  "smooth random",
  "drift",
];

/** Pitch, loudness, brightness - Part 10's three, in Part 10's order. */
const DESTINATIONS = [
  "pitch (vibrato)",
  "loudness (tremolo)",
  "filter (growl)",
];

/**
 * What "depth 1" means at each destination.
 *
 * The knob is one number from 0 to 1 whichever socket it is plugged into, so
 * the three units live here: a semitone of pitch, most of the loudness, and
 * three kilohertz of cutoff. Without this the same knob would be unusable at
 * two of the three settings.
 */
const FULL = [100, 0.8, 3000];

const RATE = 5;
const DEPTH = 0.4;
const CUTOFF = 1200;
/** Enough resonance that a moving cutoff is audible as a growl, not a fade. */
const RESONANCE = 6;
/** Trimmed to about -18 dB, the level the chapter-1 patches settled on. */
const LEVEL = 0.12;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi("C3")),
  });
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: RESONANCE,
  });
  // Tremolo's own gain, at 1, so the modulation swings it either side of unity.
  // It is not the output gain below: the kit ramps that one on Play, and two
  // writers on one parameter fight.
  const tremolo = Gain.val(ac, 1);
  const amp = AdsrAmp(ac, {
    attack: 0.01,
    decay: 0.2,
    sustain: 1,
    release: 0.25,
  });

  // Bipolar and at unit depth: the three amounts below scale it, so the LFO
  // itself is the *shape* and nothing else.
  const lfo = Lfo(ac, { type: LfoType.Sine, frequency: RATE, gain: 1 });

  // Reid draws a VCA in every modulation path (Part 10, Figure 4) and these
  // are those VCAs: one per destination, all fed by the one LFO, and the
  // destination switch is which of them is open.
  const toPitch = Param.mul(ac, lfo, 0);
  const toTremolo = Param.mul(ac, lfo, 0);
  const toGrowl = Param.mul(ac, lfo, 0);
  toPitch.connect(osc.detune);
  toTremolo.connect(tremolo.gain);
  toGrowl.connect(filter.frequency);

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // A second analyser, on the LFO rather than on the audio: a scope of a 5 Hz
  // wave needs the longest window the node has, and the audio wants the
  // resolution. The two pictures are of two different signals on purpose.
  const lfoAnalyser = ac.createAnalyser();
  lfoAnalyser.fftSize = 32768;
  lfo.connect(lfoAnalyser);

  // Last and at zero, with the analyser before it: a silent widget still draws.
  const out = Gain.val(ac, 0);
  osc.connect(filter).connect(tremolo).connect(amp).connect(level);
  level.connect(analyser).connect(out);

  let destination = 0;
  let depth = DEPTH;
  const route = () => {
    toPitch.gain.value = destination === 0 ? depth * FULL[0] : 0;
    toTremolo.gain.value = destination === 1 ? depth * FULL[1] : 0;
    toGrowl.gain.value = destination === 2 ? depth * FULL[2] : 0;
  };
  route();

  // Not `AudioParam`s: one knob has to write three parameters and the other has
  // to remember which one of them is live. A plain accessor is all the kit
  // needs, and all it knows.
  const destinationRef = {
    get value() {
      return destination;
    },
    set value(next: number) {
      destination = Math.min(2, Math.max(0, Math.round(next)));
      route();
    },
  };
  const depthRef = {
    get value() {
      return depth;
    },
    set value(next: number) {
      depth = Math.min(1, Math.max(0, next));
      route();
    },
  };

  // Last-note priority, by hand: the set is what makes a legato release stop
  // the note only when the last finger leaves, and what keeps the LFO's own
  // gate high across a phrase so a delayed vibrato is not restarted mid-word.
  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.setValueAtTime(toFrequency(toMidi(note)), ac.currentTime);
      amp.gate.value = 1;
      lfo.gate.value = 1;
    },
    off(note: string) {
      held.delete(note);
      if (held.size > 0) return;
      amp.gate.value = 0;
      lfo.gate.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [osc, filter, tremolo, amp, lfo, toPitch, toTremolo, toGrowl, level],
    exposes: {
      osc,
      filter,
      tremolo,
      amp,
      lfo,
      analyser,
      lfoAnalyser,
      destination: destinationRef,
      depth: depthRef,
      keys,
    },
  });
}

export default definePatch({
  id: "modulation/lfo-destinations",
  label: "One LFO, three destinations",
  build,
  controls: [
    {
      id: "destination",
      kind: "select",
      label: "Destination",
      help: "Which socket the low-frequency oscillator is plugged into.",
      param: (s) => s.destination,
      options: DESTINATIONS,
      default: 0,
    },
    {
      id: "shape",
      kind: "select",
      label: "Shape",
      help: "The waveform the modulation itself is.",
      param: (s) => s.lfo.type,
      options: SHAPES,
      default: LfoType.Sine,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Rate",
      help: "How fast the wobble repeats. Below 20 Hz you hear it as movement.",
      param: (s) => s.lfo.frequency,
      min: 0.1,
      max: 20,
      scale: "log",
      unit: "Hz",
      default: RATE,
    },
    {
      id: "depth",
      kind: "slider",
      label: "Depth",
      help: "How far the modulation moves whatever it is plugged into.",
      param: (s) => s.depth,
      min: 0,
      max: 1,
      default: DEPTH,
    },
    {
      id: "delay",
      kind: "slider",
      label: "Delay",
      help: "How long a note waits before the modulation starts at all.",
      param: (s) => s.lfo.delay,
      min: 0,
      max: 3,
      scale: "time",
      unit: "s",
      default: 0,
    },
    {
      id: "fadeIn",
      kind: "slider",
      label: "Fade-in",
      help: "How long the modulation then takes to reach full depth.",
      param: (s) => s.lfo.attack,
      min: 0,
      max: 5,
      scale: "time",
      unit: "s",
      default: 0,
    },
  ],
  views: [
    // Keys as a view and not a control: a lesson that narrows the knobs down to
    // three still has to be playable.
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.keys.on(note),
      noteOff: (s) => (note) => s.keys.off(note),
      options: { octaves: 2, from: "C3" },
    },
    {
      kind: "scope",
      label: "The modulation",
      source: (s) => s.lfoAnalyser,
    },
    { kind: "spectrum", label: "The sound", source: (s) => s.analyser },
    { kind: "diagram" },
  ],
  /*
   * Reid's Figure 4, 7 and 10 at once.
   *
   * The three `Param` amounts are folded into the LFO's three cables rather
   * than drawn as three boxes: the picture's claim is where the modulation
   * arrives, and a box per destination would triple the width to say the same
   * thing. The knobs are marked on the LFO instead, which is where a reader
   * looking for them would point.
   */
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      { id: "filter", label: "Svf", kind: "modifier", exposedAs: "filter" },
      {
        id: "tremolo",
        label: "Gain",
        kind: "modifier",
        exposedAs: "tremolo",
      },
      { id: "amp", label: "AdsrAmp", kind: "modifier", exposedAs: "amp" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "lfo",
        label: "Lfo",
        kind: "controller",
        exposedAs: "lfo",
        controls: ["destination", "shape", "rate", "depth", "delay", "fadeIn"],
      },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "filter" },
      { from: "filter", to: "tremolo" },
      { from: "tremolo", to: "amp" },
      { from: "amp", to: "out" },
      { from: "lfo", to: "osc", param: "detune" },
      { from: "lfo", to: "tremolo", param: "gain" },
      { from: "lfo", to: "filter", param: "frequency" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
