/*
 * The same delay line, moved before the filter, stops being an effect.
 *
 * Part 22 is the chapter's punchline and it is one cable's worth of difference.
 * A reverb after the amplifier adds ambience. A delay short enough to fit
 * inside a cycle, placed *before* the filter, imposes its own set of resonances
 * on the oscillator instead - and a set of resonances imposed on a sawtooth is
 * what the body of a violin or a guitar does to the sawtooth-ish signal a bowed
 * or plucked string makes at the bridge.
 *
 * Reid's numbers: the delay range that models an instrument's cavity rather
 * than a room is roughly 1 to 4 ms, which is why he reaches for a
 * bucket-brigade device and not for the six-inch spring. His own arithmetic on
 * the way out - 340 metres per second, a cavity of about a third of a metre, a
 * lowest resonance around 500 Hz - is the same arithmetic as the marks on the
 * spectrum here, which sit at every multiple of 1/delay.
 *
 * It is a `DigitalDelay` and not an `AnalogDelay`, which is the one place this
 * chapter cannot follow the book: `AnalogDelay.time` floors at 20 ms, because
 * no tape machine and no MN3005 ever went shorter, and 20 ms is already an
 * echo. The BBD's contribution to the timbre was its lost top end, and that is
 * `tone`, pulled negative.
 */

import {
  AdsrAmp,
  Compound,
  DigitalDelay,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "A2";
const DEFAULT_MS = 5;
const FEEDBACK = 0.85;
/** Half and half: the comb needs two things the same size to cancel between. */
const MIX = 0.5;
/** The bandwidth a bucket brigade would have cost, as a tilt. */
const TONE = -0.35;

const CUTOFF = 2500;
const RESONANCE = 0.9;

/** How many of the body's modes to draw. Beyond a dozen they are a pixel apart. */
const MODES = 12;

/** Long enough not to zipper, short enough that the slider feels direct. */
const GLIDE = 0.02;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start,
  });

  // The body. Feedback this high is a resonator rather than an echo: the signal
  // meets its own copy a few hundred microseconds later, over and over, and
  // what survives is whatever fits a whole number of times into that gap.
  const body = DigitalDelay(ac, {
    time: DEFAULT_MS / 1000,
    feedback: FEEDBACK,
    mix: MIX,
    tone: TONE,
  });

  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: RESONANCE,
  });

  const gate = Param(ac);
  const amp = AdsrAmp(ac, {
    gate,
    attack: 0.005,
    decay: 0.25,
    sustain: 0.6,
    release: 0.35,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(body).connect(filter).connect(amp);
  amp.connect(analyser).connect(level).connect(out);

  // Milliseconds, which is the unit Reid counts cavities in. The write is a
  // ramp rather than an assignment, `filters/comb`'s idiom: a delay time jumped
  // to is a click, and one swept is the body changing size while the note
  // holds - which is the thing this lesson wants the reader to hear.
  let ms = DEFAULT_MS;
  const delay = {
    get value() {
      return ms;
    },
    set value(next: number) {
      ms = next;
      body.time.setTargetAtTime(ms / 1000, ac.currentTime, GLIDE);
    },
  };

  const held = new Set<string>();
  const play = (note: string) => {
    held.add(note);
    osc.frequency.value = toFrequency(toMidi(note));
    gate.input.value = 1;
  };
  const release = (note: string) => {
    held.delete(note);
    if (held.size === 0) gate.input.value = 0;
  };

  return Compound({
    output: out,
    owns: [osc, body, filter, gate, amp, analyser, level],
    exposes: { osc, body, filter, amp, analyser, delay, play, release },
  });
}

export default definePatch({
  id: "effects/body",
  label: "The delay inside the instrument",
  build,
  controls: [
    {
      id: "delay",
      kind: "slider",
      label: "Delay",
      help: "The size of the cavity. Reid's instrument range is 1 to 4 ms.",
      param: (s) => s.delay,
      min: 0.5,
      max: 20,
      step: 0.1,
      unit: "ms",
      default: DEFAULT_MS,
    },
    {
      id: "feedback",
      kind: "slider",
      label: "Feedback",
      help: "How long the body rings. Reid's RT60, for a cavity.",
      param: (s) => s.body.feedback,
      min: 0,
      max: 0.95,
      step: 0.01,
      default: FEEDBACK,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "The ordinary filter, after the body rather than instead of it.",
      param: (s) => s.filter.frequency,
      min: 200,
      max: 12000,
      scale: "log",
      unit: "Hz",
      default: CUTOFF,
    },
  ],
  views: [
    // Keys are a *view*, never a control: a lesson's `show` filters controls,
    // and a widget whose whole job is to be played must not lose its keyboard
    // the moment a lesson narrows the knobs down (ticket 08c).
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.release(note),
      options: { from: "C2", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Modes",
      source: (s) => s.analyser,
      // The body's modes, predicted. A feedback comb reinforces every frequency
      // whose period fits a whole number of times into the delay, so they sit
      // at n/t - and they stay where they are as the note moves, which is
      // exactly what makes this a body rather than a filter.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => {
          const seconds = s.delay.value / 1000;
          if (seconds <= 0) return [];
          return Array.from({ length: MODES }, (_, n) => (n + 1) / seconds);
        },
      },
    },
    { kind: "diagram", label: "The patch" },
  ],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      {
        id: "body",
        label: "DigitalDelay",
        kind: "modifier",
        // The box is the node *and* the accessor, the `sound/harmonics`
        // pattern: the `delay` control ties to it by name, with no `controls`
        // entry needed.
        exposedAs: ["body", "delay"],
        controls: ["feedback"],
      },
      {
        id: "filter",
        label: "Svf",
        kind: "modifier",
        exposedAs: "filter",
        controls: ["cutoff"],
      },
      { id: "amp", label: "AdsrAmp", kind: "modifier", exposedAs: "amp" },
      { id: "out", label: "out", kind: "output" },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "body" },
      { from: "body", to: "filter" },
      { from: "filter", to: "amp" },
      { from: "amp", to: "out" },
      { from: "keys", to: "osc", param: "frequency" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
