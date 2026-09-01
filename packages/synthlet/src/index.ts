import { registerAdWorklet } from "@synthlet/ad";
import { registerAdsrWorklet } from "@synthlet/adsr";
import { registerArpWorklet } from "@synthlet/arp";
import { registerChorusWorklet } from "@synthlet/chorus";
import { registerClipAmpWorklet } from "@synthlet/clip-amp";
import { registerClockWorklet } from "@synthlet/clock";
import { registerDattorroReverbWorklet } from "@synthlet/dattorro-reverb";
import { registerEuclidWorklet } from "@synthlet/euclid";
import { registerGraniteWorklet } from "@synthlet/granite";
import { registerImpulseWorklet } from "@synthlet/impulse";
import { registerKarplusStrongWorklet } from "@synthlet/karplus-strong";
import { registerLevelMeterWorklet } from "@synthlet/level-meter";
import { registerLfoWorklet } from "@synthlet/lfo";
import { registerLookaheadLimiterWorklet } from "@synthlet/lookahead-limiter";
import { registerNoiseWorklet } from "@synthlet/noise";
import { registerParamWorklet } from "@synthlet/param";
import { registerPolyblepOscillatorWorklet } from "@synthlet/polyblep-oscillator";
import { registerReverbDelayWorklet } from "@synthlet/reverb-delay";
import { registerSvfWorklet } from "@synthlet/state-variable-filter";
import { registerVirtualAnalogFilterWorklet } from "@synthlet/virtual-analog-filter";
import { registerWavetableOscillatorWorklet } from "@synthlet/wavetable-oscillator";

export * from "@synthlet/ad";
export * from "@synthlet/adsr";
export * from "@synthlet/arp";
export * from "@synthlet/chorus";
export * from "@synthlet/clip-amp";
export * from "@synthlet/clock";
export * from "@synthlet/dattorro-reverb";
export * from "@synthlet/euclid";
export * from "@synthlet/granite";
export * from "@synthlet/impulse";
export * from "@synthlet/karplus-strong";
export * from "@synthlet/level-meter";
export * from "@synthlet/lfo";
export * from "@synthlet/lookahead-limiter";
export * from "@synthlet/noise";
export * from "@synthlet/param";
export * from "@synthlet/polyblep-oscillator";
export * from "@synthlet/reverb-delay";
export * from "@synthlet/state-variable-filter";
export * from "@synthlet/virtual-analog-filter";
export * from "@synthlet/wavetable-oscillator";
export { disposable } from "./_worklet";
export type { Connector, Disposable, ParamInput } from "./_worklet";

export { getSynthlet, Synthlet } from "./synthlet";
export * from "./synths/drums";
export * from "./synths/mono";
export * from "./waa";

export function registerAllWorklets(
  context: AudioContext
): Promise<AudioContext> {
  return Promise.all([
    registerAdsrWorklet(context),
    registerAdWorklet(context),
    registerArpWorklet(context),
    registerChorusWorklet(context),
    registerClipAmpWorklet(context),
    registerClockWorklet(context),
    registerDattorroReverbWorklet(context),
    registerEuclidWorklet(context),
    registerGraniteWorklet(context),
    registerImpulseWorklet(context),
    registerKarplusStrongWorklet(context),
    registerLevelMeterWorklet(context),
    registerLfoWorklet(context),
    registerLookaheadLimiterWorklet(context),
    registerNoiseWorklet(context),
    registerParamWorklet(context),
    registerPolyblepOscillatorWorklet(context),
    registerReverbDelayWorklet(context),
    registerSvfWorklet(context),
    registerVirtualAnalogFilterWorklet(context),
    registerWavetableOscillatorWorklet(context),
  ]).then(() => context);
}
