import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { LfoType } from "./dsp";

export type LfoInputs = {
  type?: ParamInput;
  frequency?: ParamInput;
  gain?: ParamInput;
  offset?: ParamInput;
};

export type LfoWorklet = AudioWorkletNode & {
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
  type: AudioParam;
  dispose(): void;
};

export const registerLfoWorklet = createRegistrar("LFO", PROCESSOR);
export const createLfoNode = createWorkletConstructor<LfoWorklet, LfoInputs>({
  processorName: "LfoProcessor",
  paramNames: ["type", "frequency", "gain", "offset"] as const,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

const op = (inputs?: LfoInputs) => {
  let node: LfoWorklet;
  return (context: AudioContext) => {
    return (node ??= createLfoNode(context, inputs));
  };
};

export const Lfo = Object.assign(op, {});
