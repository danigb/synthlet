import {
  Connector,
  createRegistrar,
  createWorkletConstructor,
  Disposable,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

import { ClipType } from "./dsp";
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

export const createClipAmpNode = createWorkletConstructor<
  ClipAmpWorkletNode,
  ClipAmpInputs
>({
  processorName: "ClipAmpProcessor",
  paramNames: ["type", "preGain", "postGain"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});

const op = (
  params: ClipAmpInputs
): Connector<Disposable<ClipAmpWorkletNode>> => {
  let node: ClipAmpWorkletNode;
  return (context: AudioContext) => {
    node ??= createClipAmpNode(context, params);
    return node;
  };
};

export const ClipAmp = Object.assign(op, {
  soft: (preGain: ParamInput, postGain: ParamInput) =>
    op({ type: ClipType.TANH, preGain, postGain }),
});
