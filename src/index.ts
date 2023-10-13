import { loadAdsr, loadAdsrNode } from "./adsr/index";
import { loadImpulseNode } from "./impulse/index";
import { loadKarplusStrongOscillatorNode } from "./karplus-strong/index";
import { loadLfoNode } from "./lfo/index";
import { loadPcmOscillatorNode } from "./pcm-oscillator/index";
import { loadSequencerNode } from "./sequencer/index";
import { chain, createKeyboard, createTrigger } from "./utils/index";
import { loadVaFilterNode } from "./va-filter/index";
import { loadVaOscillator, loadVaOscillatorNode } from "./va-oscillator/index";
import { loadWtOscillatorNode } from "./wt-oscillator/index";

export * from "./adsr/index";
export * from "./impulse/index";
export * from "./karplus-strong/index";
export * from "./lfo/index";
export * from "./mika/index";
export * from "./pcm-oscillator/index";
export * from "./sequencer/index";
export * from "./utils/index";
export * from "./va-filter/index";
export * from "./va-oscillator/index";
export * from "./wt-oscillator/index";

export async function loadSynthletNodes(context: AudioContext) {
  await Promise.all([
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
  return context;
}

type PromiseType<T> = T extends Promise<infer U> ? U : never;
export type Synthlet = PromiseType<ReturnType<typeof loadSynthlet>>;

export async function loadSynthlet(context: AudioContext) {
  const [adsr, osc] = await Promise.all([
    loadAdsr(context),
    loadVaOscillator(context),
  ]);
  const trigger = () => createTrigger(context);
  const keyboard = () => createKeyboard(context);

  return {
    adsr,
    chain,
    context,
    keyboard,
    osc,
    trigger,
  };
}
