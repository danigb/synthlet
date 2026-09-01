import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerEuclidWorklet = createRegistrar("EUCLID", PROCESSOR);

export type EuclidInputs = {
  clock?: ParamInput;
  steps?: ParamInput;
  beats?: ParamInput;
  subdivision?: ParamInput;
  rotation?: ParamInput;
};

export type EuclidWorkletNode = AudioWorkletNode & {
  clock: AudioParam;
  steps: AudioParam;
  beats: AudioParam;
  subdivision: AudioParam;
  rotation: AudioParam;
  dispose(): void;
};

export const Euclid = createWorkletConstructor<EuclidWorkletNode, EuclidInputs>(
  {
    processorName: "EuclidProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 0,
      numberOfOutputs: 1,
    }),
  }
);

export { disposable } from "./_worklet";
export type {
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
