import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerReverbDelayWorklet = createRegistrar(
  "REVERB-DELAY",
  PROCESSOR,
);

export type ReverbDelayInputs = {
  delay: ParamInput;
  damping: ParamInput;
  size: ParamInput;
  diffusion: ParamInput;
  feedback: ParamInput;
  modDepth: ParamInput;
  modFreq: ParamInput;
};

export type ReverbDelayWorkletNode = AudioWorkletNode & {
  delay: AudioParam;
  damping: AudioParam;
  size: AudioParam;
  diffusion: AudioParam;
  feedback: AudioParam;
  modDepth: AudioParam;
  modFreq: AudioParam;
  dispose(): void;
};

export const ReverbDelay = createWorkletConstructor<
  ReverbDelayWorkletNode,
  ReverbDelayInputs
>({
  processorName: "ReverbDelayProcessor",
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
