import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { StateVariableFilterType } from "./dsp";

export type StateVariableFilterInputs = {
  type?: ParamInput;
  frequency?: ParamInput;
  resonance?: ParamInput;
};

export type StateVariableFilterWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  resonance: AudioParam;
  dispose(): void;
};

export const registerStateVariableFilterWorklet = createRegistrar(
  "SVF",
  PROCESSOR
);

export const StateVariableFilter = createWorkletConstructor<
  StateVariableFilterWorkletNode,
  StateVariableFilterInputs
>({
  processorName: "StateVariableFilterWorkletProcessor",
  paramNames: ["type", "frequency", "resonance"],
  workletOptions() {
    return { numberOfInputs: 1, numberOfOutputs: 1 };
  },
});
