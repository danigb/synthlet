import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { ParamScaleType } from "./dsp";
import { PARAMS } from "./params";
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
  descriptors: PARAMS,
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
  lin: (
    context: AudioContext,
    input: ParamInput,
    min: ParamInput,
    max: ParamInput
  ) => Create(context, { scale: ParamScaleType.Linear, input, min, max }),
  mul: (context: AudioContext, input: ParamInput, gain: ParamInput) =>
    Create(context, { input, gain }),
  inv: (context: AudioContext, value: ParamInput) =>
    Create(context, { input: value, gain: -1 }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
