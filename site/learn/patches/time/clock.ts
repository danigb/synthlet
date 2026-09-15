/*
 * A metronome with nothing on the page timing it.
 *
 * Part 16 opens with the clock, because every module that follows it in the
 * chapter is something a clock drives. This one is an audio worklet: the beat
 * is a signal on the audio thread, sample-accurate, and the main thread never
 * hears about it. Stall the page - a long paint, a garbage collection, a
 * ten-second busy loop pasted into devtools - and the rhythm does not move.
 *
 * `Clock` is a compound and the difference between its outputs is the lesson:
 * the node itself is a rising `[0, 1)` phase ramp, which is what a `Euclid`
 * subdivides, and `.gate` is a pulse high for `pulseWidth` of each beat, which
 * is what an envelope reads. `.downbeat` is the same pulse once a bar.
 *
 * Two voices, one bar apart in register. The scope is looking at the gate
 * rather than at the sound, because the gate is what the controls are about.
 */

import {
  AdAmp,
  Clock,
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 120;
/** Narrow enough that the beat is a tick rather than a note. */
const PULSE_WIDTH = 0.25;
const BEATS_PER_BAR = 4;

const BEAT_HZ = 220;
const DOWNBEAT_HZ = 110;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, {
    bpm: BPM,
    pulseWidth: PULSE_WIDTH,
    beatsPerBar: BEATS_PER_BAR,
  });

  // The beat: a short saw through an attack-decay amplifier whose trigger is
  // the clock's gate. `AdAmp` takes `trigger`, not `gate` - it has no sustain
  // to hold, so there is nothing for a gate's falling edge to do.
  const saw = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: BEAT_HZ,
  });
  const beatAmp = AdAmp(ac, {
    trigger: clock.gate,
    attack: 0.004,
    decay: 0.2,
  });

  // The bar. `.downbeat` is a subset of `.gate` - same phase, same width, same
  // sample - so the low voice always lands *on* a beat rather than between two.
  const bass = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: DOWNBEAT_HZ,
  });
  const downAmp = AdAmp(ac, {
    trigger: clock.downbeat,
    attack: 0.004,
    decay: 0.35,
  });

  const mix = Gain.val(ac, 1);
  saw.connect(beatAmp).connect(mix);
  bass.connect(downAmp).connect(mix);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  // The gate itself, on the longest window an analyser has: 0.74 s, which is
  // about a beat and a half at 120 bpm. That is the window that makes the
  // pulse *width* visible rather than just its rate.
  const gateAnalyser = ac.createAnalyser();
  gateAnalyser.fftSize = 32768;
  clock.gate.connect(gateAnalyser);

  const level = Gain.val(ac, LEVEL);
  // Last and at zero, with the analyser before it: a silent widget still draws.
  const out = Gain.val(ac, 0);
  mix.connect(analyser).connect(level).connect(out);

  return Compound({
    output: out,
    owns: [
      clock,
      saw,
      beatAmp,
      bass,
      downAmp,
      mix,
      analyser,
      gateAnalyser,
      level,
    ],
    exposes: { clock, saw, bass, beatAmp, downAmp, analyser, gateAnalyser },
  });
}

export default definePatch({
  id: "time/clock",
  label: "A clock in the graph",
  build,
  controls: [
    {
      id: "bpm",
      kind: "slider",
      label: "Tempo",
      help: "Beats per minute, read on the audio thread.",
      param: (s) => s.clock.bpm,
      min: 30,
      max: 300,
      step: 1,
      unit: "bpm",
      default: BPM,
    },
    {
      id: "pulseWidth",
      kind: "slider",
      label: "Pulse width",
      help: "How much of each beat the gate stays high for.",
      param: (s) => s.clock.pulseWidth,
      min: 0.02,
      max: 0.95,
      step: 0.01,
      default: PULSE_WIDTH,
    },
    {
      id: "beatsPerBar",
      kind: "slider",
      label: "Beats per bar",
      help: "How often the low voice comes round. 0 turns the bar off.",
      param: (s) => s.clock.beatsPerBar,
      min: 0,
      max: 8,
      step: 1,
      default: BEATS_PER_BAR,
    },
  ],
  views: [
    { kind: "scope", label: "The gate", source: (s) => s.gateAnalyser },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "diagram" },
  ],
  /*
   * One chain, with the two voices folded into one box each.
   *
   * There are really two oscillators and two amplifiers here, and the layout
   * puts every box an audio cable touches in row 0 - so a second chain would
   * be drawn on top of the first. `exposedAs` is a list for exactly this, and
   * ticket `11c` is the fix that would let the two be drawn side by side.
   */
  diagram: {
    nodes: [
      {
        id: "saw",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: ["saw", "bass"],
      },
      {
        id: "amp",
        label: "AdAmp",
        kind: "modifier",
        exposedAs: ["beatAmp", "downAmp"],
      },
      { id: "out", label: "out", kind: "output" },
      {
        id: "clock",
        label: "Clock",
        kind: "controller",
        exposedAs: "clock",
        controls: ["bpm", "pulseWidth", "beatsPerBar"],
      },
    ],
    edges: [
      { from: "saw", to: "amp" },
      { from: "amp", to: "out" },
      { from: "clock", to: "amp", param: "trigger" },
    ],
  },
});
