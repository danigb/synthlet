import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { SvfType } from "./dsp";

export type SvfInputs = {
  type?: ParamInput;
  frequency?: ParamInput;
  Q?: ParamInput;
};

export type SvfWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  Q: AudioParam;
  dispose(): void;
};

export const registerSvfWorklet = createRegistrar("SVF", PROCESSOR);

export const Svf = createWorkletConstructor<SvfWorkletNode, SvfInputs>({
  processorName: "SvfProcessor",
  descriptors: PARAMS,
  workletOptions() {
    return { numberOfInputs: 1, numberOfOutputs: 1 };
  },
});

export { disposable } from "./_worklet";
export type {
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
