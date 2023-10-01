import { loadAdsr } from "./adsr/index";
import { loadImpulse } from "./impulse/index";
import { loadKarplusStrongOscillator } from "./karplus-strong/index";
import { loadLfo } from "./lfo/index";
import { loadMika } from "./mika/index";
import { loadOsc } from "./osc/index";

export * from "./adsr/index";
export * from "./impulse/index";
export * from "./karplus-strong/index";
export * from "./lfo/index";
export * from "./mika/index";
export * from "./osc/index";

export function loadSynthlet(context: AudioContext) {
  return Promise.all([
    loadAdsr(context),
    loadImpulse(context),
    loadKarplusStrongOscillator(context),
    loadLfo(context),
    loadMika(context),
    loadOsc(context),
  ]);
}
