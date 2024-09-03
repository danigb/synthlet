import { registerAdsrWorkletOnce } from "@synthlet/adsr";
import { registerChorusTWorkletOnce } from "@synthlet/chorus-t";
import { registerClockWorkletOnce } from "@synthlet/clock/src";
import { registerDrum8WorkletOnce } from "@synthlet/drum8";
import { registerLfoWorkletOnce } from "@synthlet/lfo";
import { registerNoiseWorkletOnce } from "@synthlet/noise";
import { registerPolyblepOscillatorWorkletOnce } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorkletOnce } from "@synthlet/state-variable-filter/src";
import { registerWavetableOscillatorWorkletOnce } from "@synthlet/wavetable-oscillator";

export * from "@synthlet/adsr";
export * from "@synthlet/chorus-t";
export * from "@synthlet/clock";
export * from "@synthlet/drum8";
export * from "@synthlet/lfo";
export * from "@synthlet/noise";
export * from "@synthlet/polyblep-oscillator";
export * from "@synthlet/state-variable-filter";
export * from "@synthlet/wavetable-oscillator";

export function registerSynthletOnce(context: AudioContext): Promise<void> {
  return Promise.all([
    registerAdsrWorkletOnce(context),
    registerChorusTWorkletOnce(context),
    registerClockWorkletOnce(context),
    registerDrum8WorkletOnce(context),
    registerLfoWorkletOnce(context),
    registerNoiseWorkletOnce(context),
    registerPolyblepOscillatorWorkletOnce(context),
    registerStateVariableFilterWorkletOnce(context),
    registerWavetableOscillatorWorkletOnce(context),
  ]).then(() => {});
}
