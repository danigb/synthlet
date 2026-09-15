/*
 * A snare, and the handclap that is not in the book.
 *
 * Part 35 measures the drum and Part 36 builds it. The one number everybody
 * gets wrong is the body: the 0,1 mode of a drum head produces **two**
 * frequencies, about 180 Hz and about 330 Hz, and the ratio between them is
 * 1.83, not 2. The TR-909 used exactly those two, each with a VCA and a
 * contour of its own, and Reid points out that his own model does not - the
 * 0,1 partials "decay far faster, sometimes at more than twice the rate", so
 * the upper one here has a decay of its own.
 *
 * "Harder is noisier" is two of Reid's generalisations in one knob. The harder
 * the strike, the more energy there is at high frequencies; and "the more that
 * the snare interacts with the drum, the wider the modes become... eventually
 * changing into a complex noise spectrum". So `harder` raises the noise level
 * *and* opens the band-pass, and at the top of its travel the drum has stopped
 * being a drum with a rattle on it.
 *
 * **The handclap is not in Synth Secrets.** Parts 35 and 36 never mention one,
 * and Part 41's closing list names hand claps among the sounds Reid never got
 * to. The circuit here is `HandclapDrum`'s, which is the TR-808's: a burst of
 * band-passed noise chopped by a 100 Hz ramp, saturated. It is here because
 * the library ships it and because it belongs beside a snare, and the lesson
 * credits Roland rather than the book. `HandclapDrum` is where those numbers
 * come from, and 13c is why the reader cannot open that file from here.
 *
 * No diagram: three sources into a mixer (13b).
 */

import {
  AdAmp,
  ClipAmp,
  ClipType,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Noise,
  NoiseType,
  Oscillator,
  Param,
  Svf,
  SvfType,
} from "synthlet";
import { definePatch } from "../define";

/** The tone knob at 0.5 puts the lower mode on Reid's own 180 Hz. */
const TONE_LOW = 120;
const TONE_HIGH = 240;
/** Part 35's ratio. It is not an octave, and a snare tuned to one is wrong. */
const MODE_RATIO = 1.83;

const DEFAULT_TONE = 0.5;
const DEFAULT_DECAY = 0.25;
const DEFAULT_HARDER = 0.5;

/** The band-pass travels between these as the strike gets harder. */
const SPLASH_LOW = 700;
const SPLASH_HIGH = 3000;

const DRUMS = ["Snare", "Handclap"];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;
const CROSSFADE = 0.01;

