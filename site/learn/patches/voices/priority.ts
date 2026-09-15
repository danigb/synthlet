/*
 * One voice, four keys down, and the question every monosynth has to answer.
 *
 * Part 18: a monophonic instrument with more than one key held has to pick.
 * The Minimoog plays the lowest note, a Korg 700 the highest, an ARP the last
 * one pressed. None of them is right - they are four different instruments to
 * play, and the drone trick (hold a low note, play a melody above it, and let
 * go of the melody to fall back to the drone) only works on the one that
 * chooses the lowest.
 *
 * `legato` is the other half of the same decision. Off, every note change
 * retriggers both envelopes - multi-triggering, the ARP way. On, the gate
 * stays high while any key is held, so a note change inside a phrase moves the
 * pitch and leaves the attack alone. That is what people mean when they call a
 * Minimoog line "smooth".
 *
 * Both are *preset* options rather than instrument settings, because a bass
 * sound is its priority in the way a lead sound is its glide - so the live path
 * is a read-modify-write of the preset, which is also what this lesson is
 * pointing at.
 */

import { Compound, Gain, Instrument, PRIORITY_NAMES } from "synthlet";
import { learnVoice } from "../../voice";
import { definePatch, type ValueRef } from "../define";

/** `PRIORITY_NAMES` is `["last", "low", "high", "first"]`, in that order. */
const LABELS = ["Last", "Lowest", "Highest", "First"];

const PRESET = "lead";
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const instrument = Instrument(ac, learnVoice, {
    voices: 1,
    preset: PRESET,
    priority: "last",
    legato: false,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  instrument.connect(analyser).connect(level).connect(out);

  // `priority` and `legato` have no fan-out node and no `AudioParam`: they are
  // applied by the allocator, and `setPreset` is the only thing that reaches
  // them. `getPreset()` is complete and JSON-shaped, so this is a read, one
  // key changed, and a write back.
  const priority: ValueRef = {
    get value() {
      return Math.max(
        0,
        PRIORITY_NAMES.indexOf(instrument.getPreset().priority ?? "last"),
      );
    },
    set value(next: number) {
      const at = Math.min(
        PRIORITY_NAMES.length - 1,
        Math.max(0, Math.round(next)),
      );
      const preset = instrument.getPreset();
      instrument.setPreset({ ...preset, priority: PRIORITY_NAMES[at] });
    },
  };

  const legato: ValueRef = {
    get value() {
      return instrument.getPreset().legato ? 1 : 0;
    },
    set value(next: number) {
      const preset = instrument.getPreset();
      instrument.setPreset({ ...preset, legato: next > 0.5 });
    },
  };

  return Compound({
    output: out,
    owns: [instrument, analyser, level],
    exposes: {
      instrument,
      analyser,
      priority,
      legato,
      // `Instrument.params` is empty until its worklets are registered, and the
      // kit reads no accessor before this resolves.
      ready: instrument.ready,
    },
  });
}

export default definePatch({
  id: "voices/priority",
  label: "Note priority and legato",
  build,
  controls: [
    {
      id: "priority",
      kind: "select",
      label: "Priority",
      help: "Which of the held notes the one voice sounds.",
      param: (s) => s.priority,
      options: LABELS,
      default: 0,
    },
    {
      id: "legato",
      kind: "toggle",
      label: "Legato",
      help: "On holds the gate high across a phrase: one attack, many notes.",
      param: (s) => s.legato,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      options: { from: "C3", octaves: 2 },
      noteOn: (s) => (note, velocity) => {
        s.instrument.start({ note, velocity });
      },
      noteOff: (s) => (note) => {
        s.instrument.stop(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
  ],
});
