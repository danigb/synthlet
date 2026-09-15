/*
 * Half speed at the same pitch, then the same speed a fifth up.
 *
 * Part 59's tape analogy holds for a long time and then stops dead. A delay
 * line is a strip of tape past two heads; a delay time that moves glides the
 * heads and bends the pitch. Every one of those statements ties speed to pitch,
 * because on tape they are one quantity: the samples arrive closer together or
 * further apart, and that is both the duration and the frequency.
 *
 * `TimestretchAudioSource` cuts the tie. It finds the point in the signal where
 * the next analysis frame best matches the last one and overlaps them there -
 * WSOLA - so a frame can be repeated to stretch time or skipped to compress it
 * without ever changing the rate the samples come out at. `playbackRate` is
 * then a duration and `detune` is a pitch, and the two do not know about each
 * other.
 *
 * It is a *source*, not a modifier: zero inputs, `setBuffer(buffer)` after
 * construction and `start()` once the buffer is there. So, like `beyond/granite`,
 * it exposes a `ready` promise and the kit waits for it.
 *
 * No `diagram`: one box and an output is not a picture worth drawing.
 */

import { Compound, Gain, TimestretchAudioSource } from "synthlet";
import { definePatch } from "../define";

/** The same clip the granular lesson uses, and the same `basePath` prefix. */
const CLIP = "/synthlet/track14.mp3";

const PLAYBACK_RATE = 0.5;
const DETUNE = 0;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  // `loop: 1` from the start, so the widget keeps sounding: three seconds is
  // all `check:sound` gives it, and a reader wants longer than the clip.
  const player = TimestretchAudioSource(ac, {
    playbackRate: PLAYBACK_RATE,
    detune: DETUNE,
    loop: 1,
  });
  let started = false;

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  player.connect(analyser).connect(level).connect(out);

  const ready =
    typeof window === "undefined"
      ? Promise.resolve()
      : fetch(CLIP)
          .then((response) => response.arrayBuffer())
          .then((bytes) => ac.decodeAudioData(bytes))
          .then((buffer) => {
            if (started) return;
            started = true;
            player.setBuffer(buffer);
            player.start();
          })
          .catch(() => undefined);

  return Compound({
    output: out,
    owns: [
      player,
      () => {
        if (!started) return;
        player.stop();
      },
      analyser,
      level,
    ],
    exposes: { player, analyser, ready },
  });
}

export default definePatch({
  id: "beyond/timestretch",
  label: "Time and pitch apart",
  build,
  controls: [
    {
      id: "playbackRate",
      kind: "slider",
      label: "Speed",
      help: "How long the clip takes. The pitch does not move with it.",
      param: (s) => s.player.playbackRate,
      min: 0.25,
      max: 4,
      scale: "log",
      unit: "×",
      default: PLAYBACK_RATE,
    },
    {
      id: "detune",
      kind: "slider",
      label: "Detune",
      help: "The pitch, in cents. 700 is a fifth, and the speed does not move.",
      param: (s) => s.player.detune,
      min: -1200,
      max: 1200,
      step: 1,
      unit: "c",
      default: DETUNE,
    },
    {
      id: "reverse",
      kind: "toggle",
      label: "Reverse",
      help: "Plays the region backwards, at whatever speed and pitch are set.",
      param: (s) => s.player.reverse,
      default: 0,
    },
    {
      id: "loop",
      kind: "toggle",
      label: "Loop",
      help: "Wrap at the end of the region instead of stopping.",
      param: (s) => s.player.loop,
      default: 1,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      // Six seconds of the clip's own shape: at half speed the same events are
      // twice as far apart, and the shape between them is unchanged.
      options: { window: "contour", seconds: 6 },
    },
    { kind: "meter", label: "Output" },
  ],
});
