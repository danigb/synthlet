import { registerAdsrWorkletOnce } from "@synthlet/adsr";
import { registerNoiseWorkletOnce } from "@synthlet/noise";
import { registerPolyblepOscillatorWorkletOnce } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorkletOnce } from "@synthlet/state-variable-filter/src";
import { registerWavetableOscillatorWorkletOnce } from "@synthlet/wavetable-oscillator";

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
  createWavetableOscillatorNode,
  registerWavetableOscillatorWorkletOnce,
} from "@synthlet/wavetable-oscillator";

export function registerSynthletOnce(context: AudioContext) {
  return Promise.all([
    registerAdsrWorkletOnce(context),
    registerNoiseWorkletOnce(context),
    registerPolyblepOscillatorWorkletOnce(context),
    registerStateVariableFilterWorkletOnce(context),
    registerWavetableOscillatorWorkletOnce(context),
  ]);
}
