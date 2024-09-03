import { createRegistrar, createWorkletConstructor } from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerNoiseWorkletOnce = createRegistrar("NOISE", PROCESSOR);
export const createNoiseNode = createWorkletConstructor({
  processorName: "NoiseWorkletProcessor",
  paramNames: [],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
