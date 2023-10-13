import { loadAdsr } from "./adsr/index";
import { loadImpulse } from "./impulse/index";
import { loadKarplusStrongOscillator } from "./karplus-strong/index";
import { loadLfo } from "./lfo/index";
import { loadMika } from "./mika/index";
import { loadPcmOscillator } from "./pcm-oscillator/index";
import { loadSequencer } from "./sequencer/index";
import { loadVaFilter } from "./va-filter/index";
import { loadVaOscillator } from "./va-oscillator/index";
import { loadWtOscillator } from "./wt-oscillator/index";

export * from "./adsr/index";
export * from "./impulse/index";
export * from "./karplus-strong/index";
export * from "./lfo/index";
export * from "./mika/index";
export * from "./pcm-oscillator/index";
export * from "./sequencer/index";
export * from "./va-filter/index";
export * from "./va-oscillator/index";
export * from "./wt-oscillator/index";

export function loadSynthlet(context: AudioContext) {
  return Promise.all([
    loadAdsr(context),
    loadImpulse(context),
    loadKarplusStrongOscillator(context),
    loadLfo(context),
    loadMika(context),
    loadPcmOscillator(context),
    loadVaFilter(context),
    loadVaOscillator(context),
    loadWtOscillator(context),
    loadSequencer(context),
  ]);
}
