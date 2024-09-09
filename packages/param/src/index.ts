import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { ParamScaleType } from "./dsp";
import { PROCESSOR } from "./processor";

export { ParamScaleType } from "./dsp";

export const registerParamWorklet = createRegistrar("PARAM", PROCESSOR);

export type ParamInputs = {
  scale?: ParamInput;
  input?: ParamInput;
  offset?: ParamInput;
  min?: ParamInput;
  max?: ParamInput;
  gain?: ParamInput;
  mod?: ParamInput;
};

export type ParamWorkletNode = AudioWorkletNode & {
  scale: AudioParam;
  input: AudioParam;
  offset: AudioParam;
  min: AudioParam;
  max: AudioParam;
  gain: AudioParam;
  mod: AudioParam;
  dispose(): void;
};

const Create = createWorkletConstructor<ParamWorkletNode, ParamInputs>({
  processorName: "ParamProcessor",
  paramNames: ["scale", "input", "offset", "min", "max", "gain", "mod"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const Param = Object.assign(Create, {
  input: (context: AudioContext, value?: ParamInput) =>
    Create(context, { input: value }),
  db: (context: AudioContext, db: ParamInput) =>
    Create(context, { scale: ParamScaleType.DbToGain, input: db }),
  inv: (context: AudioContext, value: ParamInput) =>
    Create(context, { input: value, gain: -1 }),
});
