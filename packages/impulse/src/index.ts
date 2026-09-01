import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
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
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export { disposable } from "./_worklet";
export type {
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
