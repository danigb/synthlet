/*
 * A plucked string, and the chapter Synth Secrets could not finish.
 *
 * Part 30 ends with a verdict: "you can not create authentic-sounding acoustic
 * guitar patches using analogue subtractive synthesis". Reid is right, and the
 * reason this patch exists is that `KarplusStrong` is not subtractive
 * synthesis - it is a delay line with a loss in it, which is what a string
 * physically is.
 *
 * Every knob here is one of Parts 28 to 30's own observations, turned into a
 * parameter that was not available to a Minimoog:
 *
 * - **position** is Smith 3.2's comb, `1 - z^-floor(beta*P)`, whose first
 *   notch lands at `f0/position`. Reid's Part 28 is the same arithmetic from
 *   the other end: pluck a string a third of the way along and every third
 *   harmonic is missing; a quarter of the way and every fourth. Sliding the
 *   pick along the string is *"a swept comb filter"*, in his words, and the
 *   spectrum marks below stand on the notches so you can watch them move.
 * - **pickAngle** is Smith 3.1: up-picks and down-picks meet the string at
 *   different angles and therefore with different stiffness.
 * - **stiffness** is the dispersion filter, which is what separates a piano
 *   or a clavinet from a comb - and the reason a stiff string goes sharp at
 *   the top rather than staying harmonic.
 *
 * One module, one line, and the lesson is its knobs.
 */

import { Compound, Gain, KarplusStrong, toFrequency, toMidi } from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "A3";
const DEFAULT_POSITION = 0.13;
const DEFAULT_BRIGHTNESS = 0.6;
const DEFAULT_DECAY = 2;

/** How hard the string is plucked. The comb's peak gain is 2, so leave room. */
const PLUCK_LEVEL = 0.8;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const ks = KarplusStrong(ac, {
    frequency: toFrequency(toMidi(DEFAULT_NOTE)),
    decay: DEFAULT_DECAY,
    brightness: DEFAULT_BRIGHTNESS,
    level: PLUCK_LEVEL,
    position: DEFAULT_POSITION,
    pickAngle: 0,
    stiffness: 0,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  ks.connect(analyser).connect(level).connect(out);

  const play = (note: string) => {
    const now = ac.currentTime;
    ks.frequency.setValueAtTime(toFrequency(toMidi(note)), now);
    // The rising-edge contract, spelled out: a pulse, never `setTargetAtTime`.
    // A signal that asymptotes towards zero never reaches it, so the gate
    // would never re-arm and the second note would not sound.
    ks.trigger.cancelScheduledValues(now);
    ks.trigger.setValueAtTime(1, now);
    ks.trigger.setValueAtTime(0, now + 0.005);
  };

  // Nothing. A plucked string is not gated: it decays because the loop loses
  // energy, and letting go of the key is not what stops it.
  const stop = () => {};

  return Compound({
    output: out,
    owns: [ks, analyser, level],
    exposes: { ks, analyser, play, stop },
  });
}

export default definePatch({
  id: "recipes/pluck",
  label: "Plucked strings",
  build,
  controls: [
    {
      id: "position",
      kind: "slider",
      label: "Pick position",
      help: "Where along the string. 0.25 empties every fourth harmonic; 0 is the bridge and no comb at all.",
      param: (s) => s.ks.position,
      min: 0,
      max: 0.5,
      step: 0.01,
      default: DEFAULT_POSITION,
    },
    {
      id: "pickAngle",
      kind: "slider",
      label: "Pick angle",
      help: "How bluntly the pick meets the string. It dulls the attack and leaves the level alone.",
      param: (s) => s.ks.pickAngle,
      min: 0,
      max: 0.9,
      step: 0.01,
      default: 0,
    },
    {
      id: "brightness",
      kind: "slider",
      label: "Brightness",
      help: "The tilt of the loss in the loop: how much faster the high partials die than the low ones.",
      param: (s) => s.ks.brightness,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_BRIGHTNESS,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "Seconds to sixty decibels down, at every pitch.",
      param: (s) => s.ks.decay,
      min: 0.01,
      max: 5,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "stiffness",
      kind: "slider",
      label: "Stiffness",
      help: "Bending stiffness: the high partials travel faster and the string stops being harmonic.",
      param: (s) => s.ks.stiffness,
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => () => s.stop(),
      options: { from: "C2", octaves: 3 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The comb's first three notches, drawn. At `position: 0.25` the first
      // one stands on the fourth harmonic, which is the hole Part 28 predicts.
      options: {
        marks: (s) => {
          const f = s.ks.frequency.value;
          const p = s.ks.position.value;
          return p > 0 ? [f / p, (2 * f) / p, (3 * f) / p] : [];
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
    { kind: "diagram", label: "The patch" },
  ],
  diagram: {
    nodes: [
      {
        id: "ks",
        label: "KarplusStrong",
        kind: "source",
        exposedAs: "ks",
        controls: ["position", "pickAngle", "brightness", "decay", "stiffness"],
      },
      { id: "out", label: "out", kind: "output" },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "ks", to: "out" },
      { from: "keys", to: "ks", param: "frequency" },
    ],
  },
});
