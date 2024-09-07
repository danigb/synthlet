import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type ClockInputs = {
  bpm: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
};

export const Clock = createWorkletConstructor<ClockWorkletNode, ClockInputs>({
  processorName: "ClockWorkletProcessor",
  paramNames: ["bpm"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const registerClockWorklet = createRegistrar("CLOCK", PROCESSOR);
