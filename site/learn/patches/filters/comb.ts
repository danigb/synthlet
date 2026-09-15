/*
 * A signal, a copy of itself a few milliseconds late, and the sum of the two.
 *
 * There is no filter in this patch, and it is the first filter in the chapter:
 * two identical signals offset in time cancel at every frequency whose cycle
 * fits an odd number of half-periods into the offset, and reinforce at every
 * one that fits a whole number. That is a set of evenly spaced holes in the
 * spectrum - a comb - and it is where Reid starts, because it says that a
 * filter is a phase device before it is a volume device.
 *
 * The delay is a native `DelayNode`. The library's rule is that a Web Audio
 * node is a synthlet module like any other, and this is the book's own figure;
 * the digital delay, with its feedback and its filtering, comes later.
 *
 * No `diagram`: the picture here is two paths from one source, and the kit's
 * layout puts every box on an audio cable in a single row, centred - so the dry
 * path would be drawn straight through the delay and along the cable that is
 * already there. Ticket 10b.
 */

import {
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** Room for the slider's 10 ms and nothing more. */
const MAX_DELAY = 0.05;
const DEFAULT_MS = 5;

/** How many teeth to predict. Beyond a dozen they are closer than a pixel. */
const TEETH = 12;

/**
 * Reid's Figures 3 and 4, and the sawtooth of the paragraph after them.
 *
 * A pitch and a shape together, because the claim this lesson makes is about
 * two particular frequencies: 5 ms is half a cycle of 100 Hz and a whole cycle
 * of 200 Hz, so one delay silences the first and doubles the second.
 */
const SOURCES = [
  { name: "Sine 100 Hz", type: PolyblepOscillatorType.Sine, frequency: 100 },
  { name: "Sine 200 Hz", type: PolyblepOscillatorType.Sine, frequency: 200 },
  {
    name: "Sawtooth 100 Hz",
    type: PolyblepOscillatorType.Sawtooth,
    frequency: 100,
  },
];

/** Dry and wet are summed here, so a full mix peaks at 1 rather than at 2. */
const SUM = 0.5;

/** A fixed trim, after the analyser: the picture is the signal, this is the room. */
const LEVEL = 0.125;

/** Long enough not to zipper, short enough that the slider feels direct. */
const GLIDE = 0.02;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: SOURCES[0].type,
    frequency: SOURCES[0].frequency,
  });
  const delay = new DelayNode(ac, {
    maxDelayTime: MAX_DELAY,
    delayTime: DEFAULT_MS / 1000,
  });
  const wet = Gain.val(ac, 1);
  const sum = Gain.val(ac, SUM);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  // Last and at zero; the analyser is before it, so a silent widget draws.
  const out = Gain.val(ac, 0);

  osc.connect(sum);
  osc.connect(delay).connect(wet).connect(sum);
  sum.connect(analyser).connect(level).connect(out);

  // Milliseconds, which is what the book counts in and what the slider says.
  // The write is a ramp rather than an assignment: a delay time jumped to is a
  // click, and one swept is a flanger - the same comb, moving, which is worth
  // hearing on the way to the setting you were aiming at.
  let ms = DEFAULT_MS;
  const delayMs = {
    get value() {
      return ms;
    },
    set value(next: number) {
      ms = next;
      delay.delayTime.setTargetAtTime(ms / 1000, ac.currentTime, GLIDE);
    },
  };

  let source = 0;
  const waveform = {
    get value() {
      return source;
    },
    set value(next: number) {
      source = Math.min(SOURCES.length - 1, Math.max(0, Math.round(next)));
      osc.type.value = SOURCES[source].type;
      osc.frequency.value = SOURCES[source].frequency;
    },
  };

  return Compound({
    output: out,
    owns: [osc, delay, wet, sum, analyser, level],
    exposes: { osc, delay, wet, sum, analyser, delayMs, waveform },
  });
}

export default definePatch({
  id: "filters/comb",
  label: "A comb filter",
  build,
  controls: [
    {
      id: "delay",
      kind: "slider",
      label: "Delay",
      help: "How far behind the copy runs. Half a cycle cancels; a whole one adds.",
      param: (s) => s.delayMs,
      min: 0,
      max: 10,
      step: 0.1,
      unit: "ms",
      default: DEFAULT_MS,
    },
    {
      // 0 is the original alone; 1 is equal parts, which is the only setting
      // where a cancellation can be total - two things sum to nothing only when
      // they are the same size.
      id: "mix",
      kind: "slider",
      label: "Mix",
      help: "How much of the delayed copy joins the original.",
      param: (s) => s.wet.gain,
      min: 0,
      max: 1,
      step: 0.01,
      default: 1,
    },
    {
      id: "waveform",
      kind: "select",
      label: "Waveform",
      help: "Two sines an octave apart, then a saw that contains both of them.",
      param: (s) => s.waveform,
      options: SOURCES.map((source) => source.name),
      default: 0,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The teeth, predicted: a delay of t seconds cancels every frequency
      // whose period fits an odd number of half-cycles into it, which is
      // (2k+1)/2t. The lines move as the delay moves, and the holes move with
      // them - which is the whole of Figure 5.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => {
          const seconds = s.delayMs.value / 1000;
          if (seconds <= 0) return [];
          return Array.from(
            { length: TEETH },
            (_, k) => (2 * k + 1) / (2 * seconds),
          );
        },
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
});
