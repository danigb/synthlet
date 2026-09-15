import arp from "./arp";
import arpSource from "./arp.ts?raw";
import clock from "./clock";
import clockSource from "./clock.ts?raw";
import decimator from "./decimator";
import decimatorSource from "./decimator.ts?raw";
import euclid from "./euclid";
import euclidSource from "./euclid.ts?raw";
import follower from "./follower";
import followerSource from "./follower.ts?raw";
import randomArp from "./random-arp";
import randomArpSource from "./random-arp.ts?raw";
import slew from "./slew";
import slewSource from "./slew.ts?raw";
import steps from "./steps";
import stepsSource from "./steps.ts?raw";
import vocoder from "./vocoder";
import vocoderSource from "./vocoder.ts?raw";

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
export const timePatches = {
  "time/clock": clock,
  "time/euclid": euclid,
  "time/arp": arp,
  "time/steps": steps,
  "time/slew": slew,
  "time/follower": follower,
  "time/vocoder": vocoder,
  "time/random-arp": randomArp,
  "time/decimator": decimator,
};

/** The same files again, as text, for "View the code". Keyed exactly as above. */
export const timeSources: Record<string, string> = {
  "time/clock": clockSource,
  "time/euclid": euclidSource,
  "time/arp": arpSource,
  "time/steps": stepsSource,
  "time/slew": slewSource,
  "time/follower": followerSource,
  "time/vocoder": vocoderSource,
  "time/random-arp": randomArpSource,
  "time/decimator": decimatorSource,
};
