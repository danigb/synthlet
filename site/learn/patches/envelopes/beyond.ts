/*
 * Two transients, added together, drawing a shape no ADSR can.
 *
 * Reid's spit brass goes 'psst', falls back, and then swells - and the level at
 * the end of the attack is not the loudest the note ever gets, which is exactly
 * the limitation a four-stage envelope cannot escape. Part 7's answer is a CV
 * mixer: two attack-decay contours on one destination, and the sum is a
 * four-stage shape whose corners are wherever you put them.
 *
 * `Param` is that mixer in one node - it adds `mod` to `input` before it does
 * anything else - and the amplifier the sum drives is a plain `Gain`, which is
 * the next chapter's subject arriving a page early.
 */

import {
  AdEnv,
  AdsrAmp,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const LEVEL = 0.125;
const FIRST_NOTE = "C3";

/** The fast contour: the 'psst' at the front of the note. */
const SPIT = 0.7;
const SPIT_DECAY = 0.14;
/** And the slow one, which arrives late and stays. */
const SWELL = 0.6;
const SWELL_LEVEL = 0.7;
const SWELL_DECAY = 8;

/** A player's vibrato: a few tens of cents, arriving after the note has. */
const VIBRATO_CENTS = 30;
const VIBRATO_RATE = 5.5;
const VIBRATO_DELAY = 0.8;
const VIBRATO_FADE = 0.4;

function build(ac: AudioContext) {
  // One gate, read by everything that has to know a key is down: the amplifier
  // envelope, both transient generators, and the vibrato's own depth ramp.
  const gate = Param(ac);

  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(FIRST_NOTE)),
  });

  // The body of the note is a trapezoid and nothing more - it says "the key is
  // down" and lets go when it comes up. All the shape is below.
  const amp = AdsrAmp(ac, {
    gate,
    attack: 0.004,
    decay: 0,
    sustain: 1,
    release: 0.15,
  });

  const spit = AdEnv(ac, {
    trigger: gate,
    attack: 0.004,
    decay: SPIT_DECAY,
    gain: SPIT,
  });
  const swell = AdEnv(ac, {
    trigger: gate,
    attack: SWELL,
    decay: SWELL_DECAY,
    gain: SWELL_LEVEL,
  });
  const contour = Param(ac, { input: spit, mod: swell });

  // The amplifier the sum drives. A native gain rather than `AdsrAmp`'s own
  // `gain` parameter, which is read once per 128-sample block: a four
  // millisecond spit through that is five steps and a click. This one is per
  // sample.
  const vca = Gain.val(ac, 0);
  contour.connect(vca.gain);

  const lfo = Lfo(ac, {
    type: LfoType.Sine,
    frequency: VIBRATO_RATE,
    gate,
    delay: VIBRATO_DELAY,
    attack: VIBRATO_FADE,
  });
  const depth = Gain.val(ac, VIBRATO_CENTS);
  lfo.connect(depth).connect(osc.detune);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(amp).connect(vca).connect(analyser).connect(level).connect(out);

  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.value = toFrequency(toMidi(note));
      gate.input.value = 1;
    },
    off(note: string) {
      held.delete(note);
      if (held.size === 0) gate.input.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [
      gate,
      osc,
      amp,
      spit,
      swell,
      contour,
      vca,
      lfo,
      depth,
      analyser,
      level,
    ],
    exposes: { osc, amp, spit, swell, contour, vca, lfo, analyser, keys },
  });
}

export default definePatch({
  id: "envelopes/beyond",
  label: "Two envelopes, one contour",
  build,
  controls: [
    {
      id: "spit",
      kind: "slider",
      label: "Spit",
      help: "How much of the fast contour reaches the amplifier.",
      param: (s) => s.spit.gain,
      min: 0,
      max: 1,
      default: SPIT,
    },
    {
      id: "swell",
      kind: "slider",
      label: "Swell",
      help: "How long the slow contour takes to arrive.",
      param: (s) => s.swell.attack,
      min: 0.02,
      max: 2,
      scale: "time",
      unit: "s",
      default: SWELL,
    },
    {
      id: "vibratoDelay",
      kind: "slider",
      label: "Vibrato delay",
      help: "How long the note waits before the vibrato begins to fade in.",
      param: (s) => s.lfo.delay,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: VIBRATO_DELAY,
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
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
  ],
});
