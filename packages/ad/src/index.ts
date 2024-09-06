import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerAdWorklet = createRegistrar("AD", PROCESSOR);

export type AdWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  dispose(): void;
};

export type AdParamInputs = {
  trigger: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
  offset: ParamInput;
  gain: ParamInput;
};

export const createAdNode = createWorkletConstructor<
  AdWorkletNode,
  AdParamInputs
>({
  processorName: "AdProcessor",
  paramNames: ["trigger", "attack", "decay", "offset", "gain"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

// Operator
export const Ad = (inputs: AdParamInputs) => (context: AudioContext) =>
  createAdNode(context, inputs);
