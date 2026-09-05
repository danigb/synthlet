import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export const registerKarplusStrongWorklet = createRegistrar(
  "KS-OSC",
  PROCESSOR,
);

export type KarplusStrongInputs = {
  trigger: ParamInput;
  frequency: ParamInput;
  decay: ParamInput;
  brightness: ParamInput;
  level: ParamInput;
  dynamics: ParamInput;
  position: ParamInput;
  pickAngle: ParamInput;
};

export type KarplusStrongWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  frequency: AudioParam;
  decay: AudioParam;
  brightness: AudioParam;
  level: AudioParam;
  dynamics: AudioParam;
  position: AudioParam;
  pickAngle: AudioParam;
  dispose(): void;
};

export const KarplusStrong = createWorkletConstructor<
  KarplusStrongWorkletNode,
  KarplusStrongInputs
>({
  processorName: "KsProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
