/*
 * A flute, and the pan pipe that is the same tube closed at one end.
 *
 * Part 54's flute is the shortest recipe in the book and the one most people
 * get wrong: a sawtooth, a fixed high-pass, a fixed low-pass at 2 kHz "no
 * matter what note is played", and a modulator that goes to the *cutoff* and
 * nowhere else. Reid's italicised rule is that a flute does not get louder or
 * softer as the player blows harder - it gets brighter or duller - so this
 * patch has no tremolo and no vibrato at all, and the one LFO in it lands on
 * `lp.frequency`.
 *
 * Two of the numbers are his and one is not. 2 kHz is Part 54's own figure.
 * The high-pass is only ever given as "in the region of a few hundred Hertz",
 * so 300 is this patch's choice and the lesson says so.
 *
 * The pan pipe is the same air column stopped at the bottom, which means **odd
 * harmonics only** (Part 52) - so it cannot be a filtered sawtooth and it is
 * not `harmonic(6)` either. It is a hand-written mode table of the first six
 * odd partials in one `ModalResonator`, which is Reid's practical answer -
 * "just six bands on the edge of self-oscillation" - as one node.
 *
 * No diagram: two sources into a mixer land in the same cell of
 * `layoutDiagram`'s grid, so the picture this lesson wants cannot be drawn
 * yet. Ticket 13b carries the evidence.
 */

