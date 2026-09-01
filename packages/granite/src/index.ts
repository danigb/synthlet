import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerGraniteWorklet = createRegistrar("GRANITE", PROCESSOR);

export type GraniteInputs = {
  wet?: ParamInput;
  speed?: ParamInput;
  density?: ParamInput;
  spread?: ParamInput;
};

export type GraniteWorkletNode = AudioWorkletNode & {
  wet: AudioParam;
  speed: AudioParam;
  density: AudioParam;
  spread: AudioParam;
  dispose(): void;
};

export const Granite = createWorkletConstructor<
  GraniteWorkletNode,
  GraniteInputs
>({
  processorName: "GraniteProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
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
