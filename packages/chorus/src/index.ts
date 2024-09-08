import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerChorusWorklet = createRegistrar("CHORUS", PROCESSOR);

export type ChorusInputs = {
  delay: ParamInput;
  rate: ParamInput;
  depth: ParamInput;
  deviation: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  delay: AudioParam;
  rate: AudioParam;
  depth: AudioParam;
  deviation: AudioParam;
  dispose(): void;
};

export const Chorus = createWorkletConstructor<ChorusWorkletNode, ChorusInputs>(
  {
    processorName: "ChorusProcessor",
    paramNames: ["delay", "rate", "depth", "deviation"],
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }),
  }
);
