import {
  Connector,
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

export const createClockNode = createWorkletConstructor<
  ClockWorkletNode,
  ClockInputs
>({
  processorName: "ClockWorkletProcessor",
  paramNames: ["bpm"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const registerClockWorklet = createRegistrar("CLOCK", PROCESSOR);

const op = (params?: ClockInputs): Connector<ClockWorkletNode> => {
  let node: ClockWorkletNode;
  return (context: AudioContext) => {
    node ??= createClockNode(context, params);
    return node;
  };
};

export const Clock = Object.assign(op, {
  bpm: (bpm: ParamInput, params?: ClockInputs) => op({ bpm, ...params }),
});
