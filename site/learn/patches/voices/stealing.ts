/*
 * Four voices, five fingers.
 *
 * Part 21: a polyphonic instrument has a fixed number of voices, and the
 * interesting question is not how many but what happens when they run out.
 * `protect` refuses - the fifth note does not sound, and the four you are
 * holding are safe. `lru` takes the oldest sounding voice, which is what nearly
 * everything does. `mru` takes the newest, which sounds like a stutter and is
 * occasionally what you want. `drop` refuses too, and differs from `protect` in
 * what it does with a voice that is only *releasing*.
 *
 * A long release is what makes this audible: with 1.2 seconds of tail, four
 * notes are still sounding well after your fingers left, so a fifth note has to
 * decide about them.
 *
 * **A pool is chosen when it is built.** `voices` and `steal` are read once, at
 * construction, and there is no setter for either - so changing one here builds
 * a second instrument and carries the sound across with `getPreset()`. A note
 * in flight stops when that happens. That is not a limitation being hidden: it
 * is what a voice pool is, and the alternative would be a pool that reallocates
 * itself under a held chord.
 *
 * Nothing exposes the instrument node, because `Compound` is `Object.assign`
 * and would freeze the first one's reference. Every control reaches it through
 * a stable accessor that reads the closure.
 */

import { Compound, Gain, Instrument, STEAL_NAMES } from "synthlet";
import type { StealModeName } from "synthlet";
import { learnVoice } from "../../voice";
import { definePatch, type ValueRef } from "../define";

const PRESET = "strings";

const VOICES = 4;
const MIN_VOICES = 2;
const MAX_VOICES = 4;

/** `STEAL_NAMES` is `["protect", "lru", "mru", "drop"]`, in that order. */
const LABELS = ["Protect", "LRU — oldest", "MRU — newest", "Drop"];

/** Long, so four notes are still sounding when the fifth arrives. */
const RELEASE = 1.2;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  analyser.connect(level).connect(out);

  let voices = VOICES;
  let steal: StealModeName = "protect";
  let release = RELEASE;

  let instrument = Instrument(ac, learnVoice, {
    voices,
    steal,
    preset: PRESET,
  });
  instrument.connect(analyser);
  const first = instrument.ready;
  void first.then(() => {
    instrument.params.release.setValueAtTime(release, ac.currentTime);
  });

  function rebuild(next: { voices?: number; steal?: StealModeName }) {
    const preset = instrument.getPreset();
    const previous = instrument;
    voices = next.voices ?? voices;
    steal = next.steal ?? steal;
    instrument = Instrument(ac, learnVoice, { voices, steal, preset });
    instrument.connect(analyser);
    // The old pool goes when the new one is up, so there is never a moment
    // with no instrument at all.
    void instrument.ready.then(() => previous.dispose());
  }

  const voicesRef: ValueRef = {
    get value() {
      return voices;
    },
    set value(next: number) {
      const wanted = Math.min(
        MAX_VOICES,
        Math.max(MIN_VOICES, Math.round(next)),
      );
      if (wanted === voices) return;
      rebuild({ voices: wanted });
    },
  };

  const stealRef: ValueRef = {
    get value() {
      return Math.max(0, STEAL_NAMES.indexOf(steal));
    },
    set value(next: number) {
      const at = Math.min(
        STEAL_NAMES.length - 1,
        Math.max(0, Math.round(next)),
      );
      if (STEAL_NAMES[at] === steal) return;
      rebuild({ steal: STEAL_NAMES[at] });
    },
  };

  // The shadow value is what the knob reads while a rebuilt pool is still
  // registering its worklets; the preset carries the real one across.
  const releaseRef: ValueRef = {
    get value() {
      return instrument.params.release?.value ?? release;
    },
    set value(next: number) {
      release = next;
      instrument.params.release?.setValueAtTime(next, ac.currentTime);
    },
  };

  const keys = {
    on(note: string, velocity: number) {
      instrument.start({ note, velocity });
    },
    off(note: string) {
      instrument.stop(note);
    },
  };

  return Compound({
    output: out,
    owns: [
      analyser,
      level,
      // Whichever instrument is current when the reader navigates away.
      () => instrument.dispose(),
    ],
    exposes: {
      analyser,
      keys,
      voices: voicesRef,
      steal: stealRef,
      release: releaseRef,
      // The *first* pool's promise. Later ones queue their own notes.
      ready: first,
    },
  });
}

export default definePatch({
  id: "voices/stealing",
  label: "Voice stealing",
  build,
  controls: [
    {
      id: "voices",
      kind: "slider",
      label: "Voices",
      help: "How many notes can sound at once. Changing it builds a new pool.",
      param: (s) => s.voices,
      min: MIN_VOICES,
      max: MAX_VOICES,
      step: 1,
      default: VOICES,
    },
    {
      id: "steal",
      kind: "select",
      label: "When they run out",
      help: "Which sounding voice the next note is allowed to take.",
      param: (s) => s.steal,
      options: LABELS,
      default: 0,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "Long enough that released notes are still using their voices.",
      param: (s) => s.release,
      min: 0,
      max: 4,
      scale: "time",
      unit: "s",
      default: RELEASE,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      options: { from: "C3", octaves: 2 },
      noteOn: (s) => (note, velocity) => {
        s.keys.on(note, velocity);
      },
      noteOff: (s) => (note) => {
        s.keys.off(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
  ],
});
