import { registerAdWorklet } from "@synthlet/ad";
import { registerAdsrWorklet } from "@synthlet/adsr";
import { registerClipAmpWorklet } from "@synthlet/clip-amp";
import { registerImpulseWorklet } from "@synthlet/impulse";
import { registerKarplusStrongWorklet } from "@synthlet/karplus-strong";
import { registerLfoWorklet } from "@synthlet/lfo";
import { registerNoiseWorklet } from "@synthlet/noise";
import { registerParamWorklet } from "@synthlet/param";
import { registerPolyblepOscillatorWorklet } from "@synthlet/polyblep-oscillator";
import { registerSvfWorklet } from "@synthlet/state-variable-filter";

// The context is `BaseAudioContext`, so an `OfflineAudioContext` registers the
// same worklets and renders the same compound - see `offline.test.ts`. It is a
// type parameter rather than the bare base type so the context comes back out
// as precisely the type that went in: `registerMonoSynth(new AudioContext())`
// still resolves to an `AudioContext`, not to something without `resume()`.

// A compound only needs the worklets it builds. `registerAllWorklets` is still
// there for anyone who wants everything, but a MonoSynth doesn't need two
// reverbs, a granular engine and a limiter. Registration is cached per context,
// so these compose freely with each other and with registerAllWorklets.

/**
 * Register the worklets `MonoSynth` builds: the oscillator, the vibrato LFO,
 * the filter and amplifier envelopes, the filter, and the Param nodes behind
 * its `gate` and `volume` inlets.
 *
 * It is also `monoVoice.register`, so an `Instrument` built from that
 * definition registers exactly these five and nothing else - the definition
 * wraps the same compound, and a pool of eight of it needs no more worklets
 * than one of it does.
 */
export function registerMonoSynth<C extends BaseAudioContext>(
  context: C,
): Promise<C> {
  return Promise.all([
    registerAdsrWorklet(context),
    registerLfoWorklet(context),
    registerParamWorklet(context),
    registerPolyblepOscillatorWorklet(context),
    registerSvfWorklet(context),
  ]).then(() => context);
}

/** Register the worklets the eleven drums build between them. */
export function registerDrums<C extends BaseAudioContext>(
  context: C,
): Promise<C> {
  return Promise.all([
    registerAdWorklet(context),
    registerClipAmpWorklet(context),
    registerImpulseWorklet(context),
    registerKarplusStrongWorklet(context), // MembraneDrum's resonator
    registerLfoWorklet(context), // HandclapDrum's ramp
    registerNoiseWorklet(context),
    registerParamWorklet(context),
  ]).then(() => context);
}
