import {
  Connector,
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

export const registerClockWorkletOnce = createRegistrar(PROCESSOR);

const op = (params?: ClockInputParams): Connector<ClockWorkletNode> => {
  let node: ClockWorkletNode;
  return (context: AudioContext) => {
    node ??= createClockNode(context, params);
    return node;
  };
};

export const Clock = op;
