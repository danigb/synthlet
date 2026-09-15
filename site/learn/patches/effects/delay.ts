/*
 * A pluck, a repeat, and the loop that turns one repeat into a row of them.
 *
 * Part 61 builds an echo unit out of three pictures. Figure 3 is a delay line
 * with a tap: one input, one late copy. Figure 8 adds the amplifier in the
 * feedback path that tape machines label *Regeneration*, which is the whole
 * difference between one echo and a row of them dying away. Figure 11 crosses
 * the two channels' feedback over each other, which is ping-pong.
 *
 * All three are one `DigitalDelay` here, because the module already carries
 * them: `feedback` is the regeneration amplifier, `cross` is the rotation
 * between the two lines, and `mix` carries the dry signal Reid has to draw as a
 * separate cable in Figure 4.
 *
 * The source is a pluck rather than a drone, and that is the pedagogy rather
 * than a preference: an echo you cannot hear the gap in is not an echo. A slow
 * clock triggers a Karplus-Strong string, each tail finishes before the next
 * pluck, and the repeats arrive in the space between.
 */

import { Clock, Compound, DigitalDelay, Gain, KarplusStrong } from "synthlet";
import { definePatch } from "../define";

/** Slow enough that a tail finishes before the next pluck lands on it. */
const BPM = 60;
/** Narrow: the trigger is an edge, and the string only needs the rising one. */
const PULSE_WIDTH = 0.02;

const FREQUENCY = 220;
const DECAY = 1.2;
const BRIGHTNESS = 0.6;

const TIME = 0.3;
const FEEDBACK = 0.35;
const MIX = 0.45;
const CROSS = 0;
/** Negative is a tilt down: each generation of the repeat is darker. */
const TONE = -0.2;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: PULSE_WIDTH });
  // `clock.gate`, not the clock node: the node is a rising phase ramp, which
  // never falls, so a string driven from it would be plucked once and never
  // again (`modulation/sample-hold.ts` has the long version).
  const pluck = KarplusStrong(ac, {
    trigger: clock.gate,
    frequency: FREQUENCY,
    decay: DECAY,
    brightness: BRIGHTNESS,
  });

  // One module, three of Reid's figures. `feedback` above 1 self-oscillates on
  // purpose and is held bounded by a soft limiter inside the loop, which is why
  // the slider below reaches 1.1 rather than stopping at 1: the runaway is a
  // destination, and the module already survives it. `cross` at 1 is full
  // ping-pong and is decay-neutral - the repeats change ears without getting
  // shorter, because the rotation preserves the loop's total gain.
  const delay = DigitalDelay(ac, {
    time: TIME,
    feedback: FEEDBACK,
    mix: MIX,
    cross: CROSS,
    tone: TONE,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  // Last and at zero; the analyser is before it, so a silent widget draws.
  const out = Gain.val(ac, 0);

  pluck.connect(delay).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [clock, pluck, delay, analyser, level],
    exposes: { clock, pluck, delay, analyser },
  });
}

export default definePatch({
  id: "effects/delay",
  label: "Echo, regeneration and ping-pong",
  build,
  controls: [
    {
      id: "rate",
      kind: "slider",
      label: "Pluck rate",
      help: "How often the string is struck. Slow enough to hear the gaps.",
      param: (s) => s.clock.bpm,
      min: 20,
      max: 120,
      unit: "bpm",
      default: BPM,
    },
    {
      id: "time",
      kind: "slider",
      label: "Time",
      help: "The distance between the heads, in Reid's tape analogy.",
      param: (s) => s.delay.time,
      min: 0.02,
      max: 1.2,
      scale: "time",
      unit: "s",
      default: TIME,
    },
    {
      id: "feedback",
      kind: "slider",
      label: "Feedback",
      help: "Regeneration: how much of the repeat is recorded again. Past 1 it sings.",
      param: (s) => s.delay.feedback,
      min: 0,
      max: 1.1,
      step: 0.01,
      default: FEEDBACK,
    },
    {
      id: "cross",
      kind: "slider",
      label: "Cross-feed",
      help: "0 is two independent lines; 1 is full ping-pong, at the same decay.",
      param: (s) => s.delay.cross,
      min: 0,
      max: 1,
      step: 0.01,
      default: CROSS,
    },
    {
      id: "mix",
      kind: "slider",
      label: "Mix",
      help: "Reid's Figure 4: how much of the original joins the repeats.",
      param: (s) => s.delay.mix,
      min: 0,
      max: 1,
      step: 0.01,
      default: MIX,
    },
    {
      id: "tone",
      kind: "slider",
      label: "Tone",
      help: "A tilt inside the loop, so each generation is darker or thinner.",
      param: (s) => s.delay.tone,
      min: -1,
      max: 1,
      step: 0.01,
      default: TONE,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Repeats",
      source: (s) => s.analyser,
      // The decaying row of repeats *is* the contour, and it is Reid's Figure
      // 14 drawn from the sound rather than by hand. Eight seconds is four
      // plucks at the default rate, which is long enough for a long feedback
      // setting to still be arriving when the next pluck lands.
      options: { window: "contour", seconds: 8 },
    },
    { kind: "meter", label: "Output" },
    { kind: "diagram", label: "The patch" },
  ],
  diagram: {
    nodes: [
      {
        id: "pluck",
        label: "KarplusStrong",
        kind: "source",
        exposedAs: "pluck",
      },
      {
        id: "delay",
        label: "DigitalDelay",
        kind: "modifier",
        exposedAs: "delay",
        controls: ["time", "feedback", "cross", "mix", "tone"],
      },
      { id: "out", label: "out", kind: "output" },
      {
        id: "clock",
        label: "Clock",
        kind: "controller",
        exposedAs: "clock",
        controls: ["rate"],
      },
    ],
    edges: [
      { from: "pluck", to: "delay" },
      { from: "delay", to: "out" },
      { from: "clock", to: "pluck", param: "trigger" },
    ],
  },
});
