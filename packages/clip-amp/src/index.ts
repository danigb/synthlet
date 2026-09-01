import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { ClipType } from "./dsp";

export const registerClipAmpWorklet = createRegistrar("CLIP_AMP", PROCESSOR);

export type ClipAmpInputs = {
  type: ParamInput;
  preGain: ParamInput;
  postGain: ParamInput;
};

export type ClipAmpWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  preGain: AudioParam;
  postGain: AudioParam;
  dispose(): void;
};

export const ClipAmp = createWorkletConstructor<
  ClipAmpWorkletNode,
  ClipAmpInputs
>({
  processorName: "ClipAmpProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});

export { disposable } from "./_worklet";
export type {
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
