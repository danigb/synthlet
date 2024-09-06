import { registerAdWorklet } from "@synthlet/ad";
import { registerAdsrWorklet } from "@synthlet/adsr";
import { registerChorusTWorklet } from "@synthlet/chorus-t";
import { registerClipAmpWorklet } from "@synthlet/clip-amp";
import { registerClockWorklet } from "@synthlet/clock";
import { registerEuclidWorklet } from "@synthlet/euclid";
import { registerImpulseWorklet } from "@synthlet/impulse";
import { registerLfoWorklet } from "@synthlet/lfo";
import { registerNoiseWorklet } from "@synthlet/noise";
import { registerParamWorklet } from "@synthlet/param";
import { registerPolyblepOscillatorWorklet } from "@synthlet/polyblep-oscillator";
import { registerStateVariableFilterWorklet } from "@synthlet/state-variable-filter";
import { registerWavetableOscillatorWorklet } from "@synthlet/wavetable-oscillator";

export * from "@synthlet/ad";
export * from "@synthlet/adsr";
export * from "@synthlet/chorus-t";
export * from "@synthlet/clip-amp";
export * from "@synthlet/clock";
export * from "@synthlet/euclid";
export * from "@synthlet/impulse";
export * from "@synthlet/lfo";
export * from "@synthlet/noise";
export * from "@synthlet/param";
export * from "@synthlet/polyblep-oscillator";
export * from "@synthlet/state-variable-filter";
export * from "@synthlet/wavetable-oscillator";
export { ParamInput } from "./_worklet";

export { getSynthlet } from "./synthlet";
export * from "./synths";
export * from "./waa";

export function registerSynthlet(context: AudioContext): Promise<AudioContext> {
  return Promise.all([
    registerAdWorklet(context),
    registerAdsrWorklet(context),
    registerChorusTWorklet(context),
    registerClipAmpWorklet(context),
    registerClockWorklet(context),
    registerEuclidWorklet(context),
    registerImpulseWorklet(context),
    registerLfoWorklet(context),
    registerNoiseWorklet(context),
    registerParamWorklet(context),
    registerPolyblepOscillatorWorklet(context),
    registerStateVariableFilterWorklet(context),
    registerWavetableOscillatorWorklet(context),
  ]).then(() => context);
}
