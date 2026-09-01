import { registerAdWorklet } from "@synthlet/ad";
import { registerAdsrWorklet } from "@synthlet/adsr";
import { registerClipAmpWorklet } from "@synthlet/clip-amp";
import { registerImpulseWorklet } from "@synthlet/impulse";
import { registerLfoWorklet } from "@synthlet/lfo";
import { registerNoiseWorklet } from "@synthlet/noise";
import { registerParamWorklet } from "@synthlet/param";
import { registerPolyblepOscillatorWorklet } from "@synthlet/polyblep-oscillator";
import { registerSvfWorklet } from "@synthlet/state-variable-filter";

// A compound only needs the worklets it builds. `registerAllWorklets` is still
// there for anyone who wants everything, but a MonoSynth doesn't need two
// reverbs, a granular engine and a limiter. Registration is cached per context,
// so these compose freely with each other and with registerAllWorklets.

/**
 * Register the worklets `MonoSynth` builds: the oscillator, the vibrato LFO,
 * the filter and amplifier envelopes, the filter, and the Param nodes behind
 * its `gate` and `volume` inlets.
 */
export function registerMonoSynth(
  context: AudioContext
): Promise<AudioContext> {
  return Promise.all([
    registerAdsrWorklet(context),
    registerLfoWorklet(context),
    registerParamWorklet(context),
    registerPolyblepOscillatorWorklet(context),
    registerSvfWorklet(context),
  ]).then(() => context);
}

/** Register the worklets the ten drums build between them. */
export function registerDrums(context: AudioContext): Promise<AudioContext> {
  return Promise.all([
    registerAdWorklet(context),
    registerClipAmpWorklet(context),
    registerImpulseWorklet(context),
    registerLfoWorklet(context), // HandclapDrum's ramp
    registerNoiseWorklet(context),
    registerParamWorklet(context),
  ]).then(() => context);
}
