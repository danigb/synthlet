import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerChorusWorklet = createRegistrar("CHORUS", PROCESSOR);

export type ChorusInputs = {
  trigger: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const Chorus = createWorkletConstructor<ChorusWorkletNode, ChorusInputs>(
  {
    processorName: "ChorusProcessor",
    paramNames: ["trigger"],
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    }),
  }
);
