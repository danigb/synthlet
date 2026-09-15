/*
 * Noise, measured once a beat, pointed at a filter.
 *
 * Part 16's Figure 6 is three modules and a cable: a clock closes a switch, the
 * switch catches whatever voltage the noise generator happened to be at, and
 * the capacitor holds it until the next tick. Point that held voltage at a
 * cutoff frequency and you have the burble that opens ELP's *Karn Evil 9*.
 *
 * The saw underneath is only there to be filtered. Everything the lesson is
 * about happens in the control path, which is why the scope in this patch is
 * looking at a control voltage rather than at the sound.
 */

import {
  Clock,
  Compound,
  Gain,
  Noise,
  NoiseType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  SampleHold,
  SampleHoldType,
  Svf,
  SvfType,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 300;
/** Narrow, so sample-and-hold is a sample and not a long look. */
const PULSE_WIDTH = 0.1;

const FREQUENCY = 110;
const CUTOFF = 1600;
const DEPTH = 1200;
/** Enough resonance to hear each step land; not enough to whistle. */
const RESONANCE = 8;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: PULSE_WIDTH });
  const noise = Noise(ac, { type: NoiseType.White });
  // `clock.gate`, not the clock node: the node is a rising phase ramp, which is
  // positive from the first beat onward and never falls, so it would sample
  // once and latch forever.
  const sampleHold = SampleHold(ac, {
    type: SampleHoldType.SampleHold,
    trigger: clock.gate,
  });
  noise.connect(sampleHold);

  // The held voltage is -1…1; this is the amount knob that turns it into
  // hertz. It sums with the filter's own cutoff, so the knob is a deviation
  // either side of it rather than a frequency of its own.
  const cv = Param.mul(ac, sampleHold, DEPTH);

  const saw = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: RESONANCE,
  });
  cv.connect(filter.frequency);

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // The stepped control voltage itself, on the longest window the node has:
  // 0.74 s, which is three or four steps at the default tempo. This is the
  // picture Figure 5 of Part 16 draws by hand.
  const cvAnalyser = ac.createAnalyser();
  cvAnalyser.fftSize = 32768;
  sampleHold.connect(cvAnalyser);

  const out = Gain.val(ac, 0);
  saw.connect(filter).connect(level);
  level.connect(analyser).connect(out);

  return Compound({
    output: out,
    owns: [clock, noise, sampleHold, cv, saw, filter, level, analyser],
    exposes: {
      clock,
      noise,
      sampleHold,
      cv,
      saw,
      filter,
      analyser,
      cvAnalyser,
    },
  });
}

export default definePatch({
  id: "modulation/sample-hold",
  label: "Sample and hold",
  build,
  controls: [
    {
      id: "rate",
      kind: "slider",
      label: "Clock",
      help: "How often the switch closes, in beats per minute.",
      param: (s) => s.clock.bpm,
      min: 30,
      max: 900,
      step: 1,
      unit: "bpm",
      default: BPM,
    },
    {
      id: "pulseWidth",
      kind: "slider",
      label: "Pulse width",
      help: "How long each tick stays high. Only track-and-hold can tell.",
      param: (s) => s.clock.pulseWidth,
      min: 0.02,
      max: 0.95,
      step: 0.01,
      default: PULSE_WIDTH,
    },
    {
      id: "depth",
      kind: "slider",
      label: "Depth",
      help: "How far each held voltage moves the cutoff.",
      param: (s) => s.cv.gain,
      min: 0,
      max: 4000,
      step: 10,
      unit: "Hz",
      default: DEPTH,
    },
    {
      id: "track",
      kind: "toggle",
      label: "Track and hold",
      help: "Off latches on the rising edge; on stays transparent until the fall.",
      param: (s) => s.sampleHold.type,
      default: SampleHoldType.SampleHold,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "The held voltage",
      source: (s) => s.cvAnalyser,
    },
    { kind: "spectrum", label: "The sound", source: (s) => s.analyser },
    { kind: "diagram" },
  ],
  /*
   * Part 16, Figure 6 - with one liberty taken.
   *
   * The control path is drawn as three boxes hanging under the filter, reading
   * bottom to top: `Clock` into the S&H's trigger, the S&H into the amount's
   * input, the amount into the cutoff. Every one of those cables is a real
   * parameter connection, which is why the ports can be named.
   *
   * The liberty is the noise generator. The layout puts every box an *audio*
   * cable touches in one row, so a second audio chain would sit on top of the
   * first; the noise the S&H samples is therefore inside the S&H's box - which
   * `exposedAs` says out loud - rather than beside it. Ticket 11c is the fix.
   */
  diagram: {
    nodes: [
      {
        id: "saw",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "saw",
      },
      { id: "filter", label: "Svf", kind: "modifier", exposedAs: "filter" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "cv",
        label: "Param",
        kind: "controller",
        exposedAs: "cv",
        controls: ["depth"],
      },
      {
        id: "sampleHold",
        label: "Noise → SampleHold",
        kind: "controller",
        exposedAs: ["noise", "sampleHold"],
        controls: ["track"],
      },
      {
        id: "clock",
        label: "Clock",
        kind: "controller",
        exposedAs: "clock",
        controls: ["rate", "pulseWidth"],
      },
    ],
    edges: [
      { from: "saw", to: "filter" },
      { from: "filter", to: "out" },
      { from: "cv", to: "filter", param: "frequency" },
      { from: "sampleHold", to: "cv", param: "input" },
      { from: "clock", to: "sampleHold", param: "trigger" },
    ],
  },
});
