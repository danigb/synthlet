import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { SlewType } from "./dsp";

export const registerSlewLimiterWorklet = createRegistrar(
  "SLEW_LIMITER",
  PROCESSOR,
);

export type SlewLimiterInputs = {
  type: ParamInput;
  /** Upward: seconds for 99 % of a step (exponential) or per unit (linear). */
  rise: ParamInput;
  /** Downward, same units. */
  fall: ParamInput;
};

export type SlewLimiterWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  rise: AudioParam;
  fall: AudioParam;
  dispose(): void;
};

export const SlewLimiter = createWorkletConstructor<
  SlewLimiterWorkletNode,
  SlewLimiterInputs
>({
  processorName: "SlewLimiterProcessor",
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
