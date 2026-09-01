import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerChorusWorklet = createRegistrar("CHORUS", PROCESSOR);

export type ChorusInputs = {
  delay: ParamInput;
  rate: ParamInput;
  depth: ParamInput;
  deviation: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  delay: AudioParam;
  rate: AudioParam;
  depth: AudioParam;
  deviation: AudioParam;
  dispose(): void;
};

export const Chorus = createWorkletConstructor<ChorusWorkletNode, ChorusInputs>(
  {
    processorName: "ChorusProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }),
  }
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
