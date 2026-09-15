/*
 * Six squares and three filters, and then the digital ride that uses no noise
 * at all.
 *
 * Part 39's TR-808 cymbal is six square waves "tuned enharmonically", split
 * into three bands by filters, each band given its own amplifier and its own
 * attack-decay contour, with **the highest band decaying fastest**, then
 * high-passed and recombined by a Tone control. Everything in that sentence is
 * Reid's - except the six frequencies, which he never gives. The
 * `[263, 400, 421, 474, 587, 845]` below is `drums.ts`'s choice, which is this
 * library's, and the lesson says which half of the recipe is a citation.
 * `CymbalDrum` is the shipped version of this chain, and 13c is why "View the
 * code" cannot show it.
 *
 * The hi-hat is Part 38's own point rather than a second bank: a hi-hat is a
 * cymbal with the bands moved and the decays shortened, so `mode` moves them.
 *
 * Mode 2 is Reid's Nord Micro Modular patch, with his numbers: a pulse
 * modulator at about 1 kHz driving a square carrier at about 2.5 kHz through
 * both linear and logarithmic FM at maximum; a band-pass swept down to 1 kHz
 * over a fifth of a second for the ping; a high-pass at 2.64 kHz opening over
 * about 200 ms and closing over 3.7 seconds for the tail, mixed **louder than
 * the ping**; and a final contour with a 0.75 second decay over the sum. It
 * contains no noise generator anywhere, which is the lesson's punchline.
 *
 * Reid's high-pass "opens and closes" as a contour on the band rather than as
 * a moving corner here: the corner is fixed at his 2.64 kHz and the envelope
 * is on the amplifier after it, which is the same shape with one fewer thing
 * to get wrong.
 *
 * No diagram: nine sources (13b).
 */

import {
  AdAmp,
  AdEnv,
  Compound,
  Gain,
  Oscillator,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
} from "synthlet";
import { definePatch } from "../define";

/** `drums.ts`'s six. Reid says "enharmonic" and gives no numbers. */
const OSC_BANK = [263, 400, 421, 474, 587, 845];

/** The three bands, as the two ends of the Tone knob's travel. */
const BANDS = [
  { type: SvfType.LowPass, low: 300, high: 700, decay: 0.5 },
  { type: SvfType.BandPass, low: 700, high: 1700, decay: 0.2 },
  { type: SvfType.HighPass, low: 2500, high: 5500, decay: 5 },
];

/** `CymbalDrum`'s multipliers, and they are upside down on purpose. */
const DEFAULT_LEVELS = [0.3, 0.6, 0.8];
/** A hi-hat is the same bank with the low band down and everything shorter. */
const HAT_LEVELS = [0.35, 1, 1.4];
const HAT_DECAY_SCALE = 0.25;

const DEFAULT_TONE = 0.5;
const DEFAULT_DECAY = 0.4;

const MODES = [
  "Cymbal — six squares, three bands",
  "Hi-hat — the short one",
  "FM ping — the digital ride",
];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

