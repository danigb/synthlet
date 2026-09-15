/*
 * Reid's three delay lines, beside two algorithms that do it properly.
 *
 * Part 61's Figures 15 to 17 are a claim you can build: take three delay lines,
 * set each one repeating, feed each into the next so that every echo produces
 * its own stream of echoes, and the result stops being a sequence of repeats
 * and starts being a room. Reid's own caveat is in the patch too - because the
 * three delay times are constant, there are three characteristic frequencies in
 * the tail, and it rings metallically. A spring reverb has exactly the same
 * problem for exactly the same reason: three modes of vibration, three
 * frequencies, one *boinggg*.
 *
 * Beside it, two reverbs that are not made of three numbers: Greyhole's
 * diffusing feedback network and Dattorro's plate.
 *
 * **A send and a return, because it has to be one.** `ReverbDelay` has no
 * wet/dry control at all - it is fully wet by construction - and
 * `DattorroReverb`'s `dryWet` is bipolar and defaults to fully wet. So one
 * `mix` knob shared across three models cannot be each model's own; it is a dry
 * gain and a wet gain in the patch, with every model run at full wet. That is
 * Reid's Figure 9 anyway: the effect hangs off a send, and the mixer at the end
 * decides how much of it is heard.
 *
 * The regeneration loop is each delay's own `feedback`, not a cable from the
 * third back into the first. A Web Audio cycle through three worklets is legal
 * and is a runaway waiting for a slider; three internal loops give the same
 * "thousands of indistinguishable repeats" with a bound the module was tested
 * against.
 *
 * No `diagram`: three parallel models plus a send and a return is four audio
 * chains, and `layoutDiagram` draws every box on an audio cable in one row, so
 * it would stack them on top of each other (tickets 10b, 11c). The chapter
 * spends its second picture on `effects/body`, which is a single chain and is
 * the lesson about *where* a box sits.
 */

