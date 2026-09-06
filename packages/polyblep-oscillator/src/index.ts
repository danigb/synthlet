import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { PolyblepOscillatorType } from "./dsp";

/**
 * The AudioParams, which is all `createWorkletConstructor` connects.
 *
 * It is separate from `PolyblepOscillatorInputs` because `phase` is not one:
 * the constructor's type parameter is bounded by
 * `Record<string, ParamInput>`, and `"random"` is not a `ParamInput`. Widening
 * that bound would rewrite `scripts/_worklet.ts` in all 23 packages to serve
 * one option, so the split stays here.
 */
type PolyblepOscillatorParams = {
  /** `PolyblepOscillatorType`, k-rate. A change is scheduled as a step, so it does not click. */
  type?: ParamInput;
  /**
   * **Bipolar**, `-20000…20000` Hz, a-rate.
   *
   * A negative frequency runs the phase backwards, and it is band-limited going
   * that way: the sawtooth and the square hold the same alias floors at `-f` as
   * at `+f`. Connecting a node here is *linear* FM, because `AudioParam` sums
   * its inputs with the intrinsic value - so a modulator deeper than the base
   * pitch sweeps through zero and out the other side instead of being rectified
   * at the bottom. `frequency = 0` holds: the phase freezes and the output
   * holds a constant.
   */
  frequency?: ParamInput;
  /** In cents, `-1200…1200`, a-rate. Multiplies `frequency`, so it inherits its sign. */
  detune?: ParamInput;
  /** Pulse width on the square, peak position on the triangle, `0…1`, a-rate. */
  width?: ParamInput;
  /**
   * Hard sync, a-rate. A **rising edge** - the transition from non-positive to
   * positive, synthlet's one gate contract - restarts the phase at `phase`,
   * band-limited: the reset is scheduled as a step and a slope change at the
   * interpolated crossing instant rather than spliced at the sample boundary,
   * so it is correct for all four waveforms including the triangle.
   *
   * Connect an oscillator here and you have the classic sound: the master's
   * pitch sets the perceived note, the slave's sets the timbre.
   *
   * ```ts
   * const master = PolyblepOscillator(ac, { frequency: 110 });
   * const slave = PolyblepOscillator(ac, { frequency: 660, sync: master });
   * ```
   *
   * Holding it positive fires once, not once per sample; a falling edge fires
   * nothing. A one-shot reset is `osc.sync.setValueAtTime(1, t)` followed by
   * `setValueAtTime(0, t + eps)`. Never drive it with `setTargetAtTime`: a
   * signal that asymptotes towards zero never reaches it, so the gate would
   * never re-arm.
   */
  sync?: ParamInput;
};

export type PolyblepOscillatorInputs = PolyblepOscillatorParams & {
  /**
   * The initial phase, in `[0, 1)`. **Construction only**, not an AudioParam:
   * it is a one-time initial condition, and an AudioParam would imply it meant
   * something continuously. It is also where a `sync` edge restarts the phase.
   *
   * A number is taken modulo 1, so `1.25` and `-0.75` both mean 0.25.
   * `"random"` draws once per instance, which is what stops stacked
   * oscillators combing at the attack:
   *
   * ```ts
   * const voices = [-7, 0, 7].map((detune) =>
   *   PolyblepOscillator(ac, { frequency: 220, detune, phase: "random" }),
   * );
   * ```
   *
   * Detuned oscillators drift apart on their own, but not for the first few
   * hundred milliseconds - which is the part of a supersaw you actually hear
   * as the attack.
   */
  phase?: number | "random";
};

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 *
 * Four band-limited waveforms - sine, triangle, sawtooth, square - from one
 * discontinuity scheduler, with every parameter but `type` an a-rate signal:
 * pulse-width modulation, a continuous triangle-to-saw morph, through-zero
 * linear FM, sub-sample hard sync and a per-instance initial phase, none of
 * which `OscillatorNode` can do.
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  detune: AudioParam;
  width: AudioParam;
  sync: AudioParam;
  dispose(): void;
};

export const registerPolyblepOscillatorWorklet = createRegistrar(
  "POLY_BLEP",
  PROCESSOR,
);

const create = createWorkletConstructor<
  PolyblepOscillatorWorkletNode,
  PolyblepOscillatorParams
>({
  processorName: "PolyBLEProcessor",
  descriptors: PARAMS,
  // `phase` travels as a processor option rather than as a param, so it is
  // read once in the constructor. `?? 0` keeps the DSP's own default explicit
  // here rather than relying on `undefined` reaching it.
  workletOptions: (inputs: Partial<PolyblepOscillatorInputs>) => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
    processorOptions: { phase: inputs.phase ?? 0 },
  }),
});

/**
 * The factory takes the wider input type - params *and* `phase` - while
 * `createWorkletConstructor` only ever sees the params. The wrapper is
 * `packages/flex-audio-buffer-source/src/index.ts:121-217`'s shape, including
 * re-attaching `descriptors`, which `packages/synthlet/src/descriptors.test.ts`
 * requires of every module factory.
 */
export const PolyblepOscillator = Object.assign(
  (context: AudioContext, inputs: PolyblepOscillatorInputs = {}) =>
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
