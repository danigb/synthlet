import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerImpulseWorkletOnce = createRegistrar("IMPULSE", PROCESSOR);

export type ImpulseInputParams = {
  trigger: ParamInput;
};

export type ImpulseWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const createImpulseNode = createWorkletConstructor<
  ImpulseWorkletNode,
  ImpulseInputParams
>({
  processorName: "ImpulseProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
