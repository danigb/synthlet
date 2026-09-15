import type { PatchLoader, SourceLoader } from "../define";

/*
 * Chapter 6's patches, in the order the chapter reads them.
 *
 * Time, as something the audio thread carries rather than something the page
 * counts. A clock, a rhythm generator and an arpeggiator that need nothing on
 * the main thread to keep them; one page that deliberately does it the other
 * way and says what it costs; then the three modules that read a signal and
 * answer with a slower one - a slew limiter, an envelope follower, sixteen
 * followers at once - and finally what a sample-and-hold becomes when it runs
 * fast enough to be a converter.
 */
export const timePatches: Record<string, PatchLoader> = {
  "time/clock": () => import("./clock"),
  "time/euclid": () => import("./euclid"),
  "time/arp": () => import("./arp"),
  "time/steps": () => import("./steps"),
  "time/slew": () => import("./slew"),
  "time/follower": () => import("./follower"),
  "time/vocoder": () => import("./vocoder"),
  "time/random-arp": () => import("./random-arp"),
  "time/decimator": () => import("./decimator"),
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const timeSources: Record<string, SourceLoader> = {
  "time/clock": () => import("./clock.ts?raw"),
  "time/euclid": () => import("./euclid.ts?raw"),
  "time/arp": () => import("./arp.ts?raw"),
  "time/steps": () => import("./steps.ts?raw"),
  "time/slew": () => import("./slew.ts?raw"),
  "time/follower": () => import("./follower.ts?raw"),
  "time/vocoder": () => import("./vocoder.ts?raw"),
  "time/random-arp": () => import("./random-arp.ts?raw"),
  "time/decimator": () => import("./decimator.ts?raw"),
};
