import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { ParamType } from "./dsp";

export const registerParamWorkletOnce = createRegistrar("PARAM", PROCESSOR);

export type ParamInputParams = {
  type: ParamInput;
  input: ParamInput;
  min: ParamInput;
  max: ParamInput;
};

export type ParamWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  input: AudioParam;
  min: AudioParam;
  max: AudioParam;
  dispose(): void;
};

export const createParamNode = createWorkletConstructor<
  ParamWorkletNode,
  ParamInputParams
>({
  processorName: "ParamProcessor",
  paramNames: ["type", "input", "min", "max"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});
