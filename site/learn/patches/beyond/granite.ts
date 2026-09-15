/*
 * A sound cut into grains and thrown back out again.
 *
 * Granular synthesis is Gabor's 1947 idea and Xenakis's 1971 music, and it is
 * not in Synth Secrets at all: in 1999 it was a thing academic studios did.
 * The premise is that any sound can be described as a cloud of very short
 * windowed fragments, and that once you are describing it that way you can
 * change the density, the length, the pitch and the order of the fragments
 * independently of one another.
 *
 * `Granite` is a granular *delay*: it granulates whatever is patched into it,
 * reading grains out of a rolling buffer of the last few seconds. So the source
 * here is the site's one clip, looping, and the module is run fully wet -
 * the dry signal is just the clip, and the lesson is the grains.
 *
 * Every per-grain quantity is a centre and a spread, drawn once per grain,
 * which is Truax's control model. Every spread defaults to 0, where the module
 * is deterministic and every grain is identical; turning them up is what makes
 * a cloud out of a stream.
 *
 * `build` is synchronous and a fetch is not, so the patch exposes a `ready`
 * promise: the graph is complete and silent the instant it is built, and the
 * kit waits for the clip before it reads a single accessor.
 *
 * No `diagram`: the buffer source is a native node, and a diagram cannot label
 * one (ticket 10c).
 */

import { Compound, Gain, Granite } from "synthlet";
import { definePatch } from "../define";

/**
 * The site's one clip. The `/synthlet` prefix is `next.config.mjs`'s `basePath`,
 * applied unconditionally, and every docs example hardcodes it the same way.
 */
const CLIP = "/synthlet/track14.mp3";

const RATE = 20;
const DURATION = 60;
const SPRAY = 0;
const PITCH = 0;
const PITCH_SPREAD = 0;
const FEEDBACK = 0;
const SHAPE = 0.5;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const source = new AudioBufferSourceNode(ac, { loop: true });
  let started = false;

  const granite = Granite(ac, {
    rate: RATE,
    duration: DURATION,
    spray: SPRAY,
    pitch: PITCH,
    pitchSpread: PITCH_SPREAD,
    shape: SHAPE,
    freeze: 0,
    feedback: FEEDBACK,
    wet: 1,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  source.connect(granite).connect(analyser).connect(level).connect(out);

  // There is no shared buffer-loading helper in the library and the three docs
  // examples each inline this, so this does too. It always resolves: a failed
  // fetch leaves a silent widget, which is a great deal better than an
  // unhandled rejection in the reader's console.
  const ready =
    typeof window === "undefined"
      ? Promise.resolve()
      : fetch(CLIP)
          .then((response) => response.arrayBuffer())
          .then((bytes) => ac.decodeAudioData(bytes))
          .then((buffer) => {
            if (started) return;
            started = true;
            source.buffer = buffer;
            source.start();
          })
          .catch(() => undefined);

  return Compound({
    output: out,
    owns: [
      source,
      () => {
        if (!started) return;
        source.stop();
      },
      granite,
      analyser,
      level,
    ],
    exposes: { source, granite, analyser, ready },
  });
}

export default definePatch({
  id: "beyond/granite",
  label: "Sound as grains",
  build,
  controls: [
    {
      id: "rate",
      kind: "slider",
      label: "Rate",
      help: "Grains per second. A few is a stutter; a hundred is a cloud.",
      param: (s) => s.granite.rate,
      min: 1,
      max: 200,
      scale: "log",
      unit: "/s",
      default: RATE,
    },
    {
      id: "duration",
      kind: "slider",
      label: "Duration",
      help: "How long each grain is, independent of how often they arrive.",
      param: (s) => s.granite.duration,
      min: 5,
      max: 400,
      scale: "log",
      unit: "ms",
      default: DURATION,
    },
    {
      id: "spray",
      kind: "slider",
      label: "Spray",
      help: "How far back each grain may reach for its material.",
      param: (s) => s.granite.spray,
      min: 0,
      max: 1,
      step: 0.01,
      default: SPRAY,
    },
    {
      id: "pitch",
      kind: "slider",
      label: "Pitch",
      help: "Per-grain transposition. The stream keeps its speed.",
      param: (s) => s.granite.pitch,
      min: -24,
      max: 24,
      step: 1,
      unit: "st",
      default: PITCH,
    },
    {
      id: "pitchSpread",
      kind: "slider",
      label: "Pitch spread",
      help: "How far grains may disagree about the transposition.",
      param: (s) => s.granite.pitchSpread,
      min: 0,
      max: 24,
      step: 0.5,
      unit: "st",
      default: PITCH_SPREAD,
    },
    {
      id: "freeze",
      kind: "toggle",
      label: "Freeze",
      help: "Stops writing into the buffer, so the last few seconds become an object.",
      param: (s) => s.granite.freeze,
      default: 0,
    },
    {
      id: "feedback",
      kind: "slider",
      label: "Feedback",
      help: "Grains summed back into the buffer, to be granulated again.",
      param: (s) => s.granite.feedback,
      min: 0,
      max: 0.95,
      step: 0.01,
      default: FEEDBACK,
    },
    {
      id: "shape",
      kind: "slider",
      label: "Shape",
      help: "The grain's envelope: 0 is a sharp attack, 0.5 a bell, 1 a reversed one.",
      param: (s) => s.granite.shape,
      min: 0,
      max: 1,
      step: 0.01,
      default: SHAPE,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      options: { minDb: -100, maxDb: -10 },
    },
    {
      kind: "scope",
      label: "Grains",
      source: (s) => s.analyser,
      // A stutter and a cloud look completely different in the contour and
      // almost identical in the waveform, because what separates them is a
      // pattern of onsets rather than a shape.
      options: { window: "contour", seconds: 6 },
    },
  ],
});
