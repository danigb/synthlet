/*
 * A string machine: eight detuned voices and the chorus that made them one.
 *
 * Parts 46 and 47 build the sound out of beating - 100 Hz against 101 Hz is
 * one beat a second - and then point out that a pulse-width-modulated wave
 * from a *single* oscillator already contains two pitches, one fixed and one
 * swinging around it. Two detuned PWM oscillators are therefore four, which is
 * why the tutorial voice's `strings` preset is a string section before any
 * effect is added at all.
 *
 * The cabinet at the end of it is in **Part 62**, not 46 or 47: the Solina's
 * three delay lines modulated at 0, 120 and 240 degrees by a pair of LFOs "one
 * running at around 1 Hz and the other at about 6 Hz", delay times 10 to
 * 50 ms. `Chorus`'s `Ensemble` voicing is that circuit, so the preset is still
 * the sound and the chorus is still the lesson.
 *
 * This is the one patch in the chapter that plays the tutorial voice, the way
 * `envelopes/gates.ts` does.
 */

import { Chorus, ChorusMode, Compound, Gain, Instrument } from "synthlet";
import { learnVoice } from "../../voice";
import { definePatch } from "../define";

/** Enough for the chord the lesson asks for. */
const VOICES = 8;
const PRESET = "strings";

const DEFAULT_DETUNE = 8;
const DEFAULT_PWM = 0.18;
const DEFAULT_ATTACK = 0.45;
const DEFAULT_MIX = 0.6;

/**
 * A fixed trim, after the analyser.
 *
 * Higher than the rest of the chapter's 0.125, because the source here is a
 * polyphonic instrument whose voices are already scaled by velocity and by the
 * pool size: at 0.125 one note measured twenty decibels below every other
 * widget in the chapter.
 */
const LEVEL = 0.4;

function build(ac: AudioContext) {
  const instrument = Instrument(ac, learnVoice, {
    voices: VOICES,
    preset: PRESET,
  });

  const chorus = Chorus(ac, {
    mode: ChorusMode.Ensemble,
    rate: 0.8,
    depth: 0.7,
    mix: DEFAULT_MIX,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  instrument.connect(chorus).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [instrument, chorus, analyser, level],
    // `ready` is the promise the kit waits on: an `Instrument`'s `params` are
    // empty until its worklets have registered, so a control read before it
    // resolves would find nothing there.
    exposes: { instrument, chorus, analyser, ready: instrument.ready },
  });
}

type Ensemble = ReturnType<typeof build>;

export default definePatch<Ensemble>({
  id: "recipes/ensemble",
  label: "Strings and ensemble",
  build,
  controls: [
    {
      id: "detuneFine",
      kind: "slider",
      label: "Fine detune",
      help: "How far the second oscillator sits from the first. A few cents is a section.",
      param: (s) => s.instrument.params.detuneFine,
      min: -50,
      max: 50,
      step: 1,
      unit: "cents",
      default: DEFAULT_DETUNE,
    },
    {
      id: "pulseWidthLfo",
      kind: "slider",
      label: "PWM depth",
      help: "One oscillator, two pitches: the width swings and the wave splits.",
      param: (s) => s.instrument.params.pulseWidthLfo,
      min: 0,
      max: 0.5,
      step: 0.01,
      default: DEFAULT_PWM,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "A section does not start together. Half a second is the string machine's.",
      param: (s) => s.instrument.params.attack,
      min: 0,
      max: 5,
      scale: "time",
      unit: "s",
      default: DEFAULT_ATTACK,
    },
    {
      id: "chorusMode",
      kind: "select",
      label: "Chorus",
      help: "Juno is two delays, Ensemble is the Solina's three, Dimension is the difference.",
      param: (s) => s.chorus.mode,
      options: ["Juno", "Ensemble", "Dimension"],
      default: ChorusMode.Ensemble,
    },
    {
      id: "chorusMix",
      kind: "slider",
      label: "Chorus mix",
      help: "Dry at zero. The cabinet is most of what people mean by a string machine.",
      param: (s) => s.chorus.mix,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_MIX,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note, velocity) => {
        s.instrument.start({ note, velocity });
      },
      noteOff: (s) => (note) => {
        s.instrument.stop(note);
      },
    },
    { kind: "spectrum", label: "Spectrum", source: (s) => s.analyser },
    { kind: "meter", label: "Level" },
    { kind: "diagram", label: "The patch" },
  ],
  // Three boxes and one line: a voice, a cabinet, the speaker. The keyboard is
  // not drawn because an `Instrument` takes notes through `start()` rather than
  // through a parameter, and a control edge has to name a port that exists.
  diagram: {
    nodes: [
      {
        id: "instrument",
        label: "Instrument",
        kind: "source",
        exposedAs: "instrument",
        controls: ["detuneFine", "pulseWidthLfo", "attack"],
      },
      {
        id: "chorus",
        label: "Chorus",
        kind: "modifier",
        exposedAs: "chorus",
        controls: ["chorusMode", "chorusMix"],
      },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [
      { from: "instrument", to: "chorus" },
      { from: "chorus", to: "out" },
    ],
  },
});
