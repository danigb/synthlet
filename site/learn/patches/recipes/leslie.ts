/*
 * A rotary speaker cabinet: three modulations, two bands, one switch.
 *
 * Parts 58 and 59 take the Leslie apart, and the thing worth keeping is that
 * it is not one effect. A horn swinging round on the end of a duct does three
 * separate things to the sound, and Reid separates them:
 *
 * 1. **Pitch.** Doppler, and "quite small - around +/-1 percent". The depth
 *    here is therefore *computed rather than chosen*: a sinusoidal delay of
 *    amplitude A at rate r shifts the pitch by 2*pi*r*A, so a wobble of one
 *    percent wants `A = 0.01 / (2*pi*r)` - about two milliseconds at the
 *    chorale speed and a third of that at the tremolo speed. One line, and the
 *    Doppler stays at one percent at both speeds because the physics says so.
 * 2. **Loudness.** The horn is loudest when it points at you and moving
 *    fastest towards you a quarter of a turn earlier, so **the vibrato is
 *    ninety degrees out of phase with the tremolo**. That is why `Lfo`'s
 *    `phase` is a construction option and not a parameter: this patch needs
 *    two LFOs at one rate, a quarter cycle apart, and needs them to stay that
 *    way through a speed change.
 * 3. **Tone.** A horn pointing away from you is duller as well as quieter, and
 *    Reid is explicit that this modulation is **in phase with the loudness**,
 *    not ninety degrees from it. So the low-pass reads the tremolo's own LFO.
 *
 * The crossover is **800 Hz**, which is his number. The rotation speeds are
 * not: Reid gives none at all, beyond noting that the rotor can be "slower
 * than 1 Hz". So 0.9 Hz and 6.5 Hz, and the drum at 0.8 times the horn, are
 * this patch's choices, and the lesson says so.
 *
 * The spin-up is a `SlewLimiter` on the speed, which is Reid's own mechanism -
 * "a slew generator smoothing between" the two speed CVs - and the horn and
 * the drum have different transition rates as well as different speeds.
 *
 * The delay sits at 30 ms rather than at a few milliseconds because
 * `AnalogDelay.time` bottoms out at 20: the hardware it models did. The wobble
 * on top of it is the same wobble.
 *
 * A drone, not a keyboard: the cabinet is the lesson.
 *
 * No diagram: two bands (13b).
 */

import {
  AnalogDelay,
  AnalogDelayMode,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Oscillator,
  Param,
  SlewLimiter,
  SlewType,
  Svf,
  SvfType,
} from "synthlet";
import { definePatch } from "../define";

/** Root, fifth, octave: the smallest thing that is recognisably an organ. */
const REGISTRATION = [220, 330, 440];

/** Part 58's crossover, and the only speed-related number he gives is "< 1 Hz". */
const CROSSOVER = 800;
const CHORALE = 0.9;
const TREMOLO = 6.5;
/** The drum is slower than the horn, and Reid says so without saying how much. */
const DRUM_RATIO = 0.8;

const SPEEDS = ["Chorale (slow)", "Tremolo (fast)"];
const RATE = [CHORALE, TREMOLO];

const DEFAULT_DEPTH = 0.6;

/** Reid's Doppler: "around +/-1 percent". */
const DOPPLER = 0.01;
/** The delay `AnalogDelay` will go down to, plus room for the wobble. */
const BASE_TIME = 0.03;

/** How fast the depth follows a speed change. It rides the slew. */
const SPIN = 1.5;

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

/** The delay amplitude that keeps the pitch wobble at one percent, at `rate`. */
const excursion = (rate: number) => DOPPLER / (2 * Math.PI * rate);

