import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerKarplusStrongOscillatorWorklet = createRegistrar(
  "KS-OSC",
  PROCESSOR
);

export type KarplusStrongOscillatorInputs = {
  trigger: ParamInput;
};

export type KarplusStrongOscillatorWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const KarplusStrongOscillator = createWorkletConstructor<
  KarplusStrongOscillatorWorkletNode,
  KarplusStrongOscillatorInputs
>({
  processorName: "KsProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
