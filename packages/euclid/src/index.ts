import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerEuclidWorklet = createRegistrar("EUCLID", PROCESSOR);

export type EuclidInputs = {
  clock?: ParamInput;
  steps?: ParamInput;
  beats?: ParamInput;
  subdivison?: ParamInput;
  rotation?: ParamInput;
};

export type EuclidWorkletNode = AudioWorkletNode & {
  clock: AudioParam;
  steps: AudioParam;
  beats: AudioParam;
  subdivison: AudioParam;
  rotation: AudioParam;
  dispose(): void;
};

export const Euclid = createWorkletConstructor<EuclidWorkletNode, EuclidInputs>(
  {
    processorName: "EuclidProcessor",
    paramNames: ["clock", "steps", "beats", "subdivision", "rotation"],
    workletOptions: () => ({
      numberOfInputs: 0,
      numberOfOutputs: 1,
    }),
  }
);
