/*
 * The same echo, made of tape and of buckets.
 *
 * Part 60's box asks the question this patch answers: given that a digital
 * delay and a bucket-brigade device are the same idea - store a slice of the
 * signal, hold it, pass it down a line at a rate a clock decides - why do they
 * sound so different? Reid's answer is that a BBD's every stage adds a little
 * error, and the errors accumulate, so nothing arrives at the far end unaltered.
 *
 * `AnalogDelay` is that answer as a module. `age` is the composite wear knob -
 * more wobble, more saturation, less bandwidth, more noise - and `wobble`
 * scales wow and flutter on top of whatever `age` already implies, because a
 * well-maintained machine with an eccentric capstan is a real combination that
 * one knob cannot express.
 *
 * The second half of the lesson is what happens when `time` moves. This module
 * *glides* the heads, so a moving delay time bends the pitch, which is what a
 * tape machine does and what `DigitalDelay` deliberately does not: that one
 * crossfades between read positions and preserves the pitch. Two modules, one
 * parameter, opposite behaviour, and the difference is the machine being
 * modelled rather than a quality setting.
 *
 * No `diagram`: this is `effects/delay`'s picture with a different box in the
 * middle, and a second copy of a drawing is a second statement that drifts.
 */

import {
  AnalogDelay,
  AnalogDelayMode,
  Clock,
  Compound,
  Gain,
  KarplusStrong,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 45;
const PULSE_WIDTH = 0.02;

const FREQUENCY = 196;
const DECAY = 1.5;
const BRIGHTNESS = 0.7;

const TIME = 0.35;
const FEEDBACK = 0.55;
const MIX = 0.5;
const AGE = 0.3;
const WOBBLE = 0.3;
const TAPS = 0;

const LEVEL = 0.125;

/**
 * `AnalogDelayMode`'s own order, as a list of names.
 *
 * The kit's select writes the option's *position* into the param, so position 0
 * is Tape because `AnalogDelayMode.Tape` is 0. A lookup table mapping names to
 * enum members would be a second statement of the same fact, and a second
 * statement is the one that drifts (`filters/shootout`'s rule).
 */
const MODES = ["Tape — heads at multiples of the time", "BBD — MN3011 heads"];

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: PULSE_WIDTH });
  const pluck = KarplusStrong(ac, {
    trigger: clock.gate,
    frequency: FREQUENCY,
    decay: DECAY,
    brightness: BRIGHTNESS,
  });

  // `taps` is a level envelope across the mode's fixed heads rather than a
  // selector, so it is meaningful in both modes: the tape machine's heads are
  // integer multiples of `time` and fade in as a rhythm, the BBD's (the
  // MN3011's six) are at irrational fractions and fade in as a wash.
  const delay = AnalogDelay(ac, {
    mode: AnalogDelayMode.Tape,
    time: TIME,
    feedback: FEEDBACK,
    mix: MIX,
    age: AGE,
    wobble: WOBBLE,
    taps: TAPS,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  pluck.connect(delay).connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [clock, pluck, delay, analyser, level],
    exposes: { clock, pluck, delay, analyser },
  });
}

export default definePatch({
  id: "effects/analog",
  label: "Tape and buckets",
  build,
  controls: [
    {
      id: "rate",
      kind: "slider",
      label: "Pluck rate",
      help: "How often the string is struck.",
      param: (s) => s.clock.bpm,
      min: 20,
      max: 100,
      unit: "bpm",
      default: BPM,
    },
    {
      id: "mode",
      kind: "select",
      label: "Machine",
      help: "Two machines reading one line at different head positions.",
      param: (s) => s.delay.mode,
      options: MODES,
      default: AnalogDelayMode.Tape,
    },
    {
      id: "age",
      kind: "slider",
      label: "Age",
      help: "El Capistan's Tape Age: wobble, saturation, lost bandwidth, noise.",
      param: (s) => s.delay.age,
      min: 0,
      max: 1,
      step: 0.01,
      default: AGE,
    },
    {
      id: "wobble",
      kind: "slider",
      label: "Wobble",
      help: "Wow and flutter, on top of whatever Age already implies.",
      param: (s) => s.delay.wobble,
      min: 0,
      max: 1,
      step: 0.01,
      default: WOBBLE,
    },
    {
      id: "time",
      kind: "slider",
      label: "Time",
      help: "Move it while it sounds: the heads glide, so the pitch bends.",
      param: (s) => s.delay.time,
      min: 0.02,
      max: 1.5,
      scale: "time",
      unit: "s",
      default: TIME,
    },
    {
      id: "feedback",
      kind: "slider",
      label: "Feedback",
      help: "The Space Echo's Intensity. Past 1 the machine sings.",
      param: (s) => s.delay.feedback,
      min: 0,
      max: 1.1,
      step: 0.01,
      default: FEEDBACK,
    },
    {
      id: "taps",
      kind: "slider",
      label: "Heads",
      help: "Fades in the later playback heads: a rhythm on tape, a wash on the BBD.",
      param: (s) => s.delay.taps,
      min: 0,
      max: 1,
      step: 0.01,
      default: TAPS,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      // Each repeat is darker than the one before it, and on a trace that is a
      // top end that recedes rather than a level that falls.
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    {
      kind: "scope",
      label: "Repeats",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 10 },
    },
  ],
});
