import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 10's patches, in the order the chapter reads them.
 *
 * Six, for eight lessons. `beyond/terrain` and `beyond/west-coast` are not here
 * because there is no file to register: those two lessons are written, marked
 * blocked, and waiting on a module - the Strata scanner and a wavefolder. A
 * stub registered so a blocked lesson had something to name would be a fake
 * widget in the registry, and rule 2 would then demand a file for it.
 */
export const beyondPatches: Record<string, PatchLoader> = {
  "beyond/polyblep": () => import("./polyblep"),
  "beyond/wavetable": () => import("./wavetable"),
  "beyond/granite": () => import("./granite"),
  "beyond/timestretch": () => import("./timestretch"),
  "beyond/drift": () => import("./drift"),
  "beyond/limiter": () => import("./limiter"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const beyondSources: Record<string, SourceLoader> = {
  "beyond/polyblep": () => import("./polyblep.ts?raw"),
  "beyond/wavetable": () => import("./wavetable.ts?raw"),
  "beyond/granite": () => import("./granite.ts?raw"),
  "beyond/timestretch": () => import("./timestretch.ts?raw"),
  "beyond/drift": () => import("./drift.ts?raw"),
  "beyond/limiter": () => import("./limiter.ts?raw"),
};
