import paraphonic from "./paraphonic";
import paraphonicSource from "./paraphonic.ts?raw";
import presets from "./presets";
import presetsSource from "./presets.ts?raw";
import priority from "./priority";
import prioritySource from "./priority.ts?raw";
import stealing from "./stealing";
import stealingSource from "./stealing.ts?raw";

/*
 * Chapter 7's patches, in the order the chapter reads them.
 *
 * What a keyboard is for. One voice and four keys down is a decision about
 * which note wins; four oscillators and one envelope is a decision about where
 * the envelope sits; four voices and five fingers is a decision about which
 * note dies. The last one is the file format that carries all three.
 */
export const voicesPatches = {
  "voices/priority": priority,
  "voices/paraphonic": paraphonic,
  "voices/stealing": stealing,
  "voices/presets": presets,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const voicesSources: Record<string, string> = {
  "voices/priority": prioritySource,
  "voices/paraphonic": paraphonicSource,
  "voices/stealing": stealingSource,
  "voices/presets": presetsSource,
};
