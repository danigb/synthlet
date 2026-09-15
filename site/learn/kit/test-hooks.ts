/*
 * `window.__learn__` - the two numbers a headless browser needs.
 *
 * Everything a lesson does is observable from outside except the two things
 * that matter most: whether it is making a sound, and whether it stopped making
 * one when the reader left. A pixel is not evidence of either. So the kit
 * publishes the output level and a count of live audio, and ticket 15's
 * Playwright pass reads them instead of listening.
 *
 * `process.env.NODE_ENV` is inlined by webpack, so in the deployed export every
 * body below is dead code behind a constant `false` and the whole module folds
 * away. That is deliberate: the hooks exist for a test, and a page that ships
 * a global for the convenience of a test it is not running has given the test
 * a say in what visitors download.
 */

export const hooksEnabled = process.env.NODE_ENV !== "production";

/** The current level of one mounted widget, in dBFS. */
type LevelProbe = () => number;

const probes = new Set<LevelProbe>();
let liveCount = 0;
let installed = false;

interface LearnHooks {
  /** The loudest mounted widget right now, in dBFS. `-Infinity` for silence. */
  level(): number;
  /** Live synths plus live meter taps. Zero is a clean page. */
  live(): number;
}

declare global {
  interface Window {
    __learn__?: LearnHooks;
  }
}

function install() {
  if (installed || !hooksEnabled || typeof window === "undefined") return;
  installed = true;
  window.__learn__ = {
    level() {
      let loudest = -Infinity;
      for (const probe of probes) loudest = Math.max(loudest, probe());
      return loudest;
    },
    live: () => liveCount,
  };
}

/**
 * Count one live thing - a built synth, a meter tap - until it is released.
 *
 * Returns the release, so it is a `useEffect` cleanup and cannot be forgotten
 * anywhere it would not also leak the audio it is counting.
 */
export function trackLive(): () => void {
  if (!hooksEnabled) return () => {};
  install();
  liveCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    liveCount--;
  };
}

/*
 * Installed on import, not on the first probe.
 *
 * "The page arrives silent" is an assertion about a page where nothing has
 * happened yet, so the hook has to answer before anything has happened:
 * `level()` is `-Infinity` and `live()` is 0 on a page whose widget has not
 * been touched, and a test that found no `__learn__` at all could not tell that
 * from a build where the kit never loaded.
 */
install();

/** Publish a widget's output level. Returns the unsubscribe. */
export function addLevelProbe(probe: LevelProbe): () => void {
  if (!hooksEnabled) return () => {};
  install();
  probes.add(probe);
  return () => {
    probes.delete(probe);
  };
}
