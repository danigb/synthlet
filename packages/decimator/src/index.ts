import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerDecimatorWorklet = createRegistrar("DECIMATOR", PROCESSOR);

export type DecimatorInputs = {
  /** The new sample rate in Hz. At or above the context's rate, no hold. */
  rate: ParamInput;
  /** Bit depth. 24 is transparent; fractional values allowed. */
  bits: ParamInput;
  /** 1 puts the lowpass at `0.45 x rate` **before** the hold. */
  antialias: ParamInput;
  /** 1 puts the same lowpass **after** the quantiser. */
  reconstruct: ParamInput;
};

export type DecimatorWorkletNode = AudioWorkletNode & {
  rate: AudioParam;
  bits: AudioParam;
  antialias: AudioParam;
  reconstruct: AudioParam;
  dispose(): void;
};

export const Decimator = createWorkletConstructor<
  DecimatorWorkletNode,
  DecimatorInputs
>({
  processorName: "DecimatorProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
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
