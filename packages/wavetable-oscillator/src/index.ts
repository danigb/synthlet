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
import {
  fetchWavetable,
  toCatalog,
  Wavetable,
  WavetableCatalog,
} from "./wavetable-loader";

export {
  decodeWav,
  decodeWavetable,
  fetchWavetable,
  toCatalog,
  WAVEDIT_BASE_URL,
  waveditCatalog,
} from "./wavetable-loader";
export type {
  DecodedWav,
  Wavetable,
  WavetableCatalog,
} from "./wavetable-loader";
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
  detune?: ParamInput;
  morph?: ParamInput;
  sync?: ParamInput;
  segments?: ParamInput;
  pitchChaos?: ParamInput;
  pitchSpread?: ParamInput;
  ampChaos?: ParamInput;
  ampSpread?: ParamInput;
};

export type WavetableOscillatorOptions = WavetableInputs & {
  /**
   * Where the read position starts, as a fraction of one cycle: `0.25` is a
   * quarter of the way into the table, `"random"` draws once for this instance.
   *
   * A construction option rather than an `AudioParam`, because it is a one-time
   * initial condition and not a continuously meaningful signal. It is what stops
   * a stack of oscillators combing: three instances built at phase 0 begin
   * phase-locked, and the first few hundred milliseconds of every note are the
   * same comb filter.
   *
   * ```ts
   * const stack = [-7, 0, 7].map((cents) =>
   *   WavetableOscillator(ac, { frequency, detune: cents, phase: "random" }),
   * );
   * ```
   */
  phase?: number | "random";
  /**
   * How often the stochastic mode's **pitch** deviation is drawn, if the mode
   * is running at all: `false` (the default) once per wave cycle, `true` once
   * per segment.
   *
   * The default is Radna 2.4's own recommendation and is the one antialiasing
   * measure that paper implements. Treating the whole table as a single
   * segment for pitch "preserves the shape, and therefore timbre, of a
   * particular wavetable" — measured here, 18.5 dB less energy above 10 kHz at
   * the paper's Fig. 4 settings, and a spectral centroid of 894 Hz against
   * 1651. `true` is the standard DSWS behaviour: rougher, granular, and
   * audibly more aliased.
   *
   * A construction option rather than an `AudioParam` because it selects an
   * algorithm, and an `AudioParam` would promise it can be crossfaded.
   */
  pitchPerSegment?: boolean;
  /**
   * Where `loadWavetable` and `fetchWavetableNames` resolve bare names. A
   * string is shorthand for `waveditCatalog(baseUrl)`; a `WavetableCatalog`
   * replaces the resolution entirely.
   *
   * Defaults to the WaveEdit Online mirror — **a third party's GitHub Pages
   * site** — and is here because `docs/vision.md` requires every URL in the
   * library to be overridable and self-hostable. Nothing fetches until you ask
   * it to: the oscillator is audible on construction from a table it generates
   * for itself.
   */
  catalog?: WavetableCatalog | string;
};

/** What `loadWavetable` needs beyond a name. */
export type LoadWavetableOptions = {
  /**
   * Samples per plane, 256 by default. It is an assumption about someone
   * else's file, so decoding throws if the file's sample count is not a whole
   * multiple of it rather than truncating to fit.
   */
  length?: number;
  /** Where a bare name resolves — see `WavetableOscillatorOptions.catalog`. */
  catalog?: WavetableCatalog | string;
};

