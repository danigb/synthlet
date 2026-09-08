import { registerAdWorklet } from "@synthlet/ad";
import { registerAnalogDelayWorklet } from "@synthlet/analog-delay";
import { registerAdsrWorklet } from "@synthlet/adsr";
import { registerArpWorklet } from "@synthlet/arp";
import { registerChorusWorklet } from "@synthlet/chorus";
import { registerClipAmpWorklet } from "@synthlet/clip-amp";
import { registerClockWorklet } from "@synthlet/clock";
import { registerDattorroReverbWorklet } from "@synthlet/dattorro-reverb";
import { registerDigitalDelayWorklet } from "@synthlet/digital-delay";
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
import { registerTimestretchAudioSourceWorklet } from "@synthlet/timestretch-audio-source";
import { registerVirtualAnalogFilterWorklet } from "@synthlet/virtual-analog-filter";
import { registerWavetableOscillatorWorklet } from "@synthlet/wavetable-oscillator";

export * from "@synthlet/ad";
export * from "@synthlet/analog-delay";
export * from "@synthlet/adsr";
export * from "@synthlet/arp";
export * from "@synthlet/chorus";
export * from "@synthlet/clip-amp";
export * from "@synthlet/clock";
export * from "@synthlet/dattorro-reverb";
export * from "@synthlet/digital-delay";
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
export * from "@synthlet/timestretch-audio-source";
export * from "@synthlet/virtual-analog-filter";
export * from "@synthlet/wavetable-oscillator";

// tsup's dts bundler drops enums from the `export *` re-exports above, so the
// umbrella names them: without this they exist at runtime but not in the types.
export { AnalogDelayMode } from "@synthlet/analog-delay";
export { ArpScale } from "@synthlet/arp";
export { ClipType } from "@synthlet/clip-amp";
export { LfoType } from "@synthlet/lfo";
export { NoiseType } from "@synthlet/noise";
export { ParamScaleType } from "@synthlet/param";
export { PolyblepOscillatorType } from "@synthlet/polyblep-oscillator";
export { SvfType } from "@synthlet/state-variable-filter";

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";

export * from "./synths/drums";
export * from "./synths/mono";
export { registerDrums, registerMonoSynth } from "./synths/registrars";
export * from "./waa";

export function registerAllWorklets<C extends BaseAudioContext>(
  context: C,
): Promise<C> {
  return Promise.all([
    registerAdsrWorklet(context),
    registerAdWorklet(context),
    registerAnalogDelayWorklet(context),
    registerArpWorklet(context),
    registerChorusWorklet(context),
    registerClipAmpWorklet(context),
    registerClockWorklet(context),
    registerDattorroReverbWorklet(context),
    registerDigitalDelayWorklet(context),
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
    registerTimestretchAudioSourceWorklet(context),
    registerVirtualAnalogFilterWorklet(context),
    registerWavetableOscillatorWorklet(context),
  ]).then(() => context);
}
