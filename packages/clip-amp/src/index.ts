import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { ClipType } from "./dsp";

export const registerClipAmpWorkletOnce = createRegistrar(PROCESSOR);

export type ClipAmpInputParams = {
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

export const createClipAmpNode = createWorkletConstructor<
  ClipAmpWorkletNode,
  ClipAmpInputParams
>({
  processorName: "ClipAmpProcessor",
  paramNames: ["type", "preGain", "postGain"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});
