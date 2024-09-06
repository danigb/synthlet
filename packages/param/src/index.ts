import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { ParamScaleType } from "./dsp";

export const registerParamWorklet = createRegistrar("PARAM", PROCESSOR);

export type ParamInputs = {
  scale?: ParamInput;
  input?: ParamInput;
  offset?: ParamInput;
  min?: ParamInput;
  max?: ParamInput;
};

export type ParamWorkletNode = AudioWorkletNode & {
  scale: AudioParam;
  input: AudioParam;
  offset: AudioParam;
  min: AudioParam;
  max: AudioParam;
  dispose(): void;
};

export const createParamNode = createWorkletConstructor<
  ParamWorkletNode,
  ParamInputs
>({
  processorName: "ParamProcessor",
  paramNames: ["scale", "input", "offset", "min", "max"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});
