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
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export { Wavetable } from "./wavetable-loader";
// The builder is main-thread and usable standalone: `worklet.ts` never imports
// it, so it cannot reach the inlined `processor.ts` payload.
export {
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
} from "./wavetable-builder";
export type { BuiltInShape } from "./wavetable-builder";

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
  loadWavetable(urlOrName: string): Promise<void>;
  fetchWavetableNames(): Promise<string[]>;
  /**
   * Play a wavetable. If it does not already carry a mipmap pyramid — anything
   * `buildWavetable` produced does, anything decoded from samples does not —
   * one is built here, on the main thread, before the table is transferred to
   * the worklet. That is where all the band-limiting in this package lives.
   */
  setWavetable(wavetable: Wavetable): void;
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
    node.setWavetable = (wavetable) => {
      // Band-limiting is built here, on the main thread, at load — never in the
      // worklet and never in the published payload. A table that already carries
      // a pyramid (everything `buildWavetable` makes) is passed straight
      // through; anything that arrived as samples is analysed and truncated.
      const pyramid =
        wavetable.levels && wavetable.levels > 1
          ? wavetable
          : mipmapWavetable(wavetable);
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
    node.loadWavetable = (urlOrName) =>
      loadWavetable(urlOrName).then((wavetable) => {
        node.setWavetable(wavetable);
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