import {
  AdAmp,
  AdsrAmp,
  Compound,
  Gain,
  Lfo,
  LfoType,
  ModalResonator,
  Noise,
  NoiseType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
  type ResonatorMode,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "C5";

/** Reid gives "a few hundred Hertz" and no figure. This one is the patch's. */
const HIGH_PASS = 300;
/** Part 54's own number, and fixed: it does not follow the key. */
const LOW_PASS = 2000;

/** The middle of Reid's "5 to 6 Hz", and it moves the cutoff, not the pitch. */
const LFO_RATE = 5.5;
const DEFAULT_LFO_DEPTH = 300;
const DEFAULT_CHIFF = 0.4;
const DEFAULT_RELEASE = 0.06;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

/**
 * How much noise the resonator gets.
 *
 * A `ModalResonator` is normalised for a *strike*: held input is amplified by
 * the resonance, so anything that is not an impulse wants a gain in front of
 * it. The node's own documentation says so.
 */
const PIPE_LEVEL = 0.02;

/**
 * A pipe closed at one end, as a mode table.
 *
 * Odd partials and nothing else, which is why the pan pipe reads as a
 * triangle or a square rather than as the sawtooth the flute is built from.
 * The levels and decays are this patch's; the series is physics.
 */
const PAN_PIPE: ResonatorMode[] = [
  { ratio: 1, level: 0.5, decay: 1 },
  { ratio: 3, level: 0.28, decay: 0.85 },
  { ratio: 5, level: 0.18, decay: 0.7 },
  { ratio: 7, level: 0.12, decay: 0.6 },
  { ratio: 9, level: 0.08, decay: 0.5 },
  { ratio: 11, level: 0.05, decay: 0.4 },
];

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));

  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start,
  });
  const oscGain = Gain.val(ac, 1);

  const noise = Noise(ac, { type: NoiseType.White });
  // Reid recommends *against* breath noise on a flute in as many words, so the
  // knob exists at zero: it is there to let the reader disagree with him.
  const breath = Gain.val(ac, 0);

  // "Perhaps the most defining characteristic of the instrument" (Part 53):
  // the puff of air before the tone arrives. Two nodes.
  const chiffAmp = AdAmp(ac, {
    attack: 0.002,
    decay: 0.06,
    gain: DEFAULT_CHIFF,
  });

  const pipeGain = Gain.val(ac, 0);
  const pipes = ModalResonator(ac, {
    frequency: start,
    decay: 0.25,
    brightness: 0.6,
    modes: PAN_PIPE,
    maxModes: 8,
  });

  const mix = Gain.val(ac, 1);
  const hp = Svf(ac, {
    type: SvfType.HighPass,
    frequency: HIGH_PASS,
    Q: Math.SQRT1_2,
  });
  const lp = Svf(ac, { type: SvfType.LowPass, frequency: LOW_PASS, Q: 1.2 });

  // One gate for the amplifier and for the modulation's own fade-in, so the
  // brightness wobble arrives a moment after the note the way a player's does.
  const gate = Param(ac);
  const amp = AdsrAmp(ac, {
    gate,
    attack: 0.09,
    decay: 0.12,
    sustain: 0.9,
    release: DEFAULT_RELEASE,
  });
  const lfo = Lfo(ac, {
    type: LfoType.Sine,
    frequency: LFO_RATE,
    gain: DEFAULT_LFO_DEPTH,
    attack: 0.5,
    gate,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(oscGain).connect(mix);
  noise.connect(breath).connect(mix);
  noise.connect(chiffAmp).connect(mix);
  noise.connect(pipeGain).connect(pipes).connect(mix);
  mix.connect(hp).connect(lp).connect(amp);
  amp.connect(analyser).connect(level).connect(out);
  // The whole of the modulation: a sine on the corner and on nothing else.
  lfo.connect(lp.frequency);

  let pipe = 0;
  const panpipe = {
    get value() {
      return pipe;
    },
    set value(next: number) {
      pipe = next ? 1 : 0;
      const now = ac.currentTime;
      oscGain.gain.setTargetAtTime(pipe ? 0 : 1, now, CROSSFADE);
      pipeGain.gain.setTargetAtTime(pipe ? PIPE_LEVEL : 0, now, CROSSFADE);
    },
  };

  const held = new Set<string>();
  const play = (note: string) => {
    held.add(note);
    const frequency = toFrequency(toMidi(note));
    osc.frequency.value = frequency;
    pipes.frequency.value = frequency;
    gate.input.value = 1;
    // A gate, not a ramp: `setTargetAtTime` never reaches zero, so a trigger
    // driven that way would never re-arm.
    const now = ac.currentTime;
    chiffAmp.trigger.cancelScheduledValues(now);
    chiffAmp.trigger.setValueAtTime(1, now);
    chiffAmp.trigger.setValueAtTime(0, now + 0.005);
  };
  const stop = (note: string) => {
    held.delete(note);
    if (held.size === 0) gate.input.value = 0;
  };

  return Compound({
    output: out,
    owns: [
      osc,
      oscGain,
      noise,
      breath,
      chiffAmp,
      pipeGain,
      pipes,
      mix,
      hp,
      lp,
      gate,
      amp,
      lfo,
      analyser,
      level,
    ],
    exposes: {
      osc,
      oscGain,
      noise,
      breath,
      chiffAmp,
      pipeGain,
      pipes,
      hp,
      lp,
      amp,
      lfo,
      analyser,
      panpipe,
      play,
      stop,
    },
  });
}

export default definePatch({
  id: "recipes/flute",
  label: "Flute and pan pipes",
  build,
  controls: [
    {
      id: "breath",
      kind: "slider",
      label: "Breath",
      help: "Noise in the tone. Reid thinks this is a mistake; the knob lets you disagree.",
      param: (s) => s.breath.gain,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
    },
    {
      id: "chiff",
      kind: "slider",
      label: "Chiff",
      help: "The puff of air at the start of the note, and nowhere else in it.",
      param: (s) => s.chiffAmp.gain,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_CHIFF,
    },
    {
      id: "lfoDepth",
      kind: "slider",
      label: "Brightness modulation",
      help: "How far the 2 kHz corner moves at 5.5 Hz. The only modulation here.",
      param: (s) => s.lfo.gain,
      min: 0,
      max: 2000,
      step: 10,
      unit: "Hz",
      default: DEFAULT_LFO_DEPTH,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "Too short and a legato line sucks between the notes.",
      param: (s) => s.amp.release,
      min: 0.01,
      max: 1,
      scale: "time",
      unit: "s",
      default: DEFAULT_RELEASE,
    },
    {
      id: "panpipe",
      kind: "toggle",
      label: "Pan pipe",
      help: "Swap the sawtooth for six tuned resonances, odd harmonics only.",
      param: (s) => s.panpipe,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.stop(note),
      options: { from: "C4", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The two fixed corners. Every flute spectrum in Part 54 is truncated at
      // the upper one, and it stays where it is whatever note you play.
      options: { marks: () => [HIGH_PASS, LOW_PASS] },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
