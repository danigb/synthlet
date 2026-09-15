import additive from "./additive";
import additiveSource from "./additive.ts?raw";
import fm from "./fm";
import fmSource from "./fm.ts?raw";
import lfoDestinations from "./lfo-destinations";
import lfoDestinationsSource from "./lfo-destinations.ts?raw";
import pwm from "./pwm";
import pwmSource from "./pwm.ts?raw";
import ring from "./ring";
import ringSource from "./ring.ts?raw";
import sampleHold from "./sample-hold";
import sampleHoldSource from "./sample-hold.ts?raw";
import sync from "./sync";
import syncSource from "./sync.ts?raw";

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
export const modulationPatches = {
  "modulation/lfo-destinations": lfoDestinations,
  "modulation/pwm": pwm,
  "modulation/sample-hold": sampleHold,
  "modulation/ring": ring,
  "modulation/fm": fm,
  "modulation/additive": additive,
  "modulation/sync": sync,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const modulationSources: Record<string, string> = {
  "modulation/lfo-destinations": lfoDestinationsSource,
  "modulation/pwm": pwmSource,
  "modulation/sample-hold": sampleHoldSource,
  "modulation/ring": ringSource,
  "modulation/fm": fmSource,
  "modulation/additive": additiveSource,
  "modulation/sync": syncSource,
};
