/*
 * Nine sine waves and nine volume controls, which is a Hammond organ.
 *
 * Part 14 builds an additive synthesiser out of nine oscillators, nine VCAs and
 * a mixer, calls it "hopelessly inefficient", and then points out that the most
 * successful keyboard instrument of the twentieth century is exactly that. So
 * this patch is Figure 8, wired.
 *
 * It is also the one patch in the tutorial with no worklet in it. `Oscillator`
 * and `Gain` are `OscillatorNode` and `GainNode` with the library's factory
 * shape around them - the same `descriptors`, the same `dispose`, the same
 * `connect` - because the vision's first principle is that a native node is a
 * synthlet module too.
 */

import { Compound, Gain, Oscillator } from "synthlet";
import { definePatch } from "../define";

const FUNDAMENTAL = 220;
const HARMONICS = 9;

/** A Hammond drawbar's travel: nine positions, zero to eight. */
const FULL = 8;

/**
 * Nine sines in phase add up, so the master gain is low.
 *
 * Every `OscillatorNode` starts at phase zero, which means all nine peak
 * together: with every drawbar out the peak really is nine times one bar's.
 */
const LEVEL = 0.035;

/** Seconds for the fundamental's decay. The nth partial gets `T/n`. */
const TIME = 2;

/** Reid's 1/n series, rounded onto a drawbar's nine positions. */
const SAW = [8, 4, 3, 2, 2, 1, 1, 1, 1];
/** Every harmonic at full: Part 14's Figure 4, the bright buzz. */
const BUZZ = [8, 8, 8, 8, 8, 8, 8, 8, 8];
/**
 * `88 8000 000`, the registration Jimmy Smith and Keith Emerson lived on.
 *
 * A Hammond's nine drawbars are harmonics 1, 3, 2, 4, 6, 8, 10, 12 and 16 of
 * the 16' pitch, so the first three of them - 16', 5 1/3' and 8' - are the
 * first three harmonics, which are the first three sliders here (Part 55,
 * Figures 10 and 11).
 */
const DRAWBARS = [8, 8, 8, 0, 0, 0, 0, 0, 0];

function build(ac: AudioContext) {
  const oscillators = Array.from({ length: HARMONICS }, (_, index) =>
    Oscillator(ac, { type: "sine", frequency: FUNDAMENTAL * (index + 1) }),
  );
  const gains = oscillators.map(() => Gain.val(ac, 0));

  const mixer = Gain.val(ac, 1);
  oscillators.forEach((oscillator, index) => {
    oscillator.connect(gains[index]).connect(mixer);
  });

  const level = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const scopeAnalyser = ac.createAnalyser();
  scopeAnalyser.fftSize = 2048;

  const out = Gain.val(ac, 0);
  mixer.connect(level);
  level.connect(scopeAnalyser);
  level.connect(analyser).connect(out);

  const positions = [...DRAWBARS];
  let time = TIME;

  /** Cancel first: a bar moved during a pluck is a bar with a ramp on it. */
  const hold = (index: number) => {
    const now = ac.currentTime;
    gains[index].gain.cancelScheduledValues(now);
    gains[index].gain.setValueAtTime(positions[index] / FULL, now);
  };

  const bars = positions.map((_, index) => ({
    get value() {
      return positions[index];
    },
    set value(next: number) {
      positions[index] = Math.min(FULL, Math.max(0, Math.round(next)));
      hold(index);
    },
  }));
  positions.forEach((_, index) => hold(index));

  const registration = (wanted: number[]) => () => {
    wanted.forEach((position, index) => {
      positions[index] = position;
      hold(index);
    });
  };

  /*
   * The pluck, which is the whole of Part 14's Figure 12.
   *
   * Amplifier 1 takes time T, amplifier 2 takes T/2, amplifier n takes T/n - so
   * the high partials die first and the sound darkens on its own, with no
   * filter and no envelope on the output at all. There is no shared contour
   * here to make that happen: nine ramps of nine different lengths is the
   * entire mechanism.
   */
  const pluck = () => {
    const now = ac.currentTime;
    gains.forEach((gain, index) => {
      const from = positions[index] / FULL;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(from, now);
      gain.gain.linearRampToValueAtTime(0, now + time / (index + 1));
    });
  };

  const timeRef = {
    get value() {
      return time;
    },
    set value(next: number) {
      time = Math.max(0.05, next);
    },
  };

  return Compound({
    output: out,
    owns: [...oscillators, ...gains, mixer, level, analyser, scopeAnalyser],
    exposes: {
      oscillators,
      gains,
      mixer,
      analyser,
      scopeAnalyser,
      bars,
      time: timeRef,
      pluck,
      saw: registration(SAW),
      buzz: registration(BUZZ),
      drawbars: registration(DRAWBARS),
    },
  });
}

/** One drawbar, as a control. The label is the harmonic it is. */
const bar = (index: number) => ({
  id: `h${index + 1}`,
  kind: "slider" as const,
  label: index === 0 ? "1 (fundamental)" : `${index + 1}`,
  param: (s: ReturnType<typeof build>) => s.bars[index],
  min: 0,
  max: FULL,
  step: 1,
  default: DRAWBARS[index],
});

export default definePatch({
  id: "modulation/additive",
  label: "Nine sine waves",
  build,
  controls: [
    ...Array.from({ length: HARMONICS }, (_, index) => bar(index)),
    {
      id: "saw",
      kind: "button",
      label: "1/n",
      help: "The sawtooth's own recipe, as close as nine drawbars get.",
      action: (s) => s.saw,
    },
    {
      id: "buzz",
      kind: "button",
      label: "All equal",
      help: "Nine harmonics at full. Bright, and nothing in nature sounds like it.",
      action: (s) => s.buzz,
    },
    {
      id: "drawbars",
      kind: "button",
      label: "88 8000 000",
      help: "The Hammond registration: the first three harmonics, full out.",
      action: (s) => s.drawbars,
    },
    {
      id: "time",
      kind: "slider",
      label: "Decay",
      help: "How long the fundamental takes to die. The nth partial takes T/n.",
      param: (s) => s.time,
      min: 0.2,
      max: 6,
      scale: "time",
      unit: "s",
      default: TIME,
    },
    {
      id: "pluck",
      kind: "button",
      label: "Pluck",
      help: "Start every partial decaying, each at its own speed.",
      action: (s) => s.pluck,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "The nine",
      source: (s) => s.analyser,
      options: {
        marks: () =>
          Array.from(
            { length: HARMONICS },
            (_, index) => FUNDAMENTAL * (index + 1),
          ),
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.scopeAnalyser },
  ],
});
