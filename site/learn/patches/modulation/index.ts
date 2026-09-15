import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 5's patches, in the order the chapter reads them.
 *
 * Modulation is one idea applied at every speed: a signal on a parameter. Slow
 * enough and it is vibrato, tremolo or a random staircase; fast enough and the
 * same wiring is ring modulation, FM, or a harmonic of the note itself - which
 * is why `lfo-destinations` carries two lessons and `additive` fourteen
 * sliders.
 *
 * Seven patches for eight lessons: `lfo-destinations` carries 5.1 and 5.2,
 * which are the same synth asked two questions - where does the wobble go, and
 * what does it do when it gets there - with two `show` lists.
 */
export const modulationPatches: Record<string, PatchLoader> = {
  "modulation/lfo-destinations": () => import("./lfo-destinations"),
  "modulation/pwm": () => import("./pwm"),
  "modulation/sample-hold": () => import("./sample-hold"),
  "modulation/ring": () => import("./ring"),
  "modulation/fm": () => import("./fm"),
  "modulation/additive": () => import("./additive"),
  "modulation/sync": () => import("./sync"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const modulationSources: Record<string, SourceLoader> = {
  "modulation/lfo-destinations": () => import("./lfo-destinations.ts?raw"),
  "modulation/pwm": () => import("./pwm.ts?raw"),
  "modulation/sample-hold": () => import("./sample-hold.ts?raw"),
  "modulation/ring": () => import("./ring.ts?raw"),
  "modulation/fm": () => import("./fm.ts?raw"),
  "modulation/additive": () => import("./additive.ts?raw"),
  "modulation/sync": () => import("./sync.ts?raw"),
};
