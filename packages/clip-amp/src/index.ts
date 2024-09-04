import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { ClipType } from "./dsp";

export const registerClipAmpWorkletOnce = createRegistrar(
  "CLIP-AMP",
  PROCESSOR
);

export type ClipAmpInputParams = {
  clipType: ParamInput;
  preGain: ParamInput;
  postGain: ParamInput;
};

export type ClipAmpWorkletNode = AudioWorkletNode & {
  clipType: AudioParam;
  preGain: AudioParam;
  postGain: AudioParam;
  dispose(): void;
};

export const createClipAmpNode = createWorkletConstructor<
  ClipAmpWorkletNode,
  ClipAmpInputParams
>({
  processorName: "ClipAmpProcessor",
  paramNames: ["clipType", "preGain", "postGain"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});
