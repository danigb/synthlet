/*
 * Sixteen filters, sixteen followers, sixteen amplifiers.
 *
 * A vocoder is an envelope follower done sixteen times at once. Split the
 * *modulator* into bands, follow the loudness of each one, and use those
 * sixteen control voltages to open sixteen amplifiers fed by the matching bands
 * of a *carrier*. The carrier ends up wearing the modulator's spectrum, which
 * is what "the robot voice" actually is - the modulator does not have to be a
 * voice at all, and here it is not: it is the site's music clip, because a
 * spoken-word asset is not something this chapter gets to add.
 *
 * What a vocoder needs of its modulator is a spectrum that *moves*. Music has
 * one. Speech has a more interesting one, and that is the whole difference.
 *
 * It costs 48 worklets - two `Svf`s and an `EnvelopeFollower` per band - plus
 * the gains, and this is the page where the reader hears what that buys.
 *
 * One file, because a `.ts` under `learn/patches/` that is not an index and not
 * a test has to be a registered patch: there is nowhere to put a helper, and
 * the whole of it is what "View the code" should show anyway.
 */

import {
  Compound,
  EnvelopeFollower,
  Gain,
  Noise,
  NoiseType,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  TimestretchAudioSource,
} from "synthlet";
import { definePatch, type ValueRef } from "../define";

const CLIP = "/synthlet/track14.mp3";

const BANDS = 16;
const LOW_HZ = 150;
const HIGH_HZ = 6000;

/** Log-spaced, because the ear divides the spectrum into ratios. */
const centre = (index: number) =>
  LOW_HZ * (HIGH_HZ / LOW_HZ) ** (index / (BANDS - 1));

/** How many bands each option opens, and how wide they have to be. */
const BAND_COUNTS = [4, 8, 16];
const BAND_Q = [1, 2, 4];

const RELEASE = 0.05;
const CROSSFADE = 0.02;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  // The modulator. Never routed to the output: what is heard is the carrier
  // wearing its shape.
  const modulator = TimestretchAudioSource(ac, { playbackRate: 1 });
  const ready =
    typeof window === "undefined"
      ? Promise.resolve()
      : fetch(CLIP)
          .then((response) => response.arrayBuffer())
          .then((bytes) => ac.decodeAudioData(bytes))
          .then((buffer) => {
            modulator.setBuffer(buffer);
            modulator.loop.value = 1;
            modulator.start();
          })
          .catch(() => {});

  // The carrier: something with energy at every frequency the bands look at.
  // A sawtooth has harmonics to be carved; noise has everything at once, which
  // is what a whisper is.
  const saw = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: 110,
  });
  const noise = Noise(ac, { type: NoiseType.White });
  const sawGain = Gain.val(ac, 1);
  const noiseGain = Gain.val(ac, 0);
  const carrier = Gain.val(ac, 1);
  saw.connect(sawGain).connect(carrier);
  noise.connect(noiseGain).connect(carrier);

  const mix = Gain.val(ac, 1);

  const analysisBands: ReturnType<typeof Svf>[] = [];
  const followers: ReturnType<typeof EnvelopeFollower>[] = [];
  const carrierBands: ReturnType<typeof Svf>[] = [];
  const vcas: ReturnType<typeof Gain.val>[] = [];
  const enables: ReturnType<typeof Gain.val>[] = [];

  for (let i = 0; i < BANDS; i++) {
    const frequency = centre(i);

    const analysis = Svf(ac, {
      type: SvfType.BandPass,
      frequency,
      Q: BAND_Q[2],
    });
    modulator.connect(analysis);

    const follower = EnvelopeFollower(ac, {
      gain: 8,
      attack: 0.01,
      release: RELEASE,
    });
    analysis.connect(follower);

    const band = Svf(ac, {
      type: SvfType.BandPass,
      frequency,
      Q: BAND_Q[2],
    });
    carrier.connect(band);

    // Closed, and opened by its follower: the band's loudness *is* its gain.
    const vca = Gain.val(ac, 0);
    band.connect(vca);
    follower.connect(vca.gain);

    const enable = Gain.val(ac, 1);
    vca.connect(enable).connect(mix);

    analysisBands.push(analysis);
    followers.push(follower);
    carrierBands.push(band);
    vcas.push(vca);
    enables.push(enable);
  }

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  mix.connect(analyser).connect(level).connect(out);

  let bandsIndex = 2;
  let carrierIndex = 0;
  let release = RELEASE;

  // Fewer bands is not the same set with holes in it: the ones that stay have
  // to get wider, or four bands is four narrow whistles with silence between
  // them rather than a coarse picture of the spectrum.
  const applyBands = () => {
    const count = BAND_COUNTS[bandsIndex];
    const every = BANDS / count;
    const q = BAND_Q[bandsIndex];
    const now = ac.currentTime;
    for (let i = 0; i < BANDS; i++) {
      enables[i].gain.setTargetAtTime(i % every === 0 ? 1 : 0, now, CROSSFADE);
      analysisBands[i].Q.value = q;
      carrierBands[i].Q.value = q;
    }
  };
  applyBands();

  const bands: ValueRef = {
    get value() {
      return bandsIndex;
    },
    set value(next: number) {
      bandsIndex = Math.min(2, Math.max(0, Math.round(next)));
      applyBands();
    },
  };

  const carrierRef: ValueRef = {
    get value() {
      return carrierIndex;
    },
    set value(next: number) {
      carrierIndex = next > 0.5 ? 1 : 0;
      const now = ac.currentTime;
      sawGain.gain.setTargetAtTime(carrierIndex === 0 ? 1 : 0, now, CROSSFADE);
      noiseGain.gain.setTargetAtTime(
        carrierIndex === 1 ? 0.5 : 0,
        now,
        CROSSFADE,
      );
    },
  };

  const releaseRef: ValueRef = {
    get value() {
      return release;
    },
    set value(next: number) {
      release = Math.min(0.5, Math.max(0.01, next));
      for (const follower of followers) follower.release.value = release;
    },
  };

  return Compound({
    output: out,
    owns: [
      modulator,
      saw,
      noise,
      sawGain,
      noiseGain,
      carrier,
      ...analysisBands,
      ...followers,
      ...carrierBands,
      ...vcas,
      ...enables,
      mix,
      analyser,
      level,
    ],
    exposes: {
      modulator,
      saw,
      noise,
      // Band 0 of each rank, which is the band the diagram draws.
      analysisBand: analysisBands[0],
      follower: followers[0],
      carrierBand: carrierBands[0],
      vca: vcas[0],
      analysisBands,
      followers,
      carrierBands,
      analyser,
      bands,
      carrier: carrierRef,
      release: releaseRef,
      ready,
    },
  });
}

