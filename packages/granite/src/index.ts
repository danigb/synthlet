import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerGraniteWorklet = createRegistrar("GRANITE", PROCESSOR);

export type GraniteInputs = {
  wet?: ParamInput;
  frequency?: ParamInput;
  density?: ParamInput;
  spread?: ParamInput;
};

export type GraniteWorkletNode = AudioWorkletNode & {
  wet: AudioParam;
  frequency: AudioParam;
  density: AudioParam;
  spread: AudioParam;
  dispose(): void;
};

export const Granite = createWorkletConstructor<
  GraniteWorkletNode,
  GraniteInputs
>({
  processorName: "GraniteProcessor",
  paramNames: ["wet", "frequency", "density", "spread"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  }),
});
