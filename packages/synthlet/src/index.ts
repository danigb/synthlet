import { registerAdWorkletOnce } from "@synthlet/ad";
import { registerAdsrWorkletOnce } from "@synthlet/adsr";
import { registerChorusTWorkletOnce } from "@synthlet/chorus-t";
import { registerClipAmpWorkletOnce } from "@synthlet/clip-amp";
import { registerClockWorkletOnce } from "@synthlet/clock";
import { registerDrum8WorkletOnce } from "@synthlet/drum8";
import { registerEuclidWorkletOnce } from "@synthlet/euclid/src";
import { registerImpulseWorkletOnce } from "@synthlet/impulse";
import { registerLfoWorkletOnce } from "@synthlet/lfo";
import { registerNoiseWorkletOnce } from "@synthlet/noise";
import { registerParamWorkletOnce } from "@synthlet/param";
import { registerPolyblepOscillatorWorkletOnce } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorkletOnce } from "@synthlet/state-variable-filter";
import { registerWavetableOscillatorWorkletOnce } from "@synthlet/wavetable-oscillator";
import { createOperators, Operators } from "./operators";

export * from "@synthlet/ad";
export * from "@synthlet/adsr";
export * from "@synthlet/chorus-t";
export * from "@synthlet/clip-amp";
export * from "@synthlet/clock";
export * from "@synthlet/drum8";
export * from "@synthlet/euclid";
export * from "@synthlet/impulse";
export * from "@synthlet/lfo";
export * from "@synthlet/noise";
export * from "@synthlet/param";
export * from "@synthlet/polyblep-oscillator";
export * from "@synthlet/state-variable-filter";
export * from "@synthlet/wavetable-oscillator";
export { ParamInput } from "./_worklet";
export { assignParams, createOperators } from "./operators";
export * from "./synths";

// experimental API
export function synthlet<T extends AudioNode>(fn: (op: Operators) => T) {
  return (context: AudioContext) => {
    const op = createOperators(context);
    return fn(op);
  };
}

export function registerSynthletOnce(
  context: AudioContext
): Promise<AudioContext> {
  return Promise.all([
    registerAdWorkletOnce(context),
    registerAdsrWorkletOnce(context),
    registerChorusTWorkletOnce(context),
    registerClipAmpWorkletOnce(context),
    registerClockWorkletOnce(context),
    registerDrum8WorkletOnce(context),
    registerEuclidWorkletOnce(context),
    registerImpulseWorkletOnce(context),
    registerLfoWorkletOnce(context),
    registerNoiseWorkletOnce(context),
    registerParamWorkletOnce(context),
    registerPolyblepOscillatorWorkletOnce(context),
    registerStateVariableFilterWorkletOnce(context),
    registerWavetableOscillatorWorkletOnce(context),
  ]).then(() => context);
}
