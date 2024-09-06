import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { PolyblepWaveformType } from "./dsp";

export type PolyblepOscillatorInputParams = {
  type: ParamInput;
  frequency: ParamInput;
};

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  dispose(): void;
};

export const registerPolyblepOscillatorWorklet = createRegistrar(
  "POLY_BLEP",
  PROCESSOR
);

export const createPolyblepOscillatorNode = createWorkletConstructor<
  PolyblepOscillatorWorkletNode,
  PolyblepOscillatorInputParams
>({
  processorName: "PolyBLEProcessor",
  paramNames: ["type", "frequency"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
