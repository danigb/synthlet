/*
 * The loudness of one sound, driving another.
 *
 * Part 15's Figure 9 replaces the contour generator with an envelope
 * *follower*: rectify a signal, charge and discharge a capacitor from it, and
 * what comes out is a control voltage shaped like the sound went in. Point that
 * at a cutoff and the filter plays itself - an auto-wah, which is what a wah
 * pedal is without the foot. Invert it and point it at a gain instead and you
 * have the other thing everybody uses a follower for: a pad that gets out of
 * the way every time the other sound hits.
 *
 * The signal being followed is the site's own music clip, loaded exactly the
 * way `site/examples/EnvelopeFollowerExample.tsx` loads it. The load is the
 * compound's `ready`, and it is guarded: the kit waits for that promise before
 * it reads a single control, so a promise that never settles is a widget whose
 * Play button never comes back.
 */

import {
  Compound,
  EnvelopeFollower,
  EnvelopeFollowerType,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  TimestretchAudioSource,
} from "synthlet";
import { definePatch, type ValueRef } from "../define";

/** The one clip the site has. `/synthlet` is the base path in every build. */
const CLIP = "/synthlet/track14.mp3";

const ATTACK = 0.01;
const RELEASE = 0.1;
const AMOUNT = 0.6;

/** What "amount 1" means in each mode: hertz of cutoff, and units of gain. */
const FULL = [5000, 1];

/** The filter's resting cutoff, per mode: wahing, and out of the way. */
const BASE = [300, 18000];

/** The three sawtooths the pad is made of. */
const PAD_HZ = [110, 165, 220];

const CROSSFADE = 0.02;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const source = TimestretchAudioSource(ac, { playbackRate: 1 });

  // The guard and the `catch` are both load-bearing. `ready` has to resolve in
  // an environment with no `fetch` at all, and a rejection nobody handles takes
  // the whole test suite with it.
  const ready =
    typeof window === "undefined"
      ? Promise.resolve()
      : fetch(CLIP)
          .then((response) => response.arrayBuffer())
          .then((bytes) => ac.decodeAudioData(bytes))
          .then((buffer) => {
            source.setBuffer(buffer);
            source.loop.value = 1;
            source.start();
          })
          .catch(() => {});

  const follower = EnvelopeFollower(ac, {
    type: EnvelopeFollowerType.Peak,
    gain: 4,
    attack: ATTACK,
    release: RELEASE,
  });
  source.connect(follower);

  // The wah arm: the clip through a resonant low-pass whose corner is the
  // follower's output, scaled.
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: BASE[0],
    Q: 6,
  });
  const wahAmount = Param.mul(ac, follower, AMOUNT * FULL[0]);
  source.connect(filter);
  wahAmount.connect(filter.frequency);
  const clipVca = Gain.val(ac, 1);
  filter.connect(clipVca);

  // The duck arm: a pad at unity, with the follower subtracted from its gain.
  // That is the whole of a sidechain compressor, minus the marketing.
  const padOscs = PAD_HZ.map((frequency) =>
    PolyblepOscillator(ac, {
      type: PolyblepOscillatorType.Sawtooth,
      frequency,
    }),
  );
  const padMix = Gain.val(ac, 0.25);
  padOscs.forEach((osc) => osc.connect(padMix));
  const padFilter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: 1800,
    Q: 1,
  });
  const padVca = Gain.val(ac, 1);
  const duckAmount = Param.mul(ac, follower, 0);
  padMix.connect(padFilter).connect(padVca);
  duckAmount.connect(padVca.gain);
  const padArm = Gain.val(ac, 0);
  padVca.connect(padArm);

  const mix = Gain.val(ac, 1);
  clipVca.connect(mix);
  padArm.connect(mix);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const followerAnalyser = ac.createAnalyser();
  followerAnalyser.fftSize = 2048;
  follower.connect(followerAnalyser);

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  mix.connect(analyser).connect(level).connect(out);

  let mode = 0;
  let amount = AMOUNT;

  // One knob, two units - the `modulation/lfo-destinations` arrangement. Only
  // the live arm's depth is non-zero, so the other one cannot leak.
  const route = () => {
    wahAmount.gain.value = mode === 0 ? amount * FULL[0] : 0;
    duckAmount.gain.value = mode === 1 ? -amount * FULL[1] : 0;
  };
  route();

  const modeRef: ValueRef = {
    get value() {
      return mode;
    },
    set value(next: number) {
      mode = next > 0.5 ? 1 : 0;
      const now = ac.currentTime;
      filter.frequency.setTargetAtTime(BASE[mode], now, CROSSFADE);
      // In duck mode the clip stays audible but drops, so the pumping is
      // against something rather than in a silence.
      clipVca.gain.setTargetAtTime(mode === 0 ? 1 : 0.5, now, CROSSFADE);
      padArm.gain.setTargetAtTime(mode === 0 ? 0 : 1, now, CROSSFADE);
      route();
    },
  };

  const amountRef: ValueRef = {
    get value() {
      return amount;
    },
    set value(next: number) {
      amount = Math.min(1, Math.max(0, next));
      route();
    },
  };

  return Compound({
    output: out,
    owns: [
      source,
      follower,
      filter,
      wahAmount,
      clipVca,
      ...padOscs,
      padMix,
      padFilter,
      padVca,
      duckAmount,
      padArm,
      mix,
      analyser,
      followerAnalyser,
      level,
    ],
    exposes: {
      source,
      follower,
      filter,
      analyser,
      followerAnalyser,
      mode: modeRef,
      amount: amountRef,
      ready,
    },
  });
}

export default definePatch({
  id: "time/follower",
  label: "The envelope follower",
  build,
  controls: [
    {
      id: "mode",
      kind: "select",
      label: "Destination",
      help: "The same follower, pointed at a cutoff or at a gain.",
      param: (s) => s.mode,
      options: ["Auto-wah", "Ducking"],
      default: 0,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "How fast the capacitor charges. Short catches every transient.",
      param: (s) => s.follower.attack,
      min: 0,
      max: 0.5,
      scale: "time",
      unit: "s",
      default: ATTACK,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "How fast it discharges. Long is a smooth envelope, short a gate.",
      param: (s) => s.follower.release,
      min: 0.01,
      max: 2,
      scale: "time",
      unit: "s",
      default: RELEASE,
    },
    {
      id: "amount",
      kind: "slider",
      label: "Amount",
      help: "How far the follower moves whatever it is pointed at.",
      param: (s) => s.amount,
      min: 0,
      max: 1,
      step: 0.01,
      default: AMOUNT,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "The follower",
      source: (s) => s.followerAnalyser,
      options: { window: "contour", seconds: 3 },
    },
    {
      kind: "spectrum",
      label: "The sound",
      source: (s) => s.analyser,
      options: { marks: (s) => [s.filter.frequency.value] },
    },
  ],
  // No diagram: two arms and a tap off the source before either of them.
});
