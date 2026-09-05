import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";
import {
  buildWavetable,
  DEFAULT_WAVETABLE_LENGTH,
  defaultWavetable,
  mipmapWavetable,
} from "./wavetable-builder";
import { ConditionOptions, conditionWavetable } from "./wavetable-conditioner";
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export { Wavetable } from "./wavetable-loader";
// Conditioning is main-thread too, and shares the builder's canonical phase.
export {
  alignPhases,
  conditionWavetable,
  normalizeRms,
  removeDc,
} from "./wavetable-conditioner";
export type {
  ConditionedWavetable,
  ConditionOptions,
} from "./wavetable-conditioner";
// The builder is main-thread and usable standalone: `worklet.ts` never imports
// it, so it cannot reach the inlined `processor.ts` payload.
export {
  analyzeHarmonics,
  BUILT_IN_SHAPES,
  buildPlane,
  buildWavetable,
  builtInHarmonics,
  canonicalPhase,
  DEFAULT_WAVETABLE_LENGTH,
  defaultWavetable,
  mipHarmonics,
  mipLevelCount,
  mipmapWavetable,
  normalizePeak,
  shapeHarmonics,
  trigTable,
} from "./wavetable-builder";
export type { BuiltInShape, TrigTable } from "./wavetable-builder";

export type WavetableInputs = {
  frequency?: ParamInput;
  morph?: ParamInput;
};

export type WavetableOscillatorWorkletNode = AudioWorkletNode & {
  frequency: AudioParam;
  /**
   * The wavetable position in `[0, 1]`: 0 is the first plane, 1 is the last,
   * and everything between crossfades the two planes either side of it.
   * Normalized rather than a plane index, so a modulator patched into it does
   * not have to know the current table's plane count.
   *
   * a-rate: `Lfo(ac, { frequency: 0.05 }).connect(osc.morph)` is a slow scan,
   * and the same connection at audio rate is a wavetable oscillator's signature
   * sound. A position that jumps - a slider drag, an envelope step - is ramped
   * over 64 samples rather than stepped.
   */
  morph: AudioParam;
  loadWavetable(urlOrName: string, options?: ConditionOptions): Promise<void>;
  fetchWavetableNames(): Promise<string[]>;
  /**
   * Play a wavetable. If it does not already carry a mipmap pyramid — anything
   * `buildWavetable` produced does, anything decoded from samples does not — it
   * is **conditioned** and then a pyramid is built for it, both here on the main
   * thread, before the table is transferred to the worklet. That is where all
   * the band-limiting in this package lives.
   *
   * Conditioning removes each plane's DC, rewrites every harmonic to the same
   * canonical phase the generated tables use, and matches the planes' loudness,
   * so a morph across an imported table changes timbre and not level and does
   * not dip where two planes disagree. It is measurable on the real wavedit
   * catalogue: `SYNLP10` loses 5.7 dB on an average crossfade without it. Each
   * step can be switched off on its own — see `ConditionOptions` — because each
   * is a judgement about someone else's data.
   */
  setWavetable(wavetable: Wavetable, options?: ConditionOptions): void;
  /**
   * Build a wavetable from one harmonic magnitude spectrum per plane and play
   * it. `setHarmonics([[1], [1, 0.5, 0.25]])` morphs a sine into a
   * three-harmonic tone.
   *
   * `planes[p][0]` is the fundamental of plane `p` — unlike Web Audio's
   * `PeriodicWave`, whose index 0 is DC. Every plane is built at the same
   * canonical phase, which is what makes the morph between them a spectral
   * interpolation rather than a phase cancellation.
   */
  setHarmonics(planes: ArrayLike<number>[], length?: number): void;
  dispose(): void;
};

export const registerWavetableOscillatorWorklet = createRegistrar(
  "WT",
  PROCESSOR,
);

export const WavetableOscillator = createWorkletConstructor<
  WavetableOscillatorWorkletNode,
  WavetableInputs
>({
  processorName: "WavetableOscillatorWorkletProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    node.setWavetable = (wavetable, options) => {
      // Conditioning and band-limiting both happen here, on the main thread, at
      // load — never in the worklet and never in the published payload.
      //
      // `levels > 1` is one test doing two jobs, and that is the point: a table
      // that carries a pyramid came from `buildWavetable`, which is canonical,
      // DC-free and peak-normalized by construction, so it needs neither step
      // and is passed straight through. Anything else arrived as samples from
      // someone else, and gets both.
      //
      // Conditioning runs *first*. `mipmapWavetable` resynthesises every level
      // from the base plane's own harmonics, so a phase rewrite or a gain
      // applied after it would have to be applied identically to all eight
      // levels instead of once to the plane they all come from.
      const pyramid =
        wavetable.levels && wavetable.levels > 1
          ? wavetable
          : mipmapWavetable(conditionWavetable(wavetable, options));
      // A copy, then a transfer — `flex-audio-buffer-source/src/index.ts:145-153`'s
      // idiom. The copy is not ceremony: `defaultWavetable` memoizes one instance
      // and shares it between every node, and transferring that buffer would
      // detach it and leave the second node with an empty table. At 32 KB for the
      // built-in set and 512 KB for a 64-plane one, the transfer is what keeps
      // this off the structured-clone path.
      const data = pyramid.data.slice();
      node.port.postMessage(
        {
          type: "WAVETABLE",
          wavetable: data,
          length: pyramid.length,
          levels: pyramid.levels,
        },
        [data.buffer],
      );
    };
    node.setHarmonics = (planes, length = DEFAULT_WAVETABLE_LENGTH) => {
      node.setWavetable(buildWavetable(planes, length));
    };
    node.fetchWavetableNames = fetchWavetableNames;
    node.loadWavetable = (urlOrName, options) =>
      loadWavetable(urlOrName).then((wavetable) => {
        node.setWavetable(wavetable, options);
      });
    // Sound on construction. Until this line the node was silent until a fetch
    // against a third party's GitHub Pages mirror resolved — the only generator
    // in the catalogue that behaved that way, unusable offline or under a strict
    // CSP, and unable to claim tier A. The built-in table is generated from a
    // few hundred bytes of harmonic rules, is shared between nodes, and is
    // replaced by the first `setWavetable`, `setHarmonics` or `loadWavetable`.
    node.setWavetable(defaultWavetable());
  },
});

/**
 * Fetch and decode a wavetable, **as it is on disk**. Conditioning belongs to
 * playback rather than to decoding, so it happens in `setWavetable`; a caller who
 * wants a conditioned table without a node calls `conditionWavetable` on the
 * result.
 */
export function loadWavetable(
  nameOrUrl: string,
  wavetableLength = 256,
): Promise<Wavetable> {
  const url = nameOrUrl.startsWith("http")
    ? nameOrUrl
    : `https://smpldsnds.github.io/wavedit-online/samples/${nameOrUrl.toUpperCase()}.WAV`;
  return new WavetableLoader(url, wavetableLength).onLoad();
}

export function fetchWavetableNames(): Promise<string[]> {
  return WavetableLoader.fetchAvailableNames();
}

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
