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
  damping: ParamInput;
};

export type KarplusStrongWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  frequency: AudioParam;
  damping: AudioParam;
  dispose(): void;
};

export const KarplusStrong = createWorkletConstructor<
  KarplusStrongWorkletNode,
  KarplusStrongInputs
>({
  processorName: "KsProcessor",
  paramNames: ["trigger", "frequency", "damping"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
