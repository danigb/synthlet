import { registerAdWorkletOnce } from "@synthlet/ad";
import { registerAdsrWorkletOnce } from "@synthlet/adsr";
import { registerChorusTWorkletOnce } from "@synthlet/chorus-t";
import { registerClockWorkletOnce } from "@synthlet/clock";
import { registerDrum8WorkletOnce } from "@synthlet/drum8";
import { registerImpulseWorkletOnce } from "@synthlet/impulse";
import { registerLfoWorkletOnce } from "@synthlet/lfo";
import { registerNoiseWorkletOnce } from "@synthlet/noise";
import { registerPolyblepOscillatorWorkletOnce } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorkletOnce } from "@synthlet/state-variable-filter";
import { registerWavetableOscillatorWorkletOnce } from "@synthlet/wavetable-oscillator";

export * from "@synthlet/ad";
export * from "@synthlet/adsr";
export * from "@synthlet/chorus-t";
export * from "@synthlet/clock";
export * from "@synthlet/drum8";
export * from "@synthlet/impulse";
export * from "@synthlet/lfo";
export * from "@synthlet/noise";
export * from "@synthlet/polyblep-oscillator";
export * from "@synthlet/state-variable-filter";
export * from "@synthlet/wavetable-oscillator";

export * from "./synths";

export function registerSynthletOnce(context: AudioContext): Promise<void> {
  return Promise.all([
    registerAdWorkletOnce(context),
    registerAdsrWorkletOnce(context),
    registerChorusTWorkletOnce(context),
    registerClockWorkletOnce(context),
    registerDrum8WorkletOnce(context),
    registerImpulseWorkletOnce(context),
    registerLfoWorkletOnce(context),
    registerNoiseWorkletOnce(context),
    registerPolyblepOscillatorWorkletOnce(context),
    registerStateVariableFilterWorkletOnce(context),
    registerWavetableOscillatorWorkletOnce(context),
  ]).then(() => {});
}
