import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { LfoType } from "./dsp";

export type LfoInputs = {
  type?: ParamInput;
  frequency?: ParamInput;
  gain?: ParamInput;
  offset?: ParamInput;
};

export type LfoWorklet = AudioWorkletNode & {
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
  type: AudioParam;
  dispose(): void;
};

export const registerLfoWorklet = createRegistrar("LFO", PROCESSOR);
export const Lfo = createWorkletConstructor<LfoWorklet, LfoInputs>({
  processorName: "LfoProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
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
