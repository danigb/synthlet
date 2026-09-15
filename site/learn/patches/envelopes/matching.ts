/*
 * Four contours from Part 3's Figure 5, and four sliders to hit them with.
 *
 * The exercise is the whole lesson, so the patch is two copies of the tutorial
 * voice: the reader's, whose amplifier envelope is the four sliders, and the
 * model's, which is loaded from `learn/voice`'s preset bank. One keyboard
 * reaches whichever the **Hear the target** switch points at, so both sounds
 * are played on the same keys at the same pitch - which is the only way a
 * comparison by ear means anything.
 *
 * Two instruments rather than one that swaps its own envelope, because a
 * slider whose value is not the sound it is next to is a slider that lies.
 */

import { Compound, Gain, Instrument } from "synthlet";
import { learnVoice } from "../../voice";
import { definePatch } from "../define";

/** Enough for a phrase. Two instruments at once is enough worklets already. */
const VOICES = 3;

/** Part 3's organ, trombone and thunderclap, and Part 54's flute. */
const TARGETS = [
  "envelope-organ",
  "envelope-trombone",
  "envelope-thunderclap",
  "envelope-flute",
];
const TARGET_NAMES = ["Organ", "Trombone", "Thunderclap", "Flute"];

/**
 * Where the reader starts: on and off, and no shape at all.
 *
 * It is the organ preset, which means the first of the four targets is already
 * matched when the page loads - and the lesson says so, because "a rectangle is
 * an envelope too" is the point the organ makes.
 */
const START = "envelope-organ";

function build(ac: AudioContext) {
  const mine = Instrument(ac, learnVoice, { voices: VOICES, preset: START });
  const model = Instrument(ac, learnVoice, {
    voices: VOICES,
    preset: TARGETS[0],
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  const out = Gain.val(ac, 0);
  mine.connect(analyser);
  model.connect(analyser);
  analyser.connect(out);

  let comparing = 0;
  let chosen = 0;

  /** Whichever instrument the keys are pointed at. */
  const sounding = () => (comparing ? model : mine);

  const keys = {
    on(note: string, velocity: number) {
      sounding().start({ note, velocity });
    },
    off(note: string) {
      sounding().stop(note);
    },
  };

  // Choosing a target loads it into the model. A preset is complete, so this
  // never inherits anything from the target before it.
  const target = {
    get value() {
      return chosen;
    },
    set value(index: number) {
      chosen = Math.min(TARGETS.length - 1, Math.max(0, Math.round(index)));
      model.setPreset(TARGETS[chosen]);
    },
  };

  // And the switch that decides which of the two the keys reach. Whatever was
  // sounding belongs to the instrument the keys are leaving, so it is stopped.
  const compare = {
    get value() {
      return comparing;
    },
    set value(on: number) {
      sounding().stop();
      comparing = on ? 1 : 0;
    },
  };

  return Compound({
    output: out,
    owns: [mine, model, analyser],
    // Two instruments, so two sets of worklets to wait for: the kit reads no
    // accessor - and `params` is empty - until this resolves.
    exposes: {
      mine,
      model,
      analyser,
      keys,
      target,
      compare,
      ready: Promise.all([mine.ready, model.ready]),
    },
  });
}

type Matching = ReturnType<typeof build>;

export default definePatch<Matching>({
  id: "envelopes/matching",
  label: "Match the envelope",
  build,
  controls: [
    {
      id: "target",
      kind: "select",
      label: "Target",
      help: "The contour to aim at.",
      param: (s) => s.target,
      options: TARGET_NAMES,
      default: 0,
    },
    {
      id: "compare",
      kind: "toggle",
      label: "Hear the target",
      help: "Point the keys at the target instead of at your own sound.",
      param: (s) => s.compare,
      default: 0,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      param: (s) => s.mine.params.attack,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: 0.004,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      param: (s) => s.mine.params.decay,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: 0,
    },
    {
      id: "sustain",
      kind: "slider",
      label: "Sustain",
      param: (s) => s.mine.params.sustain,
      min: 0,
      max: 1,
      default: 1,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      param: (s) => s.mine.params.release,
      min: 0,
      max: 3,
      scale: "time",
      unit: "s",
      default: 0.03,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note, velocity) => s.keys.on(note, velocity),
      noteOff: (s) => (note) => s.keys.off(note),
    },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 3 },
    },
  ],
});
