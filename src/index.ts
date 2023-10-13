import { loadAdsrNode } from "./adsr/index";
import { loadImpulseNode } from "./impulse/index";
import { loadKarplusStrongOscillatorNode } from "./karplus-strong/index";
import { loadLfoNode } from "./lfo/index";
import { loadPcmOscillatorNode } from "./pcm-oscillator/index";
import { loadSequencerNode } from "./sequencer/index";
import { loadVaFilterNode } from "./va-filter/index";
import { loadVaOscillatorNode } from "./va-oscillator/index";
import { loadWtOscillatorNode } from "./wt-oscillator/index";

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

export function loadSynthletNodes(context: AudioContext) {
  return Promise.all([
    loadAdsrNode(context),
    loadImpulseNode(context),
    loadKarplusStrongOscillatorNode(context),
    loadLfoNode(context),
    loadPcmOscillatorNode(context),
    loadVaFilterNode(context),
    loadVaOscillatorNode(context),
    loadWtOscillatorNode(context),
    loadSequencerNode(context),
  ]);
}
