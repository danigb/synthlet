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

/*
 * Chapter 5's patches, in the order the chapter reads them.
 *
 * Modulation is one idea applied at every speed: a signal on a parameter. Slow
 * enough and it is vibrato, tremolo or a random staircase; fast enough and the
 * same wiring is ring modulation, FM, or a harmonic of the note itself - which
 * is why `lfo-destinations` carries two lessons and `additive` fourteen
 * sliders.
 *
 * The chapter is still being written: `modulation/sync` adds a line each to
 * the two records below and touches nothing else.
 */
export const modulationPatches = {
  "modulation/lfo-destinations": lfoDestinations,
  "modulation/pwm": pwm,
  "modulation/sample-hold": sampleHold,
  "modulation/ring": ring,
  "modulation/fm": fm,
  "modulation/additive": additive,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const modulationSources: Record<string, string> = {
  "modulation/lfo-destinations": lfoDestinationsSource,
  "modulation/pwm": pwmSource,
  "modulation/sample-hold": sampleHoldSource,
  "modulation/ring": ringSource,
  "modulation/fm": fmSource,
  "modulation/additive": additiveSource,
};
