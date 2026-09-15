/*
 * Sixteen numbers and a scheduler, which is the old way round.
 *
 * Everything else in this chapter keeps time in the graph. This page does it
 * the way a DAW does: an animation frame wakes up, looks a quarter of a second
 * ahead, and writes the next bar's worth of `setValueAtTime` calls onto two
 * parameters. The audio is still sample-accurate - every value is stamped with
 * a time - but the *arming* is not, and a main thread that stalls for longer
 * than the lookahead arms the bar late.
 *
 * That is the trade, and it is the reason the page exists: it is the only file
 * in the chapter with a timer in it, and the lesson beside it asks you to stall
 * the page and listen to the difference.
 *
 * The step array is read when a bar is armed, so a slider moved halfway
 * through a bar takes effect the next time round rather than immediately.
 */

import { Compound, Gain, MonoSynth, Param, toFrequency } from "synthlet";
import { definePatch, type ValueRef } from "../define";

const STEPS = 16;
const BEATS = 4;
const BPM = 120;

/** A1, low enough that two octaves of offsets are still a bassline. */
const ROOT = 33;

/** Root, octave, fifth, minor seventh: the shape of every sequenced bass. */
const FIGURE = [0, 0, 12, 0, 7, 0, 10, 0, 0, 0, 12, 0, 7, 0, 15, 12];

/** How far ahead the arming looks, in seconds. */
const LOOKAHEAD = 0.25;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const gate = Param.input(ac, 0);
  const pitch = Param.input(ac, toFrequency(ROOT));

  const synth = MonoSynth(ac, {
    gate,
    frequency: pitch,
    amp: { attack: 0.004, decay: 0.12, sustain: 0.4, release: 0.05 },
    filter: { frequency: 1400 },
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  synth.connect(analyser).connect(level).connect(out);

  const semitones = [...FIGURE];
  let bpm = BPM;

  // One accessor per step, over one array. The kit only ever needs something
  // with a `value`, and sixteen `AudioParam`s here would be sixteen nodes for
  // a number the scheduler reads once a bar.
  const steps: ValueRef[] = semitones.map((_, index) => ({
    get value() {
      return semitones[index];
    },
    set value(next: number) {
      semitones[index] = Math.min(24, Math.max(0, Math.round(next)));
    },
  }));

  const bpmRef: ValueRef = {
    get value() {
      return bpm;
    },
    set value(next: number) {
      bpm = Math.min(200, Math.max(60, Math.round(next)));
    },
  };

  const barSeconds = () => (60 / bpm) * BEATS;
  let nextBar = ac.currentTime + 0.1;
  let frame = 0;

  const arm = () => {
    const bar = barSeconds();
    const step = bar / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const at = nextBar + i * step;
      pitch.input.setValueAtTime(toFrequency(ROOT + semitones[i]), at);
      gate.input.setValueAtTime(1, at);
      gate.input.setValueAtTime(0, at + step * 0.5);
    }
    nextBar += bar;
  };

  const tick = () => {
    frame = requestAnimationFrame(tick);
    while (nextBar - ac.currentTime < LOOKAHEAD) arm();
  };

  // `requestAnimationFrame` is a window, and `diagrams.test.ts` builds patches
  // on a bare `OfflineAudioContext` where there is none. A `setTimeout` would
  // run there and is deliberately not used: a timer that fires while nobody is
  // looking at the page is the thing this library declines to own.
  if (typeof requestAnimationFrame === "function") {
    frame = requestAnimationFrame(tick);
  }

  return Compound({
    output: out,
    owns: [
      gate,
      pitch,
      synth,
      analyser,
      level,
      // A teardown, not a node: `owns` takes a function, and this is how the
      // one timer in the chapter stops when the reader navigates away.
      () => {
        if (frame && typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(frame);
        }
        frame = 0;
      },
    ],
    exposes: { gate, pitch, synth, analyser, steps, bpm: bpmRef },
  });
}

export default definePatch({
  id: "time/steps",
  label: "Sixteen steps, armed by hand",
  build,
  controls: [
    ...FIGURE.map((value, index) => ({
      id: `step${index + 1}`,
      kind: "slider" as const,
      label: `${index + 1}`,
      param: (s: ReturnType<typeof build>) => s.steps[index],
      min: 0,
      max: 24,
      step: 1,
      unit: "st",
      default: value,
    })),
    {
      id: "bpm",
      kind: "slider",
      label: "Tempo",
      help: "Read when the next bar is armed, not when you move it.",
      param: (s) => s.bpm,
      min: 60,
      max: 200,
      step: 1,
      unit: "bpm",
      default: BPM,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "The line",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
  ],
});
