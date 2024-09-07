import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerImpulseWorklet = createRegistrar("IMPULSE", PROCESSOR);

export type ImpulseInputs = {
  trigger: ParamInput;
};

export type ImpulseWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const Impulse = createWorkletConstructor<
  ImpulseWorkletNode,
  ImpulseInputs
>({
  processorName: "ImpulseProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