export default definePatch({
  id: "time/vocoder",
  label: "The vocoder",
  build,
  controls: [
    {
      id: "bands",
      kind: "select",
      label: "Bands",
      help: "How finely the modulator's spectrum is measured.",
      param: (s) => s.bands,
      options: ["4", "8", "16"],
      default: 2,
    },
    {
      id: "carrier",
      kind: "select",
      label: "Carrier",
      help: "What wears the spectrum. Noise is a whisper.",
      param: (s) => s.carrier,
      options: ["Sawtooth", "Noise"],
      default: 0,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "How fast each band's follower lets go. Long is a smear.",
      param: (s) => s.release,
      min: 0.01,
      max: 0.5,
      scale: "time",
      unit: "s",
      default: RELEASE,
    },
  ],
  views: [
    { kind: "spectrum", label: "The output", source: (s) => s.analyser },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "diagram" },
  ],
  /*
   * One band of sixteen, with the analysis side folded into a controller.
   *
   * The real graph has two audio chains - the modulator's and the carrier's -
   * meeting at a gain, and the layout puts every box an audio cable touches in
   * one row (ticket `11c`). So the modulator, its band-pass and its follower
   * are one controller box, which is legal because a `controller` label is not
   * checked against the patch's imports; only a `source` or a `modifier` label
   * has to be a module name (ticket `10c`).
   */
  diagram: {
    nodes: [
      {
        id: "carrier",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "saw",
        controls: ["carrier"],
      },
      {
        id: "band",
        label: "Svf",
        kind: "modifier",
        exposedAs: "carrierBand",
        controls: ["bands"],
      },
      { id: "vca", label: "Gain", kind: "modifier", exposedAs: "vca" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "follower",
        label: "clip → Svf → EnvelopeFollower",
        kind: "controller",
        exposedAs: ["modulator", "analysisBand", "follower"],
        controls: ["release"],
      },
    ],
    edges: [
      { from: "carrier", to: "band" },
      { from: "band", to: "vca" },
      { from: "vca", to: "out" },
      { from: "follower", to: "vca", param: "gain" },
    ],
  },
});
