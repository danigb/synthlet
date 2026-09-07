import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerChorusWorklet = createRegistrar("CHORUS", PROCESSOR);

export type ChorusInputs = {
  rate?: ParamInput;
  depth?: ParamInput;
  mix?: ParamInput;
  width?: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  rate: AudioParam;
  depth: AudioParam;
  mix: AudioParam;
  width: AudioParam;
  dispose(): void;
};

export { ChorusMode } from "./dsp";

export const Chorus = createWorkletConstructor<ChorusWorkletNode, ChorusInputs>(
  {
    processorName: "ChorusProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }),
  },
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
