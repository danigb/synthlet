import { registerAdsrWorkletOnce } from "@synthlet/adsr";
import { registerChorusTWorkletOnce } from "@synthlet/chorus-t";
import { registerDrum8WorkletOnce } from "@synthlet/drum8";
import { registerNoiseWorkletOnce } from "@synthlet/noise";
import { registerPolyblepOscillatorWorkletOnce } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorkletOnce } from "@synthlet/state-variable-filter/src";
import { registerWavetableOscillatorWorkletOnce } from "@synthlet/wavetable-oscillator";
import { registerLfoWorkletOnce } from "../../lfo/src";

export { createAdsr, createVca, registerAdsrWorkletOnce } from "@synthlet/adsr";
export { createWhiteNoise, registerNoiseWorkletOnce } from "@synthlet/noise";
export {
  createPolyblepOscillator,
  registerPolyblepOscillatorWorkletOnce,
} from "@synthlet/polyblep-oscillator";
export {
  createStateVariableFilter,
  registerStateVariableFilterWorkletOnce,
} from "@synthlet/state-variable-filter";
export {
  createWavetableOscillator,
  registerWavetableOscillatorWorkletOnce,
  WavetableLoader,
} from "@synthlet/wavetable-oscillator";

export { createDrum8, registerDrum8WorkletOnce } from "@synthlet/drum8";

export { createLfo, registerLfoWorkletOnce } from "@synthlet/lfo";
export * from "../../chorus-t/dist";

export type * from "@synthlet/adsr";
export type * from "@synthlet/polyblep-oscillator";
export type * from "@synthlet/state-variable-filter";

export function registerSynthletOnce(context: AudioContext): Promise<void> {
  return Promise.all([
    registerAdsrWorkletOnce(context),
    registerChorusTWorkletOnce(context),
    registerDrum8WorkletOnce(context),
    registerLfoWorkletOnce(context),
    registerNoiseWorkletOnce(context),
    registerPolyblepOscillatorWorkletOnce(context),
    registerStateVariableFilterWorkletOnce(context),
    registerWavetableOscillatorWorkletOnce(context),
  ]).then(() => {});
}
