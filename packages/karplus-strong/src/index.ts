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
  feedback: ParamInput;
};

export type KarplusStrongWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  frequency: AudioParam;
  feedback: AudioParam;
  dispose(): void;
};

export const KarplusStrong = createWorkletConstructor<
  KarplusStrongWorkletNode,
  KarplusStrongInputs
>({
  processorName: "KsProcessor",
  paramNames: ["trigger", "frequency", "feedback"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
