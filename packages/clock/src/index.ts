import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type ClockInputParams = {
  bpm: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
};

export const createClockNode = createWorkletConstructor<
  ClockWorkletNode,
  ClockInputParams
>({
  processorName: "ClockWorkletProcessor",
  paramNames: ["bpm"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const registerClockWorkletOnce = createRegistrar("CLOCK", PROCESSOR);
