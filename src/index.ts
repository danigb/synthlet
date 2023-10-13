import { loadAdsr, loadAdsrProcessor } from "./adsr/index";
import { loadImpulse, loadImpulseProcessor } from "./impulse/index";
import {
  loadKarplusStrongOscillator,
  loadKarplusStrongOscillatorProcessor,
} from "./karplus-strong/index";
import { loadLfo, loadLfoProcessor } from "./lfo/index";
import {
  loadPcmOscillator,
  loadPcmOscillatorProcessor,
} from "./pcm-oscillator/index";
import { loadSequencer, loadSequencerProcessor } from "./sequencer/index";
import { chain, createKeyboard, createTrigger } from "./utils/index";
import { loadVaFilter, loadVaFilterProcessor } from "./va-filter/index";
import {
  loadVaOscillator,
  loadVaOscillatorProcessor,
} from "./va-oscillator/index";
import { loadWtOscillatorProcessor } from "./wt-oscillator/index";

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
    loadAdsrProcessor(context),
    loadImpulseProcessor(context),
    loadKarplusStrongOscillatorProcessor(context),
    loadLfoProcessor(context),
    loadPcmOscillatorProcessor(context),
    loadSequencerProcessor(context),
    loadVaFilterProcessor(context),
    loadVaOscillatorProcessor(context),
    loadWtOscillatorProcessor(context),
  ]);
  return context;
}

type PromiseType<T> = T extends Promise<infer U> ? U : never;
export type Synthlet = PromiseType<ReturnType<typeof loadSynthlet>>;

export async function loadSynthlet(context: AudioContext) {
  const [adsr, impulse, ksosc, lfo, pcmosc, sequencer, vafilter, vaosc, wtosc] =
    await Promise.all([
      loadAdsr(context),
      loadImpulse(context),
      loadKarplusStrongOscillator(context),
      loadLfo(context),
      loadPcmOscillator(context),
      loadSequencer(context),
      loadVaFilter(context),
      loadVaOscillator(context),
      loadWtOscillatorProcessor(context),
    ]);
  const trigger = () => createTrigger(context);
  const keyboard = () => createKeyboard(context);

  return {
    adsr,
    chain,
    context,
    impulse,
    keyboard,
    ksosc,
    lfo,
    pcmosc,
    sequencer,
    trigger,
    vafilter,
    vaosc,
    wtosc,
  };
}