function build(ac: AudioContext) {
  const oscillators = REGISTRATION.map((frequency) =>
    Oscillator(ac, { type: "sine", frequency }),
  );
  const src = Gain.val(ac, 0.3);
  oscillators.forEach((osc) => osc.connect(src));

  // One number for both filters, so they cannot disagree about the corner.
  const crossover = Param.input(ac, CROSSOVER);
  const hp = Svf(ac, {
    type: SvfType.HighPass,
    frequency: crossover,
    Q: Math.SQRT1_2,
  });
  const lp = Svf(ac, {
    type: SvfType.LowPass,
    frequency: crossover,
    Q: Math.SQRT1_2,
  });
  src.connect(hp);
  src.connect(lp);

  // The speed, before it is smoothed: one CV for the whole cabinet.
  const speedRef = Param.input(ac, CHORALE);

  /** One rotor: a delay for the Doppler, a tremolo, and a tone that follows it. */
  const rotor = (
    input: AudioNode,
    ratio: number,
    rise: number,
    fall: number,
    corner: number,
  ) => {
    const scaled = Param.mul(ac, speedRef, ratio);
    const slew = SlewLimiter(ac, { type: SlewType.Exponential, rise, fall });
    scaled.connect(slew);

    const vibrato = Lfo(ac, {
      type: LfoType.Sine,
      frequency: slew,
      gain: excursion(CHORALE * ratio),
    });
    const delay = AnalogDelay(ac, {
      mode: AnalogDelayMode.Bbd,
      time: BASE_TIME,
      feedback: 0,
      mix: 1,
      wobble: 0.2,
    });
    vibrato.connect(delay.time);

    // A quarter cycle behind the vibrato, and the tone rides this one.
    const tremolo = Lfo(ac, {
      type: LfoType.Sine,
      frequency: slew,
      phase: 0.25,
      gain: DEFAULT_DEPTH / 2,
      offset: 1 - DEFAULT_DEPTH / 2,
    });
    const amp = Gain(ac, { gain: tremolo });
    // The same LFO again, scaled into hertz: the corner dips exactly when the
    // loudness does. Reid is explicit that these two are in phase with each
    // other and ninety degrees from the pitch.
    const toneDepth = Param.mul(ac, tremolo, corner);
    const tone = Svf(ac, {
      type: SvfType.LowPass,
      frequency: toneDepth,
      Q: Math.SQRT1_2,
    });

    input.connect(delay).connect(amp).connect(tone);

    return {
      ratio,
      scaled,
      slew,
      vibrato,
      delay,
      tremolo,
      amp,
      tone,
      toneDepth,
      output: tone,
      owns: [scaled, slew, vibrato, delay, tremolo, amp, tone, toneDepth],
    };
  };

  const horn = rotor(hp, 1, 3, 2, 2500);
  const drum = rotor(lp, DRUM_RATIO, 5, 4, 600);

  const bus = Gain.val(ac, 1);
  horn.output.connect(bus);
  drum.output.connect(bus);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  bus.connect(analyser).connect(level).connect(out);

  let which = 0;
  const speed = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      // The rate spins up through each rotor's own slew generator, which is
      // Reid's mechanism. The depth has to follow it, because there is no
      // reciprocal node in the library to divide by a moving rate - so it
      // rides the same change with a matching time constant.
      speedRef.input.setValueAtTime(RATE[which], now);
      [horn, drum].forEach((band) => {
        band.vibrato.gain.setTargetAtTime(
          excursion(RATE[which] * band.ratio),
          now,
          SPIN,
        );
      });
    },
  };

  let depthAmount = DEFAULT_DEPTH;
  const depth = {
    get value() {
      return depthAmount;
    },
    set value(next: number) {
      depthAmount = Math.min(1, Math.max(0, next));
      const now = ac.currentTime;
      [horn, drum].forEach((band) => {
        band.tremolo.gain.setTargetAtTime(depthAmount / 2, now, 0.02);
        band.tremolo.offset.setTargetAtTime(1 - depthAmount / 2, now, 0.02);
      });
    },
  };

  return Compound({
    output: out,
    owns: [
      ...oscillators,
      src,
      crossover,
      hp,
      lp,
      speedRef,
      ...horn.owns,
      ...drum.owns,
      bus,
      analyser,
      level,
    ],
    exposes: {
      oscillators,
      hp,
      lp,
      crossover,
      horn: horn.delay,
      drum: drum.delay,
      analyser,
      speed,
      depth,
    },
  });
}

export default definePatch({
  id: "recipes/leslie",
  label: "Leslie",
  build,
  controls: [
    {
      id: "speed",
      kind: "select",
      label: "Speed",
      help: "Switch it and listen to the spin-up: the horn gets there before the drum.",
      param: (s) => s.speed,
      options: SPEEDS,
      default: 0,
    },
    {
      id: "depth",
      kind: "slider",
      label: "Depth",
      help: "The loudness and tone modulation. The pitch wobble stays at one percent.",
      param: (s) => s.depth,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_DEPTH,
    },
    {
      id: "crossover",
      kind: "slider",
      label: "Crossover",
      help: "800 Hz is Reid's. Above it goes to the horn, below it to the drum.",
      param: (s) => s.crossover.input,
      min: 200,
      max: 2000,
      scale: "log",
      unit: "Hz",
      default: CROSSOVER,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
    { kind: "spectrum", label: "Spectrum", source: (s) => s.analyser },
    { kind: "meter", label: "Level" },
  ],
});
