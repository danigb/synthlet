import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { PolyblepOscillatorType } from "./dsp";

export type PolyblepOscillatorInputs = {
  type?: ParamInput;
  frequency?: ParamInput;
  detune?: ParamInput;
};

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  detune: AudioParam;
  dispose(): void;
};

export const registerPolyblepOscillatorWorklet = createRegistrar(
  "POLY_BLEP",
  PROCESSOR
);

export const PolyblepOscillator = createWorkletConstructor<
  PolyblepOscillatorWorkletNode,
  PolyblepOscillatorInputs
>({
  processorName: "PolyBLEProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export { disposable } from "./_worklet";
export type {
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
