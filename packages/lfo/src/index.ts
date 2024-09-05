import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type { LfoType } from "./dsp";

export type LfoInputParams = {
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

export const registerLfoWorkletOnce = createRegistrar("LFO", PROCESSOR);
export const createLfoNode = createWorkletConstructor<
  LfoWorklet,
  LfoInputParams
>({
  processorName: "LfoProcessor",
  paramNames: ["type", "frequency", "gain", "offset"] as const,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
