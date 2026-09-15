import drift from "./drift";
import driftSource from "./drift.ts?raw";
import granite from "./granite";
import graniteSource from "./granite.ts?raw";
import limiter from "./limiter";
import limiterSource from "./limiter.ts?raw";
import polyblep from "./polyblep";
import polyblepSource from "./polyblep.ts?raw";
import timestretch from "./timestretch";
import timestretchSource from "./timestretch.ts?raw";
import wavetable from "./wavetable";
import wavetableSource from "./wavetable.ts?raw";

/*
 * Chapter 10's patches, in the order the chapter reads them.
 *
 * Six, for eight lessons. `beyond/terrain` and `beyond/west-coast` are not here
 * because there is no file to register: those two lessons are written, marked
 * blocked, and waiting on a module - the Strata scanner and a wavefolder. A
 * stub registered so a blocked lesson had something to name would be a fake
 * widget in the registry, and rule 2 would then demand a file for it.
 */
export const beyondPatches = {
  "beyond/polyblep": polyblep,
  "beyond/wavetable": wavetable,
  "beyond/granite": granite,
  "beyond/timestretch": timestretch,
  "beyond/drift": drift,
  "beyond/limiter": limiter,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const beyondSources: Record<string, string> = {
  "beyond/polyblep": polyblepSource,
  "beyond/wavetable": wavetableSource,
  "beyond/granite": graniteSource,
  "beyond/timestretch": timestretchSource,
  "beyond/drift": driftSource,
  "beyond/limiter": limiterSource,
};
