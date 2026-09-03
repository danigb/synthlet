import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { PolyblepOscillatorType } from "./dsp";

export type PolyblepOscillatorInputs = {
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
};

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 *
 * Four band-limited waveforms - sine, triangle, sawtooth, square - from one
 * discontinuity scheduler, with every parameter but `type` an a-rate signal:
 * pulse-width modulation, a continuous triangle-to-saw morph, and through-zero
 * linear FM, none of which `OscillatorNode` can do.
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  detune: AudioParam;
  width: AudioParam;
  dispose(): void;
};

export const registerPolyblepOscillatorWorklet = createRegistrar(
  "POLY_BLEP",
  PROCESSOR,
);

export const PolyblepOscillator = createWorkletConstructor<
  PolyblepOscillatorWorkletNode,
  PolyblepOscillatorInputs
>({
  processorName: "PolyBLEProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