import {
  Clock,
  Compound,
  DattorroReverb,
  DigitalDelay,
  Gain,
  KarplusStrong,
  ReverbDelay,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 30;
const PULSE_WIDTH = 0.02;

const FREQUENCY = 330;
const DECAY = 0.8;
const BRIGHTNESS = 0.5;

/**
 * Three enharmonic, prime-ish delay times, in seconds.
 *
 * Reid's instruction is that the three must differ, "or all the echoes will
 * fall at the same time". Times in a simple ratio would put every repeat of
 * every repeat back on the same grid, which is a rhythm rather than a room.
 */
const TIMES = [0.089, 0.037, 0.0113];
/** Each line's own regeneration, rising down the chain. */
const FEEDBACKS = [0.35, 0.45, 0.55];

const SIZE = 1;
const DAMPING = 0.3;
const DECAY_KNOB = 0.5;
const MIX = 0.4;

/** Long enough to cover a switch, short enough to hear as no gap at all. */
const CROSSFADE = 0.01;
const LEVEL = 0.125;

const MODELS = [
  "Three delays — Reid's Figure 17",
  "ReverbDelay — Greyhole",
  "DattorroReverb — a plate",
];

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: PULSE_WIDTH });
  const pluck = KarplusStrong(ac, {
    trigger: clock.gate,
    frequency: FREQUENCY,
    decay: DECAY,
    brightness: BRIGHTNESS,
  });

  // Reid's arm. `mix: 1` on each line is what makes the chain a send: the dry
  // signal reaches the output down its own cable, once, rather than three times
  // at three different levels.
  const delays = TIMES.map((time, index) =>
    DigitalDelay(ac, {
      time,
      feedback: FEEDBACKS[index],
      mix: 1,
      tone: -DAMPING,
    }),
  );
  // Figure 9's output mixer. Every one of the three streams is heard, which is
  // the difference between a chain of three delays and a reverb: the second
  // line echoes the first line's echoes *and* the first line's echoes are still
  // in the room.
  const reid = Gain.val(ac, 0.5);

  const grey = ReverbDelay(ac, {
    delay: 0.02,
    size: SIZE,
    damping: 0.3,
    diffusion: 0.7,
    feedback: 0.85,
  });
  const plate = DattorroReverb(ac, { decay: 0.6, damping: 0.25, dryWet: 1 });

  const arms = [reid, grey, plate];
  const gains = arms.map((_, index) => Gain.val(ac, index === 0 ? 1 : 0));

  const wet = Gain.val(ac, MIX);
  const dry = Gain.val(ac, 1);
  const sum = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  pluck.connect(dry);
  pluck.connect(delays[0]);
  delays[0].connect(delays[1]);
  delays[1].connect(delays[2]);
  for (const delay of delays) delay.connect(reid);

  pluck.connect(grey);
  pluck.connect(plate);
  arms.forEach((arm, index) => arm.connect(gains[index]).connect(wet));

  wet.connect(sum);
  dry.connect(sum);
  sum.connect(analyser).connect(level).connect(out);

  let chosen = 0;
  const model = {
    get value() {
      return chosen;
    },
    set value(next: number) {
      chosen = Math.min(arms.length - 1, Math.max(0, Math.round(next)));
      gains.forEach((gain, index) => {
        gain.gain.setTargetAtTime(
          index === chosen ? 1 : 0,
          ac.currentTime,
          CROSSFADE,
        );
      });
    },
  };

  // Four knobs, three models, and the models disagree about units: "decay" is
  // three loop gains here, one loop gain there and a tank gain on the plate.
  // So each control is one accessor that writes every model at once - the
  // `sound/harmonics` idiom. Every model is always running, which is why
  // writing all of them on every move is what keeps them in step.
  let size = SIZE;
  const sizeRef = {
    get value() {
      return size;
    },
    set value(next: number) {
      size = next;
      delays.forEach((delay, index) => {
        delay.time.value = TIMES[index] * size;
      });
      grey.size.value = size;
    },
  };

  let decay = DECAY_KNOB;
  const decayRef = {
    get value() {
      return decay;
    },
    set value(next: number) {
      decay = next;
      delays.forEach((delay) => {
        delay.feedback.value = 0.2 + 0.7 * decay;
      });
      grey.feedback.value = 0.5 + 0.49 * decay;
      plate.decay.value = 0.3 + 0.69 * decay;
    },
  };

  let damping = DAMPING;
  const dampingRef = {
    get value() {
      return damping;
    },
    set value(next: number) {
      damping = next;
      delays.forEach((delay) => {
        delay.tone.value = -damping;
      });
      grey.damping.value = 0.99 * damping;
      plate.damping.value = damping;
    },
  };

  let mix = MIX;
  const mixRef = {
    get value() {
      return mix;
    },
    set value(next: number) {
      mix = next;
      wet.gain.value = mix;
      // An equal-ish law rather than `1 - mix`: a send that sucks the centre
      // out at full wet is a send nobody can judge the tail of.
      dry.gain.value = 1 - 0.5 * mix;
    },
  };

  return Compound({
    output: out,
    owns: [
      clock,
      pluck,
      ...delays,
      reid,
      grey,
      plate,
      ...gains,
      wet,
      dry,
      sum,
      analyser,
      level,
    ],
    exposes: {
      clock,
      pluck,
      grey,
      plate,
      wet,
      dry,
      sum,
      analyser,
      model,
      size: sizeRef,
      decay: decayRef,
      damping: dampingRef,
      mix: mixRef,
    },
  });
}

export default definePatch({
  id: "effects/reverb",
  label: "Reverb is delays, all the way down",
  build,
  controls: [
    {
      id: "model",
      kind: "select",
      label: "Model",
      help: "Three delay lines, a diffusing network, and a plate.",
      param: (s) => s.model,
      options: MODELS,
      default: 0,
    },
    {
      id: "size",
      kind: "slider",
      label: "Size",
      help: "A multiplier on every delay length. The plate has no size, and ignores it.",
      param: (s) => s.size,
      min: 0.3,
      max: 3,
      step: 0.01,
      default: SIZE,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "Reid's Repeat Depth, in each model's own units of loop gain.",
      param: (s) => s.decay,
      min: 0,
      max: 1,
      step: 0.01,
      default: DECAY_KNOB,
    },
    {
      id: "damping",
      kind: "slider",
      label: "Damping",
      help: "How much top end each trip round the loop costs.",
      param: (s) => s.damping,
      min: 0,
      max: 1,
      step: 0.01,
      default: DAMPING,
    },
    {
      id: "mix",
      kind: "slider",
      label: "Mix",
      help: "The return level. Every model runs fully wet, so this knob is the send.",
      param: (s) => s.mix,
      min: 0,
      max: 1,
      step: 0.01,
      default: MIX,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    { kind: "meter", label: "Output" },
  ],
});