export type WavetableOscillatorWorkletNode = AudioWorkletNode & {
  /**
   * The pitch in Hz, a-rate and **bipolar**: `[-20000, 20000]`.
   *
   * `AudioParam` sums its inputs with the intrinsic value, so a node connected
   * here is linear FM by construction, and the negative half is what makes it
   * *through-zero* FM — the read pointer runs backwards rather than the
   * modulator being half-wave rectified at the bottom of the range.
   */
  frequency: AudioParam;
  /**
   * Detune in cents, a-rate: ±1 octave, applied as a multiply on the increment.
   * Stack three instances a few cents apart, give each `phase: "random"`, and
   * that is a supersaw.
   */
  detune: AudioParam;
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
  /**
   * Hard sync: a rising edge restarts the table read at `phase`.
   *
   * ```ts
   * const master = PolyblepOscillator(ac, { frequency: 110, type: 2 });
   * const slave = WavetableOscillator(ac, { frequency: 275, sync: master });
   * ```
   *
   * a-rate, and that is not decoration. The reset is placed at the sub-sample
   * instant the gate crossed zero, and the step and the corner it makes are
   * band-limited with the same 4-point B-spline kernels
   * `@synthlet/polyblep-oscillator` uses. A gate read once per render quantum
   * could only place the reset on a block boundary, which is 2.9 ms of jitter at
   * 44.1 kHz.
   *
   * **This is where the node's two samples of latency come from** - 45.4 us,
   * the same as `@synthlet/polyblep-oscillator`, and paid whether or not
   * anything is connected here, because a latency that changed when you plugged
   * a cable in would step the output mid-note. It buys 17.6 to 33.9 dB of alias
   * rejection over an uncorrected reset.
   *
   * The gate rule for the whole library applies: drive it with
   * `setValueAtTime` or `linearRampToValueAtTime`, or from another oscillator,
   * but never with `setTargetAtTime` - a signal that asymptotes towards zero
   * never reaches it, so the gate would never re-arm.
   */
  sync: AudioParam;
  /**
   * How many segments the table is divided into for the stochastic mode, 0–256,
   * k-rate. More segments is a brighter and rougher deviation (Radna 2.1
   * Fig. 2); 0 and 1 both mean one segment, the case where the whole table is
   * affected uniformly.
   *
   * Structural rather than a signal, so it is the one parameter of the five
   * that is not a-rate.
   */
  segments: AudioParam;
  /**
   * How much of the pitch barrier the deviation may cross in one wave cycle,
   * `[0, 1]`: 0 freezes the walk where it stands, 1 redraws it from the whole
   * range every cycle. It is the *speed* knob; `pitchSpread` is the depth one.
   */
  pitchChaos: AudioParam;
  /**
   * The stochastic pitch deviation's barrier, in semitones either side of the
   * pitch you asked for: `[0, 24]`, and **0 switches the pitch path off**.
   *
   * ```ts
   * // organic drift, the subtle end
   * const osc = WavetableOscillator(ac, { pitchSpread: 0.2, pitchChaos: 0.3 });
   * // Radna's own Fig. 4 setting, which is the noise end
   * const noisy = WavetableOscillator(ac, { pitchSpread: 24, pitchChaos: 0.25 });
   * ```
   *
   * The deviation is centred in semitones, so the tone holds the pitch it was
   * asked for: measured, the mean over four seconds at a half-semitone barrier
   * is within 2.3 cents. The mean *frequency* of the same signal is slightly
   * flat — 1.5 cents at a barrier of one semitone — because averaging a
   * symmetric deviation in the log domain is not the same as averaging it in
   * Hz.
   *
   * a-rate, and the four stochastic parameters are all **sampled once per wave
   * cycle**, because that is the rate the random walk runs at. Connecting an
   * envelope here works and is the intended way to make the roughness part of
   * a note's shape; connecting an audio-rate oscillator does not produce
   * audio-rate modulation.
   */
  pitchSpread: AudioParam;
  /** `pitchChaos` for the amplitude path: how fast that walk moves. */
  ampChaos: AudioParam;
  /**
   * The stochastic amplitude deviation's barrier, `[0, 1]` of full scale, and
   * **0 switches the amplitude path off**.
   *
   * The deviation is added to the sample, interpolated across segment
   * boundaries so none of them is a step, and folded at ±1 — Radna calls the
   * result "a segmented, stochastic wavefolder". It is the timbral half of the
   * mode, and the noisier half: see the README for what it costs in aliasing.
   */
  ampSpread: AudioParam;
  /**
   * Where this node resolves bare wavetable names. Set at construction with
   * `WavetableOscillator(ac, { catalog })`, and writable afterwards — it is
   * read at call time, not captured.
   */
  catalog: WavetableCatalog;
  /**
   * Fetch a wavetable by name (or by URL) and play it.
   *
   * **The returned promise rejects, and rejects for ordinary reasons** — the
   * network, a 404, a stereo file, a format this package cannot read, a frame
   * length that does not divide the file. Handle it. Nothing is lost when it
   * happens: the node keeps playing the table it already has, which since the
   * built-in set is never silence.
   */
  loadWavetable(
    nameOrUrl: string,
    options?: ConditionOptions & LoadWavetableOptions,
  ): Promise<void>;
  /** Every name in this node's catalog. Rejects if the catalog cannot say. */
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

const create = createWorkletConstructor<
  WavetableOscillatorWorkletNode,
  WavetableInputs
>({
  processorName: "WavetableOscillatorWorkletProcessor",
  descriptors: PARAMS,
  // `phase` is not a `ParamInput` — `"random"` is not one — so it cannot be a
  // member of `WavetableInputs`, whose values `connectParams` walks. But the
  // construction options are handed to `workletOptions` whole, which is how it
  // reaches the processor, read once there in the constructor. Widening this
  // parameter rather than casting inside the body type-checks because every
  // member is optional, so `Partial<WavetableInputs>` is assignable to
  // `Partial<WavetableOscillatorOptions>`.
  workletOptions: (inputs: Partial<WavetableOscillatorOptions>) => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    processorOptions: {
      phase: inputs.phase ?? 0,
      pitchPerSegment: inputs.pitchPerSegment ?? false,
    },
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
      // A copy, then a transfer — `timestretch-audio-source/src/index.ts:145-153`'s
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
    // Read through `node.catalog` rather than captured, so both the
    // construction option below and a later assignment take effect.
    node.catalog = toCatalog();
    node.fetchWavetableNames = () =>
      fetchWavetableNames({ catalog: node.catalog });
    // The rejection is *returned*, not swallowed. Every failure here is an
    // ordinary one - offline, a 404, a stereo file - and the caller is the only
    // one who can say what to do about it. `loadWavetable` decodes but does not
    // condition; `setWavetable` is what conditions, which is why the same
    // options object goes to both.
    node.loadWavetable = (nameOrUrl, options = {}) =>
      loadWavetable(nameOrUrl, { catalog: node.catalog, ...options }).then(
        (wavetable) => {
          node.setWavetable(wavetable, options);
        },
      );
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
 * A morphing wavetable oscillator.
 *
 * ```ts
 * const osc = WavetableOscillator(ac, { frequency: 440, morph: 0.5 });
 * // detuned and started somewhere of its own, which is how a stack is built:
 * const up = WavetableOscillator(ac, { detune: 7, phase: "random" });
 * // and, to fetch from your own mirror rather than a third party's:
 * const own = WavetableOscillator(ac, { catalog: "/wavetables" });
 * ```
 *
 * The wrapper around `createWorkletConstructor` exists for `catalog` alone:
 * `postCreate` does not see the construction inputs, so an input-dependent
 * property is attached here instead — `lookahead-limiter/src/index.ts:61-80`'s
 * idiom. `Object.assign` keeps `descriptors` on the factory. (`phase` needs no
 * wrapper: `workletOptions` does see them.)
 */
export const WavetableOscillator = Object.assign(
  (context: AudioContext, options: WavetableOscillatorOptions = {}) => {
    const node = create(context, options);
    if (options.catalog !== undefined)
      node.catalog = toCatalog(options.catalog);
    return node;
  },
  { descriptors: PARAMS },
);

/**
 * Fetch and decode a wavetable, **as it is on disk**. Conditioning belongs to
 * playback rather than to decoding, so it happens in `setWavetable`; a caller who
 * wants a conditioned table without a node calls `conditionWavetable` on the
 * result.
 *
 * `nameOrUrl` is a catalog name, or any URL — `http(s):`, `blob:`, `data:` and
 * paths are passed through unresolved, so a table served from your own origin
 * needs no catalog at all.
 *
 * The promise **rejects** with a message naming what went wrong: the status of
 * a failed request, the channel count of a stereo file, the format tag and bit
 * depth of an unreadable one, the sample count of a file whose frames are not
 * `length` long.
 */
export function loadWavetable(
  nameOrUrl: string,
  options: LoadWavetableOptions = {},
): Promise<Wavetable> {
  const { length = DEFAULT_WAVETABLE_LENGTH, catalog } = options;
  return fetchWavetable(toCatalog(catalog).url(nameOrUrl), length);
}

/**
 * Every wavetable name a catalog holds, defaulting to the WaveEdit Online
 * mirror — see `WAVEDIT_BASE_URL` for what that is and why it is overridable.
 */
export function fetchWavetableNames(
  options: { catalog?: WavetableCatalog | string } = {},
): Promise<string[]> {
  return toCatalog(options.catalog).names();
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
