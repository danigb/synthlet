import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { LfoType } from "./dsp";

/**
 * The AudioParams, which is all `createWorkletConstructor` connects.
 *
 * Separate from `LfoInputs` because `phase` is not one: the constructor's type
 * parameter is bounded by `Record<string, ParamInput>`, and `"random"` is not a
 * `ParamInput`. Widening that bound would rewrite `scripts/_worklet.ts` in all
 * 23 packages to serve one option, so the split stays here - the same split,
 * for the same reason, as `polyblep-oscillator/src/index.ts:12-21`.
 */
type LfoParams = {
  /** `LfoType`, k-rate. Structural: the generator is swapped when it changes. */
  type?: ParamInput;
  /**
   * **Bipolar**, `-200…200` Hz, k-rate. A negative frequency runs the phase
   * backwards - the reverse saw - and `frequency: 0` freezes it, holding the
   * shape's value at `phase`.
   */
  frequency?: ParamInput;
  /** Depth, `±20000`, k-rate. **A negative gain inverts the waveform.** */
  gain?: ParamInput;
  /** Where the waveform is centred, `±20000`, k-rate. */
  offset?: ParamInput;
  /**
   * The reset, a-rate. A **rising edge** - the transition from non-positive to
   * positive, synthlet's one gate contract - restarts the phase at `phase`.
   *
   * This is per-note vibrato, and it is tempo sync:
   *
   * ```ts
   * const clock = Clock(ac, { bpm: 120 });
   * // One cycle per beat at 120 BPM, locked to the beat.
   * const lfo = Lfo(ac, { frequency: 2, sync: clock.gate });
   * ```
   *
   * There is no `bpm` parameter and no division enum on purpose: a division is
   * `frequency` relative to a tempo the caller already knows, and a `bpm`
   * parameter would be a second `Clock`.
   *
   * Holding it positive fires once, not once per sample; a falling edge fires
   * nothing. A one-shot reset is `lfo.sync.setValueAtTime(1, t)` followed by
   * `setValueAtTime(0, t + eps)`. Never drive it with `setTargetAtTime`: a
   * signal that asymptotes towards zero never reaches it, so the gate would
   * never re-arm.
   *
   * The reset lands on the sample the edge was detected on. Unlike the two
   * oscillators, this package does not interpolate the sub-sample crossing
   * instant - 2.9 ms is nothing against a 5 Hz cycle.
   */
  sync?: ParamInput;
  /**
   * The depth envelope's note, a-rate. A **rising edge** restarts the fade at
   * zero depth; while the gate is high the fade advances, and while it is low
   * it **freezes** rather than resetting - so releasing mid-fade holds the
   * depth and the next note continues from there. A gate held high across
   * several legato notes is one edge and therefore one ramp.
   *
   * **This is not `sync`.** `sync` resets the phase; `gate` restarts the depth
   * ramp. A Juno's LFO free-runs while its depth fades in, which is only
   * expressible if the two are separate parameters.
   */
  gate?: ParamInput;
  /**
   * Seconds held at zero depth before the ramp begins, `0…10`, k-rate.
   * Default 0.
   */
  delay?: ParamInput;
  /**
   * Seconds from zero to **99%** of full depth, `0…10`, k-rate. Default 0 -
   * and `delay: 0, attack: 0` means no depth envelope at all, so `gate` is
   * ignored and the output is what it was before these parameters existed.
   *
   * Seconds are how long the move takes, the same meaning `Ad` and `Adsr` give
   * their own `attack`. A Juno-6 with its delay slider at maximum is
   * `attack: 6.91`: its ramp is a time constant of 1.5 s, and the two
   * conventions differ by exactly `ln(100)`.
   *
   * ```ts
   * // Vibrato that arrives 300 ms after the note and fades up over 700 ms.
   * const vibrato = Lfo(ac, {
   *   frequency: 5,
   *   gain: 10,
   *   delay: 0.3,
   *   attack: 0.7,
   *   gate,
   * });
   * ```
   *
   * With no `gate` ever connected the fade arms at construction: it runs once
   * from t=0 and stays at full depth.
   */
  attack?: ParamInput;
};

export type LfoInputs = LfoParams & {
  /**
   * The initial phase, in `[0, 1)`. **Construction only**, not an AudioParam:
   * it is a one-time initial condition, and an AudioParam would imply it meant
   * something continuously. It is also where a `sync` edge restarts the phase.
   *
   * A number is taken modulo 1, so `1.25` and `-0.75` both mean 0.25.
   * `"random"` draws once per instance, which is what makes two slow LFOs
   * independent without detuning either:
   *
   * ```ts
   * const wobble = [filter.frequency, panner.pan].map((destination) => {
   *   const lfo = Lfo(ac, { frequency: 0.3, phase: "random" });
   *   lfo.connect(destination);
   *   return lfo;
   * });
   * ```
   *
   * Without it every `Lfo` in an `AudioContext` free-runs from context time
   * zero, so two at the same rate are the *same signal*, forever.
   */
  phase?: number | "random";
};

export type LfoWorklet = AudioWorkletNode & {
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
  type: AudioParam;
  sync: AudioParam;
  gate: AudioParam;
  delay: AudioParam;
  attack: AudioParam;
  dispose(): void;
};

export const registerLfoWorklet = createRegistrar("LFO", PROCESSOR);

const create = createWorkletConstructor<LfoWorklet, LfoParams>({
  processorName: "LfoProcessor",
  descriptors: PARAMS,
  // `phase` travels as a processor option rather than as a param, so it is read
  // once in the constructor. `?? 0` keeps the DSP's own default explicit here
  // rather than relying on `undefined` reaching it.
  workletOptions: (inputs: Partial<LfoInputs>) => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    processorOptions: { phase: inputs.phase ?? 0 },
  }),
});

/**
 * The factory takes the wider input type - params *and* `phase` - while
 * `createWorkletConstructor` only ever sees the params. The wrapper re-attaches
 * `descriptors`, which `packages/synthlet/src/descriptors.test.ts` requires of
 * every module factory.
 */
export const Lfo = Object.assign(
  (context: BaseAudioContext, inputs: LfoInputs = {}) =>
    create(context, inputs),
  { descriptors: PARAMS },
);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