function build(ac: AudioContext) {
  const trigger = Param.input(ac, 0);
  const tone = Param.input(ac, DEFAULT_TONE);
  const decay = Param.input(ac, DEFAULT_DECAY);

  // --- The body: two modes, two contours -----------------------------------
  const lower = Param.lin(ac, tone, TONE_LOW, TONE_HIGH);
  const upper = Param.mul(ac, lower, MODE_RATIO);
  // "Sometimes at more than twice the rate": the upper mode goes first.
  const fast = Param.mul(ac, decay, 0.45);

  const osc1 = Oscillator(ac, { type: "sine", frequency: lower });
  const osc2 = Oscillator(ac, { type: "sine", frequency: upper });
  const amp1 = AdAmp(ac, { trigger, attack: 0.001, decay });
  const amp2 = AdAmp(ac, { trigger, attack: 0.001, decay: fast });

  // --- The snares: filtered noise ------------------------------------------
  const noise = Noise(ac, { type: NoiseType.White });
  const splashCutoff = Param.input(
    ac,
    SPLASH_LOW + DEFAULT_HARDER * (SPLASH_HIGH - SPLASH_LOW),
  );
  const bp = Svf(ac, {
    type: SvfType.BandPass,
    frequency: splashCutoff,
    Q: 1,
  });
  const splash = AdAmp(ac, { trigger, attack: 0.001, decay });
  const noiseLevel = Gain.val(ac, 0.2 + DEFAULT_HARDER * 0.8);

  const drumMix = Gain.val(ac, 1);

  // --- The clap: the TR-808's, not the book's ------------------------------
  const bpClap = Svf(ac, { type: SvfType.BandPass, frequency: 1000, Q: 1 });
  const clapAmp = AdAmp(ac, { trigger, attack: 0.002, decay });
  const ramp = Lfo(ac, { type: LfoType.RampUp, frequency: 100 });
  const chop = Gain(ac, { gain: ramp });
  const clapClip = ClipAmp(ac, {
    type: ClipType.Tanh,
    preGain: 2,
    postGain: 0.5,
  });
  const clapMix = Gain.val(ac, 0);

  const bus = Gain.val(ac, 1);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.5;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc1.connect(amp1).connect(drumMix);
  osc2.connect(amp2).connect(drumMix);
  noise.connect(bp).connect(splash).connect(noiseLevel).connect(drumMix);
  drumMix.connect(bus);

  noise.connect(bpClap).connect(clapAmp).connect(chop).connect(clapClip);
  clapClip.connect(clapMix).connect(bus);

  bus.connect(analyser).connect(level).connect(out);

  let strength = DEFAULT_HARDER;
  const harder = {
    get value() {
      return strength;
    },
    set value(next: number) {
      strength = Math.min(1, Math.max(0, next));
      const now = ac.currentTime;
      noiseLevel.gain.setTargetAtTime(0.2 + strength * 0.8, now, CROSSFADE);
      splashCutoff.input.setTargetAtTime(
        SPLASH_LOW + strength * (SPLASH_HIGH - SPLASH_LOW),
        now,
        CROSSFADE,
      );
    },
  };

  let which = 0;
  const drum = {
    get value() {
      return which;
    },
    set value(next: number) {
      which = Math.min(1, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      drumMix.gain.setTargetAtTime(which === 0 ? 1 : 0, now, CROSSFADE);
      clapMix.gain.setTargetAtTime(which === 0 ? 0 : 1, now, CROSSFADE);
    },
  };

  return Compound({
    output: out,
    owns: [
      trigger,
      tone,
      decay,
      lower,
      upper,
      fast,
      osc1,
      osc2,
      amp1,
      amp2,
      noise,
      splashCutoff,
      bp,
      splash,
      noiseLevel,
      drumMix,
      bpClap,
      clapAmp,
      ramp,
      chop,
      clapClip,
      clapMix,
      bus,
      analyser,
      level,
    ],
    exposes: {
      trigger,
      tone,
      decay,
      osc1,
      osc2,
      bp,
      noiseLevel,
      analyser,
      harder,
      drum,
    },
  });
}

export default definePatch({
  id: "recipes/snare",
  label: "Snare and clap",
  build,
  controls: [
    {
      id: "tone",
      kind: "slider",
      label: "Tone",
      help: "Where the 0,1 pair sits. At the middle it is Reid's 180 and 330 Hz.",
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
      help: "The body's time. The upper mode takes less than half of it, as a real one does.",
      param: (s) => s.decay.input,
      min: 0.05,
      max: 0.8,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "harder",
      kind: "slider",
      label: "Harder",
      help: "More noise and a higher band together: a harder strike is a noisier one.",
      param: (s) => s.harder,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_HARDER,
    },
    {
      id: "drum",
      kind: "select",
      label: "Drum",
      help: "The same noise generator, chopped by a 100 Hz ramp, is a handclap.",
      param: (s) => s.drum,
      options: DRUMS,
      default: 0,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Hit it",
      help: "Every envelope in the patch fires from this one pulse.",
      param: (s) => s.trigger.input,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The two modes, so the 1.83 between them is something you can see as
      // well as hear. Read off the tone knob rather than off the oscillator:
      // an `AudioParam` fed by a node still reports its own intrinsic value.
      options: {
        marks: (s) => {
          const f = TONE_LOW + s.tone.input.value * (TONE_HIGH - TONE_LOW);
          return [f, f * MODE_RATIO];
        },
      },
    },
  ],
});
