import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export type ClockInputs = {
  bpm: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
};

export const Clock = createWorkletConstructor<ClockWorkletNode, ClockInputs>({
  processorName: "ClockWorkletProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const registerClockWorklet = createRegistrar("CLOCK", PROCESSOR);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
