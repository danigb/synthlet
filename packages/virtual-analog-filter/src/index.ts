import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerVirtualAnalogFilterWorklet = createRegistrar(
  "VAF",
  PROCESSOR
);

export type VirtualAnalogFilterInputs = {
  type: ParamInput;
  frequency: ParamInput;
  Q: ParamInput;
};

export type VirtualAnalogFilterWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  Q: AudioParam;
  dispose(): void;
};

export const VirtualAnalogFilter = createWorkletConstructor<
  VirtualAnalogFilterWorkletNode,
  VirtualAnalogFilterInputs
>({
  processorName: "VAFProcessor",
  paramNames: ["type", "frequency", "Q"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
