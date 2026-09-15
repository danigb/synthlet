/*
 * One voice, played faster than a pair of hands can let go.
 *
 * The tutorial voice at `voices: 1` is a monosynth, and a monosynth has to
 * decide what an overlapping note means. `legato` is that decision: off, every
 * note closes the gate and reopens it, so every note is articulated - the
 * Odyssey, which sends a trigger as well as a gate. On, the gate stays high
 * while any key is down and only the first note of a slurred run has an attack
 * - the Minimoog, which sends no trigger at all.
 *
 * It is an instrument option rather than a parameter: the allocator applies it,
 * so it has no fan-out node and nothing to write to. What it does have is a
 * seat in a preset, which is how this patch changes it live.
 */

import { Compound, Gain, Instrument } from "synthlet";
import { learnVoice } from "../../voice";
import { definePatch } from "../define";

/** Punch, then a held level: the shape that makes re-articulation audible. */
const PRESET = "decay-sustain";

function build(ac: AudioContext) {
  const instrument = Instrument(ac, learnVoice, {
    voices: 1,
    preset: PRESET,
    legato: false,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  const out = Gain.val(ac, 0);
  instrument.connect(analyser).connect(out);

  let on = 0;
  const legato = {
    get value() {
      return on;
    },
    set value(next: number) {
      on = next ? 1 : 0;
      // `glide`, `legato` and `priority` are the three keys a preset may carry
      // that are not parameters, so the way to change one on a running
      // instrument is to hand it back the sound it already has with that key
      // flipped. `getPreset()` reads the live values, so nothing is lost.
      instrument.setPreset({ ...instrument.getPreset(), legato: on === 1 });
    },
  };

  return Compound({
    output: out,
    owns: [instrument, analyser],
    exposes: { instrument, analyser, legato, ready: instrument.ready },
  });
}

type Gates = ReturnType<typeof build>;

export default definePatch<Gates>({
  id: "envelopes/gates",
  label: "One voice, one gate",
  build,
  controls: [
    {
      id: "legato",
      kind: "toggle",
      label: "Legato",
      help: "On: overlapping notes share one gate. Off: every note retriggers.",
      param: (s) => s.legato,
      default: 0,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "The louder the attack, the more obvious a retrigger is.",
      param: (s) => s.instrument.params.attack,
      min: 0,
      max: 1,
      scale: "time",
      unit: "s",
      default: 0.005,
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
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 3 },
    },
  ],
});
