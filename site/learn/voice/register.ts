import {
  registerAdsrWorklet,
  registerLfoWorklet,
  registerNoiseWorklet,
  registerParamWorklet,
  registerPolyblepOscillatorWorklet,
  registerSvfWorklet,
} from "synthlet";

/**
 * The six worklets the tutorial voice builds, and no others.
 *
 * `registerAllWorklets` would work and would also ship two reverbs, a granular
 * engine and a limiter to a page that plays one note - so this follows
 * `registerMonoSynth` (`packages/synthlet/src/synths/registrars.ts`) and names
 * them. Registration is cached per context, so a page with three widgets on it
 * calls this three times and downloads nothing twice.
 *
 * `BaseAudioContext`, so an `OfflineAudioContext` registers the same way and
 * `learn-voice.test.ts` can render the voice without a browser.
 */
export function registerLearnVoice<C extends BaseAudioContext>(
  context: C,
): Promise<C> {
  return Promise.all([
    registerAdsrWorklet(context),
    registerLfoWorklet(context),
    registerNoiseWorklet(context),
    registerParamWorklet(context),
    registerPolyblepOscillatorWorklet(context),
    registerSvfWorklet(context),
  ]).then(() => context);
}
