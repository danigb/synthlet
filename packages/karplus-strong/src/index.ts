import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerKarplusStrongWorklet = createRegistrar(
  "KS-OSC",
  PROCESSOR
);

export type KarplusStrongInputs = {
  trigger: ParamInput;
  frequency: ParamInput;
  decay: ParamInput;
};

export type KarplusStrongWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  frequency: AudioParam;
  decay: AudioParam;
  dispose(): void;
};

export const KarplusStrong = createWorkletConstructor<
  KarplusStrongWorkletNode,
  KarplusStrongInputs
>({
  processorName: "KsProcessor",
  paramNames: ["trigger", "frequency", "decay"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
