import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerGraniteWorklet = createRegistrar("GRANITE", PROCESSOR);

export type GraniteInputs = {
  wet?: ParamInput;
};

export type GraniteWorkletNode = AudioWorkletNode & {
  wet: AudioParam;
  dispose(): void;
};

export const Granite = createWorkletConstructor<
  GraniteWorkletNode,
  GraniteInputs
>({
  processorName: "GraniteProcessor",
  paramNames: ["wet"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  }),
});