function build(ac: AudioContext) {
  const trigger = Param.input(ac, 0);
  const tone = Param.input(ac, DEFAULT_TONE);
  const decay = Param.input(ac, DEFAULT_DECAY);
  const decayScale = Param.input(ac, 1);
  const scaled = Param.mul(ac, decay, decayScale);

  // --- The bank: six squares -----------------------------------------------
  const bank = OSC_BANK.map((frequency) =>
    Oscillator(ac, { type: "square", frequency }),
  );
  const bankOut = Gain.val(ac, 0.3);
  bank.forEach((osc) => osc.connect(bankOut));

  // --- Three bands, each with its own decay --------------------------------
  const cutoffs = BANDS.map((band) => Param.lin(ac, tone, band.low, band.high));
  const filters = BANDS.map((band, index) =>
    Svf(ac, { type: band.type, frequency: cutoffs[index], Q: 1 }),
  );
  const decays = BANDS.map((band) => Param.mul(ac, scaled, band.decay));
  const amps = BANDS.map((_, index) =>
    AdAmp(ac, { trigger, attack: 0.001, decay: decays[index] }),
  );
  const levels = DEFAULT_LEVELS.map((value) => Gain.val(ac, value));
  const tilts = DEFAULT_LEVELS.map(() => Gain.val(ac, 1));
  const bankMix = Gain.val(ac, 1);

  filters.forEach((filter, index) => {
    bankOut.connect(filter);
    filter
      .connect(amps[index])
      .connect(levels[index])
      .connect(tilts[index])
      .connect(bankMix);
  });

  // --- Mode 2: the Nord ride -----------------------------------------------
  const fmMod = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: 1000,
  });
  // "Both linear and logarithmic FM inputs at maximum": a very deep index.
  const fmDepth = Param.mul(ac, fmMod, 9000);
  const fmCar = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Square,
    frequency: 2500,
  });
  fmDepth.connect(fmCar.frequency);

  const pingEnv = AdEnv(ac, {
    trigger,
    attack: 0.001,
    decay: 0.2,
    offset: 1000,
    gain: 6000,
  });
  const ping = Svf(ac, { type: SvfType.BandPass, frequency: pingEnv, Q: 8 });
  const pingGain = Gain.val(ac, 0.5);

  const tail = Svf(ac, {
    type: SvfType.HighPass,
    frequency: 2640,
    Q: Math.SQRT1_2,
  });
  const tailAmp = AdAmp(ac, { trigger, attack: 0.2, decay: 3.7 });
  const tailGain = Gain.val(ac, 1);

  const fmAmp = AdAmp(ac, { trigger, attack: 0.001, decay: 0.75 });
  const fmMix = Gain.val(ac, 0);

  fmCar.connect(ping).connect(pingGain).connect(fmAmp);
  fmCar.connect(tail).connect(tailAmp).connect(tailGain).connect(fmAmp);
  fmAmp.connect(fmMix);

  const bus = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.5;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  bankMix.connect(bus);
  fmMix.connect(bus);
  bus.connect(analyser).connect(level).connect(out);

  let which = 0;
  const mode = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(MODES.length - 1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      const hat = which === 1;
      const fm = which === 2;
      bankMix.gain.setTargetAtTime(fm ? 0 : 1, now, CROSSFADE);
      fmMix.gain.setTargetAtTime(fm ? 1 : 0, now, CROSSFADE);
      decayScale.input.setTargetAtTime(
        hat ? HAT_DECAY_SCALE : 1,
        now,
        CROSSFADE,
      );
      tilts.forEach((tilt, index) => {
        const value = hat ? HAT_LEVELS[index] : 1;
        tilt.gain.setTargetAtTime(value, now, CROSSFADE);
      });
    },
  };

  return Compound({
    output: out,
    owns: [
      trigger,
      tone,
      decay,
      decayScale,
      scaled,
      ...bank,
      bankOut,
      ...cutoffs,
      ...filters,
      ...decays,
      ...amps,
      ...levels,
      ...tilts,
      bankMix,
      fmMod,
      fmDepth,
      fmCar,
      pingEnv,
      ping,
      pingGain,
      tail,
      tailAmp,
      tailGain,
      fmAmp,
      fmMix,
      bus,
      analyser,
      level,
    ],
    exposes: {
      trigger,
      tone,
      decay,
      bank,
      filters,
      levels,
      fmCar,
      fmMod,
      analyser,
      mode,
      low: levels[0].gain,
      mid: levels[1].gain,
      high: levels[2].gain,
    },
  });
}

export default definePatch({
  id: "recipes/cymbals",
  label: "Cymbals and hats",
  build,
  controls: [
    {
      id: "tone",
      kind: "slider",
      label: "Tone",
      help: "Where the three bands sit. The 808's front panel had this and the decay.",
      param: (s) => s.tone.input,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_TONE,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "The low band's time. The other two scale off it, and the highest is longest.",
      param: (s) => s.decay.input,
      min: 0.02,
      max: 2,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "low",
      kind: "slider",
      label: "Low band",
      help: "The body of the crash. Take it away and you have a hi-hat.",
      param: (s) => s.low,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_LEVELS[0],
    },
    {
      id: "mid",
      kind: "slider",
      label: "Mid band",
      help: "The band-pass in the middle, and the shortest of the three.",
      param: (s) => s.mid,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_LEVELS[1],
    },
    {
      id: "high",
      kind: "slider",
      label: "High band",
      help: "The shimmer. Boyk measured 40 % of a crash's energy above 20 kHz.",
      param: (s) => s.high,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_LEVELS[2],
    },
    {
      id: "mode",
      kind: "select",
      label: "Mode",
      help: "Two settings of one bank, and then a ride made of two oscillators.",
      param: (s) => s.mode,
      options: MODES,
      default: 0,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Hit it",
      help: "Every contour in the patch, fired at once.",
      param: (s) => s.trigger.input,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The six squares, so the word "enharmonic" is a picture: no two of them
      // are a whole-number ratio apart.
      options: { marks: () => OSC_BANK },
    },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
  ],
});
